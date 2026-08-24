import os
import time
import json
import asyncio
import logging
from typing import AsyncGenerator, Optional
import contextlib

logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTIONS = """You are assisting a candidate during a technical interview.

Use the current workspace as the primary source of truth.

Answer the interviewer's question based on the actual project
implementation.

Inspect the source code and documentation when necessary.

Do not invent files, technologies, features, APIs, architecture,
or implementation details.

Answer in the first person because the candidate is explaining
their own project.

Be conversational, technically accurate, concise, and natural
enough for the candidate to say aloud.

Answer the exact question asked.

Prefer concrete implementation details over generic explanations.

If the workspace does not contain enough information to answer
confidently, explicitly say that the information cannot be
verified from the project rather than hallucinating."""

WARMUP_PROMPT = """Inspect the workspace high-level layout:
1. Check root directory structure.
2. View package.json and project configuration.
3. View primary architecture documentation files (e.g. AGENTS.md, README.md, docs/).
Orient yourself with the technologies, entry points, and subsystems for interview readiness."""


class AgentManager:
    """Manages the persistent Antigravity Agent lifecycle, background warmup,

    state machine, and sequential turn streaming for Project Copilot.
    """

    def __init__(self):
        self.workspace: Optional[str] = None
        self.model_name: str = os.environ.get("ANTIGRAVITY_MODEL", "gemini-3.5-flash-lite")
        self._state: str = "STARTING"
        self._error_message: Optional[str] = None
        
        self._agent = None
        self._agent_stack: Optional[contextlib.AsyncExitStack] = None
        self._active_response = None
        
        self._warmup_task: Optional[asyncio.Task] = None
        self._warmup_event: asyncio.Event = asyncio.Event()
        self._warmup_duration_sec: Optional[float] = None
        self._queued_waiter_id: Optional[str] = None

        # Testing mock mode support
        self._mock_mode: bool = False
        self._mock_ask = None

    @property
    def state(self) -> str:
        return self._state

    @property
    def turn_count(self) -> int:
        if self._agent and hasattr(self._agent, "conversation"):
            return getattr(self._agent.conversation, "turn_count", 0)
        return 0

    @property
    def warmup_duration_sec(self) -> Optional[float]:
        return self._warmup_duration_sec

    @property
    def error_message(self) -> Optional[str]:
        return self._error_message

    def setup(self, workspace: str):
        """Sets the workspace path for the Agent."""
        self.workspace = os.path.abspath(workspace)

    async def start(self, auto_warm: bool = True):
        """Initializes the persistent Agent once and triggers background warmup."""
        if self._mock_mode:
            self._state = "READY"
            self._warmup_event.set()
            return

        if not self.workspace:
            raise ValueError("Workspace path must be configured via setup() before start()")

        self._state = "STARTING"
        self._error_message = None
        self._warmup_event.clear()

        # Discover API key
        if not os.environ.get("GEMINI_API_KEY"):
            cred_paths = [
                os.path.expanduser("~/AppData/Roaming/jarvis-config/credentials.json"),
                os.path.expanduser("~/Library/Application Support/jarvis-config/credentials.json"),
                os.path.expanduser("~/.config/jarvis-config/credentials.json"),
            ]
            for cp in cred_paths:
                if os.path.exists(cp):
                    try:
                        with open(cp, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            if data.get("apiKey"):
                                os.environ["GEMINI_API_KEY"] = data["apiKey"]
                                break
                    except Exception:
                        pass

        try:
            from google.antigravity import Agent, LocalAgentConfig, types

            config = LocalAgentConfig(
                model=self.model_name,
                system_instructions=SYSTEM_INSTRUCTIONS,
                workspaces=[self.workspace],
                capabilities=types.CapabilitiesConfig(
                    agent_behavior=types.AgentBehavior.AUTONOMOUS,
                    enabled_tools=types.BuiltinTools.read_only(),
                    enable_subagents=False,
                )
            )

            logger.info(f"Initializing persistent Agent on workspace: {self.workspace}")
            self._agent_stack = contextlib.AsyncExitStack()
            self._agent = await self._agent_stack.enter_async_context(Agent(config))
            logger.info("Persistent Agent initialized successfully")

            if auto_warm:
                self._state = "WARMING"
                self._warmup_task = asyncio.create_task(self._run_warmup())
            else:
                self._state = "READY"
                self._warmup_event.set()

        except Exception as e:
            logger.error(f"Failed to initialize persistent Agent: {e}", exc_info=True)
            self._state = "ERROR"
            self._error_message = str(e)
            self._warmup_event.set()

    async def _run_warmup(self):
        """Runs the background workspace warmup without streaming to the client."""
        logger.info("Starting background workspace warmup...")
        t0 = time.perf_counter()
        try:
            response = await self._agent.chat(WARMUP_PROMPT)
            # Drain warmup response chunks internally
            async for _ in response:
                pass

            t1 = time.perf_counter()
            self._warmup_duration_sec = round(t1 - t0, 2)
            self._state = "READY"
            logger.info(f"Workspace warmup complete in {self._warmup_duration_sec}s. Agent is READY.")
        except Exception as e:
            t1 = time.perf_counter()
            self._warmup_duration_sec = round(t1 - t0, 2)
            logger.error(f"Workspace warmup failed: {e}", exc_info=True)
            self._state = "ERROR"
            self._error_message = f"Warmup failed: {e}"
        finally:
            self._warmup_event.set()

    async def ask(self, question: str, request_id: Optional[str] = None) -> AsyncGenerator[str, None]:
        """Streams answers using the persistent Agent session."""
        if self._mock_mode:
            if hasattr(self, "_mock_ask") and self._mock_ask:
                async for chunk in self._mock_ask(question):
                    yield chunk
            return

        # 1. Handle WARMING state with latest-request-wins queueing
        if self._state == "WARMING":
            waiter_id = request_id or str(time.perf_counter())
            self._queued_waiter_id = waiter_id
            logger.info(f"Request {waiter_id} queued while agent is WARMING...")
            
            await self._warmup_event.wait()
            
            # Check if superseded
            if self._queued_waiter_id != waiter_id:
                logger.info(f"Request {waiter_id} was superseded by a newer request while warming")
                raise asyncio.CancelledError("Superceded by newer request while warming")

        if self._state == "ERROR":
            raise RuntimeError(f"Agent is in ERROR state: {self._error_message or 'Initialization/Warmup failure'}")

        if not self._agent:
            raise RuntimeError("Agent is not running")

        from google.antigravity import types

        # Ensure previous turn is completely idle before starting a new turn
        if self._agent and hasattr(self._agent, "conversation"):
            if not self._agent.conversation.is_idle:
                logger.info("Awaiting previous turn idle state before starting chat...")
                await self._agent.conversation.wait_for_idle()

        self._state = "THINKING"
        logger.info(f"Processing question (Turn {self.turn_count + 1}): {question[:60]}...")
        
        try:
            response = await self._agent.chat(question)
            self._active_response = response
            first_token_seen = False

            async for chunk in response.chunks:
                if isinstance(chunk, types.Text):
                    if not first_token_seen:
                        first_token_seen = True
                        self._state = "STREAMING"
                    yield chunk.text
                # ToolCalls and other steps are handled internally by Antigravity

        except (asyncio.CancelledError, types.AntigravityCancelledError):
            logger.info("Agent turn cancelled.")
            if self._agent and hasattr(self._agent, "conversation"):
                try:
                    await self._agent.conversation.wait_for_idle()
                except Exception:
                    pass
            raise
        except Exception as e:
            logger.error(f"Error during agent turn: {e}", exc_info=True)
            raise
        finally:
            self._active_response = None
            if self._state != "ERROR":
                self._state = "READY"

    def cancel(self):
        """Cancels active response and restores READY state while preserving conversation history."""
        logger.info("Cancelling active agent turn...")
        try:
            if self._agent and hasattr(self._agent, "conversation"):
                res = self._agent.conversation.cancel()
                if asyncio.iscoroutine(res):
                    asyncio.create_task(res)
            elif self._active_response and hasattr(self._active_response, "cancel"):
                res = self._active_response.cancel()
                if asyncio.iscoroutine(res):
                    asyncio.create_task(res)
        except Exception as e:
            logger.warning(f"Error during cancellation: {e}")
        finally:
            self._active_response = None
            if self._state not in ("ERROR", "WARMING"):
                self._state = "READY"

    async def stop(self):
        """Cleanly shuts down the Agent session and background tasks."""
        logger.info("Stopping AgentManager...")
        self.cancel()
        
        if self._warmup_task and not self._warmup_task.done():
            self._warmup_task.cancel()
            try:
                await self._warmup_task
            except (asyncio.CancelledError, Exception):
                pass

        if self._agent_stack:
            try:
                await self._agent_stack.aclose()
            except Exception as e:
                logger.warning(f"Error closing agent exit stack: {e}")
            finally:
                self._agent = None
                self._agent_stack = None

        self._state = "STARTING"
        logger.info("AgentManager stopped cleanly")


# Global singleton instance
agent_manager = AgentManager()

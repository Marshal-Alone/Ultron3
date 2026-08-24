import os
import asyncio
import logging
from typing import AsyncGenerator

logger = logging.getLogger(__name__)

# System instructions from prompt
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

class AgentClient:
    def __init__(self):
        self.workspace = None
        self._active_response = None
        # We store this to detect if we're in a test mock
        self._mock_responses = None

    def setup(self, workspace: str):
        self.workspace = os.path.abspath(workspace)

    def cancel(self):
        if self._active_response and hasattr(self._active_response, 'cancel'):
            logger.info("Cancelling active agent response")
            try:
                self._active_response.cancel()
            except Exception as e:
                logger.warning(f"Error while cancelling active response: {e}")
        self._active_response = None

    async def ask(self, question: str) -> AsyncGenerator[str, None]:
        # For testing purposes, if mock is injected
        if getattr(self, '_mock_mode', False):
            if hasattr(self, '_mock_ask'):
                async for chunk in self._mock_ask(question):
                    yield chunk
            return

        import json
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

        from google.antigravity import Agent, LocalAgentConfig, types

        model_name = os.environ.get("ANTIGRAVITY_MODEL", "gemini-3.5-flash-lite")
        
        config = LocalAgentConfig(
            model=model_name,
            system_instructions=SYSTEM_INSTRUCTIONS,
            workspaces=[self.workspace],
            capabilities=types.CapabilitiesConfig(
                agent_behavior=types.AgentBehavior.AUTONOMOUS,
                enabled_tools=types.BuiltinTools.read_only(),
                enable_subagents=False,
            )
        )

        try:
            async with Agent(config) as agent:
                response = await agent.chat(question)
                self._active_response = response
                
                async for chunk in response:
                    yield chunk

        except Exception as e:
            logger.error(f"Agent error: {e}")
            raise
        finally:
            self._active_response = None


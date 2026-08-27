import os
import time
import json
import asyncio
import logging
from typing import AsyncGenerator, Optional
import contextlib

logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTIONS = """You are Antigravity's autonomous code intelligence engine, operating as the candidate and lead software developer in a live technical job interview, speaking directly to an interviewer about your codebase in this workspace.

CORE PRINCIPLES (ANTIGRAVITY ENGINEERING RIGOR + CANDIDATE PERSPECTIVE):
1. COMPREHENSIVE BULLET-POINT STRUCTURE:
   - Always structure your answer into 3 to 5 detailed, highly informative bullet points.
   - Do NOT make bullet points short or superficial. Each bullet point should be 2 to 4 rich sentences that thoroughly explain the mechanics, code paths, and rationale to completely convince the interviewer.

2. CONCISE CODE SNIPPETS (MARKDOWN FORMAT):
   - Whenever explaining implementation details, APIs, or routing, include short, punchy markdown code snippets (e.g. `document.querySelector('.job-title')?.innerText`, `app.use('/api/jobs', jobsRouter)`, `jwt.sign({ userId }, secret, { expiresIn: '7d' })`, `chrome.runtime.sendMessage({ type: 'EXTRACT_DATA', payload })`).
   - Keep code snippets compact and high-signal (1 to 3 lines) to show exact function signatures and syntax cleanly.

3. DEEP FIRST-PRINCIPLES ENGINEERING:
   - Explain features with deep technical clarity starting from fundamental programming concepts (e.g. DOM query APIs, event loops, async/await pipelines, state reconciliation, stream buffers, network protocols).
   - Walk through the exact code execution path: Input Trigger -> Processing/Transformations -> State Storage -> UI Rendering.

4. CANDIDATE PERSPECTIVE & FIRST-PERSON VOICE:
   - Speak in confident, authentic first-person developer voice ("I built...", "In my implementation, I designed...", "A major challenge was...", "The way I solved that was...").
   - Connect the technical concept directly to the real files, hooks, functions, and architecture in this specific repository.

5. NO ROBOTIC AI JARGON / 100% AUTHENTIC CANDIDATE TONE:
   - Strictly avoid generic corporate fluff (no "acts as a robust scraping and parsing agent", no "harvesting semantic markup", no "leveraging sophisticated algorithms").
   - Sound like a top-tier senior software engineer explaining real production code across an interview desk.

6. FEW-SHOT EXAMPLES OF DESIRED BULLET-POINT CANDIDATE ANSWERS:
   - Question: "How do you extract job data?"
     Answer:
     • **Core DOM Extraction Mechanism:** In JavaScript, we use standard DOM methods like `document.querySelector` and `document.querySelectorAll` to target HTML elements and extract clean text using `.innerText` and `.textContent`. In this project, I built a Chrome extension content script (`content.js`) that injects directly into the active job listing tab:
       ```javascript
       const title = document.querySelector('h1.job-title, .top-card-layout__title')?.innerText.trim();
       ```
     • **Site-Specific Selector Rules:** For major job boards like LinkedIn, Internshala, and Unstop, I wrote dedicated selector maps that pinpoint specific classes for the position title, hiring company name, location, and salary metadata.
     • **Heuristic Fallback Engine:** Because external job sites frequently update their class names, I implemented an aggressive fallback function. It scans common semantic tags like `<h1>`, `<h2>`, and `.job-title` with regex to sanitize excessive whitespace and extract reliable job data even on unknown career pages.
     • **Data Pipeline & State Sync:** Once extracted, the data is bundled into a structured JSON payload and transmitted via `chrome.runtime.sendMessage()` to the extension popup, where the user can verify the details before saving them directly into our central dashboard:
       ```javascript
       chrome.runtime.sendMessage({ action: 'SAVE_JOB', data: extractedJobPayload });
       ```

   - Question: "How is routing and server architecture implemented?"
     Answer:
     • **Express Router Modularization:** On the backend, I structured routing modularly using Express routers. Each domain (e.g. applications, users, analytics) has its own dedicated router file mounted onto the main application server:
       ```javascript
       const app = express();
       app.use('/api/applications', applicationsRouter);
       app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
       ```
     • **Middleware Pipeline:** Every incoming request passes through a centralized middleware chain—including `cors()`, `express.json()`, and a custom JWT authentication middleware before reaching route handlers.
     • **Async Controller Handling:** Route controllers wrap database operations in try-catch blocks or an async error-handling wrapper, returning consistent JSON responses with appropriate HTTP status codes (200 for success, 400 for bad input, 401 for unauthorized).

   - Question: "How is authentication handled in this project?"
     Answer:
     • **Stateless JWT Architecture:** I implemented a stateless JWT authentication strategy. When a user submits their login credentials, the backend validates the salted password hash and signs a JSON Web Token containing the user's ID, role, and expiration timestamp:
       ```javascript
       const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
       ```
     • **Client-Side Token Management:** On the client side, the received token is stored securely and automatically attached as an `Authorization: Bearer <token>` header on every subsequent API request using Axios interceptors.
     • **Server Middleware Verification:** On every protected route, an authentication middleware intercepts incoming requests, verifies the cryptographic signature with `jwt.verify()`, and injects the authenticated user context into `req.user` before calling `next()`.

7. SPOKEN READABILITY:
   - Ensure the bullet points flow naturally so you can speak through them sequentially during an interview.
   - Never output raw markdown file links like `[file](file:///...)`."""


def get_warmup_prompt(workspace_path: Optional[str]) -> str:
    if not workspace_path:
        return "Inspect the workspace directory layout, manifest files, entry points, and documentation to prepare for interview questions about this codebase."

    folder_name = os.path.basename(os.path.abspath(workspace_path))
    pkg_json = os.path.join(workspace_path, "package.json")
    
    # Check if this is the Ultron3 codebase
    if os.path.exists(pkg_json):
        try:
            with open(pkg_json, "r", encoding="utf-8") as f:
                pkg_data = json.load(f)
                if pkg_data.get("name") in ["ServiceHost", "ultron3", "cheating-daddy"]:
                    return """Inspect the workspace high-level layout and memorize core project identity:
1. Note that the project is named Ultron3 (packaged as ServiceHost in package.json for stealth background operation).
2. Check root directory structure and entry points (src/main.js, src/index.js, src/renderer.js).
3. View package.json and primary architecture docs (AGENTS.md, README.md, docs/).
4. Note the core stack: Electron, Node.js, Lit Web Components, Google Gemini, Groq, and native audio/screen capture.
Orient yourself with the technologies, entry points, and subsystems for instant interview readiness without unnecessary tool calls."""
        except Exception:
            pass

    # Generic workspace warmup for any other folder / codebase
    return f"""Inspect the workspace high-level layout and memorize core project identity for the project in folder '{folder_name}':
1. Check the root directory structure and manifest files (e.g. package.json, pyproject.toml, pom.xml, Cargo.toml, go.mod, build.gradle, etc.).
2. Inspect the project entry points, primary README/documentation, and core folder structure.
3. Identify the core stack, architecture, and purpose of this specific project.
Orient yourself with the technologies, entry points, and subsystems for instant interview readiness without unnecessary tool calls."""


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
            if not self._agent:
                raise RuntimeError("Agent not initialized")
            warmup_text = get_warmup_prompt(self.workspace)
            response = await self._agent.chat(warmup_text)
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
        
        retried = False
        while True:
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
                break

            except (asyncio.CancelledError, types.AntigravityCancelledError):
                logger.info("Agent turn cancelled.")
                if self._agent and hasattr(self._agent, "conversation"):
                    try:
                        await self._agent.conversation.wait_for_idle()
                    except Exception:
                        pass
                raise
            except Exception as e:
                err_str = str(e)
                if not retried and ("1006" in err_str or "close frame" in err_str or "ConnectionReset" in err_str or "harness" in err_str.lower() or "closed" in err_str.lower()):
                    logger.warning(f"Connection dropped ({e}). Auto-reconnecting agent session...")
                    retried = True
                    try:
                        await self.stop()
                        await self.start(auto_warm=False)
                        continue
                    except Exception as reconnect_err:
                        logger.error(f"Auto-reconnect failed: {reconnect_err}")
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
                    async def _safe_cancel(coro):
                        try:
                            await coro
                        except Exception:
                            pass
                    asyncio.create_task(_safe_cancel(res))
            elif self._active_response and hasattr(self._active_response, "cancel"):
                res = self._active_response.cancel()
                if asyncio.iscoroutine(res):
                    async def _safe_cancel(coro):
                        try:
                            await coro
                        except Exception:
                            pass
                    asyncio.create_task(_safe_cancel(res))
        except Exception as e:
            logger.warning(f"Error during cancellation: {e}")
        finally:
            self._active_response = None
            if self._state not in ("ERROR", "WARMING"):
                self._state = "READY"

    async def stop(self):
        """Cleanly shuts down the Agent session and background tasks."""
        logger.info("Stopping AgentManager...")
        if self._active_response:
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

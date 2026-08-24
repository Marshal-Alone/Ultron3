# AI-QUICK-CONTEXT (Entry Point)

**WELCOME EXTERNAL AI AGENT.**

This repository (`Ultron3`) is a highly specialized, stealth-focused Electron application designed to act as a real-time copilot (and exam-helper) by capturing audio/video and securely injecting keystrokes into proctored environments.

You have been provided with an exhaustive Context Package located in the `docs/ai-context/` directory.

## How to use this documentation

Before making any modifications to the codebase, **read the document corresponding to the area you are about to touch.**

### If you are tasked with modifying...

1. **The UI, CSS, or Lit Components:**
   👉 Read `docs/ai-context/07-RENDERER-UI.md`
   *(Crucial: Do not attempt to use React hooks or React Router. It uses LitElement.)*
2. **The AI logic, Prompts, or LLM Providers:**
   👉 Read `docs/ai-context/08-AI-SYSTEM.md`
   *(Crucial: Understand the dual-routing between Gemini Live WebSocket and Groq SSE.)*
3. **Audio Capture or Voice Activity Detection:**
   👉 Read `docs/ai-context/09-AUDIO-SYSTEM.md`
   *(Crucial: macOS uses a custom compiled Swift binary. Do not break the stdout piping.)*
4. **Screen Capture or OCR:**
   👉 Read `docs/ai-context/10-SCREEN-VISION.md`
   *(Crucial: Understand the 3-stage chain-of-thought vision pipeline.)*
5. **Auto-Typing or Stealth Features:**
   👉 Read `docs/ai-context/11-INVIGILATOR-MODE.md`
   *(Crucial: Keyboard injection relies on a compiled C# binary using User32.dll `SendInput`. Do not replace this with JS libraries.)*
6. **Storage, Config, or History:**
   👉 Read `docs/ai-context/12-STORAGE-AND-CONFIG.md`
7. **Electron Main Process, IPC, or Global Shortcuts:**
   👉 Read `docs/ai-context/05-MAIN-PROCESS.md` & `06-PRELOAD-IPC.md`
   *(Crucial: The app runs with `nodeIntegration: true` and `contextIsolation: false`. Do not attempt to use `contextBridge`.)*

### Dependency Warning

Before deleting or moving a file, check `docs/ai-context/23-CROSS-FILE-DEPENDENCIES.md` to ensure you are not breaking a hidden IPC link between the Renderer and Main process.

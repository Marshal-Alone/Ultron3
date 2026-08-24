# Ultron3 AI Context Package Index

This directory (`docs/ai-context/`) contains the complete, verified, code-level documentation for the Ultron3 repository. 

**ATTENTION AI AGENTS:** Do not rely on external assumptions or basic READMEs. This documentation reflects the *actual, current implementation* of the repository.

## Documentation Index

### Core Architecture
- `04-FILE-CATALOG.md`: Complete inventory of all files.
- `05-MAIN-PROCESS.md`: Node.js backend, Electron lifecycle, and Global Shortcuts.
- `06-PRELOAD-IPC.md`: Registry of all IPC channels bypassing Context Isolation.
- `07-RENDERER-UI.md`: Web Component (Lit) architecture and theming.

### AI & Media Pipelines
- `08-AI-SYSTEM.md`: Gemini Live WebSocket and Groq high-speed LPU routing.
- `09-AUDIO-SYSTEM.md`: SystemAudioDump, Loopback, and VAD (Voice Activity Detection).
- `10-SCREEN-VISION.md`: Hidden WebRTC capture and Multi-Stage reasoning.

### Specialized Features
- `11-INVIGILATOR-MODE.md`: Stealth execution and C# Windows API keyboard injection.
- `12-STORAGE-AND-CONFIG.md`: File-system based state and preference caching.

### Advanced Mappings
- `23-CROSS-FILE-DEPENDENCIES.md`: Complete dependency graph to track side-effects before modifying code.

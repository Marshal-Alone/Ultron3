# File Catalog

This document categorizes every single file in the repository (excluding `node_modules` and `.git`). It ensures 100% coverage of the codebase.

## Root Directory

| File | Status | Purpose |
|------|--------|---------|
| `package.json` | ACTIVE | Defines project dependencies, scripts, and Electron Forge configuration. |
| `package-lock.json` | ACTIVE | Dependency lockfile. |
| `forge.config.js` | ACTIVE | Electron Forge configuration for packaging the app. |
| `vitest.config.js` | ACTIVE | Vitest configuration for running unit tests. |
| `entitlements.plist` | ACTIVE | macOS entitlements for code signing (needed for audio/screen capture permissions). |
| `.prettierrc` / `.prettierignore` | ACTIVE | Prettier code formatting configuration. |
| `.gitignore` | ACTIVE | Git ignore rules. |
| `AGENTS.md` | ACTIVE | Core developer guidelines, plans for Shadcn UI, and repo style guide. |
| `INVIGILATOR_MODE.md` | ACTIVE | Architectural design document for the stealth exam feature. |
| `README.md` | ACTIVE | Main project documentation. |
| `plan.md` | LEGACY/UNUSED | Old planning document. |
| `analyze prompt.md` | EXPERIMENTAL | Contains prompt snippets or scratchpad notes. |
| `test.txt` | UNUSED | Scratch file. |
| `LICENSE` | ACTIVE | Project license. |

## `src/` Directory

### Main Process & Entry Points
| File | Status | Purpose |
|------|--------|---------|
| `src/index.js` | ACTIVE | Main Process entry point. Handles app lifecycle, IPC endpoints, and tray/window creation. |
| `src/preload.js` | ACTIVE | Preload script. Exposes safe APIs to renderer (currently very minimal). |
| `src/storage.js` | ACTIVE | Local JSON-based storage manager for settings, API keys, and history. |
| `src/audioUtils.js` | ACTIVE | Core audio processing: PCM conversion, VAD, resampling. |

### UI & Renderer (`src/components/`)
| File | Status | Purpose |
|------|--------|---------|
| `src/index.html` | ACTIVE | HTML entry point for the renderer. Loads Lit components. |
| `src/components/index.js` | ACTIVE | Registers Lit components. |
| `src/components/app/CheatingDaddyApp.js` | ACTIVE | Main application container (LitElement). Manages view routing and IPC listeners. |
| `src/components/app/AppHeader.js` | ACTIVE | Custom draggable window header and basic controls. |
| `src/components/views/MainView.js` | ACTIVE | Dashboard view to start sessions. |
| `src/components/views/AssistantView.js` | ACTIVE | The active chat/transcription interface. |
| `src/components/views/CustomizeView.js` | ACTIVE | Settings interface (API keys, preferences). |
| `src/components/views/HistoryView.js` | ACTIVE | Displays past session logs and screenshots. |
| `src/components/views/HelpView.js` | ACTIVE | Documentation and shortcut reference. |
| `src/components/views/OnboardingView.js` | ACTIVE | Initial setup wizard. |
| `src/components/views/InvigilatorPreviewView.js` | ACTIVE | Previews captured code before auto-typing. |

### Utilities & Services (`src/utils/`)
| File | Status | Purpose |
|------|--------|---------|
| `src/utils/ai.js` | ACTIVE | Router that decides whether to use Gemini or Groq based on config/availability. |
| `src/utils/gemini.js` | ACTIVE | Deep integration with Gemini 2.0 Flash Live. Handles WebSockets, native audio, and vision. |
| `src/utils/groq.js` | ACTIVE | High-speed Groq API integration for quick text generation. |
| `src/utils/prompts.js` | ACTIVE | System prompts and role definitions (Interview, Sales, etc.). |
| `src/utils/promptLogger.js` | ACTIVE | Logs AI payloads for debugging. |
| `src/utils/window.js` | ACTIVE | Window creation, always-on-top logic, click-through, and **global shortcuts**. |
| `src/utils/windowResize.js` | ACTIVE | Drag-to-resize window utilities. |
| `src/utils/renderer.js` | ACTIVE | Frontend helpers. |
| `src/utils/invigilatorMode.js` | ACTIVE | State manager for Invigilator stealth mode. |
| `src/utils/autotype.js` | ACTIVE | Orchestrates keyboard simulation using C# or PowerShell. |
| `src/utils/AutoTyper.cs` | ACTIVE | C# source code for `SendInput` keyboard simulation. |
| `src/utils/AutoTyper.exe` | ACTIVE | Compiled C# binary for extreme low-latency typing. |

### Assets & Third-Party (`src/assets/`)
| File | Status | Purpose |
|------|--------|---------|
| `src/assets/*.js` | ACTIVE | Vendored libraries: `lit-core-2.7.4.min.js`, `marked-4.3.0.min.js`, `highlight-11.9.0.min.js`. |
| `src/assets/*.css` | ACTIVE | Vendored styles: `highlight-vscode-dark.min.css`. |
| `src/assets/*.png/ico/icns/svg` | ACTIVE | App icons and SVGs for onboarding. |
| `src/assets/SystemAudioDump` | ACTIVE | Compiled native macOS binary for loopback audio capture. |
| `src/assets/old/` | LEGACY | Old icons. |

### Tests (`src/__tests__/`)
| File | Status | Purpose |
|------|--------|---------|
| `*.test.js` | ACTIVE | Vitest suites for audioUtils, autotype, geminiConversation, groqThinking, invigilatorMode, prompts. |
| `src/__mocks__/electron.js` | ACTIVE | Mocking electron APIs for Vitest. |

## `proctor-rounds/` Directory
This directory appears to be a mock environment used for testing the Invigilator Mode against simulated proctoring software.
| File | Status | Purpose |
|------|--------|---------|
| `proctor-rounds/server.js` | EXPERIMENTAL | Express server to run the mock environment. |
| `proctor-rounds/public/*.html` | EXPERIMENTAL | HTML pages for Candidate, Proctor, and Lobby. |
| `proctor-rounds/public/js/*.js` | EXPERIMENTAL | Frontend scripts for the mock environment. |
| `proctor-rounds/public/css/*.css` | EXPERIMENTAL | Styles for the mock environment. |
| `proctor-rounds/package.json` | EXPERIMENTAL | Dependencies for the mock environment. |

## `VoiceImplementation/` Directory
This directory contains architectural documentation and reference implementations for building the voice pipeline. It serves as historical design docs and reference code, but is not the active execution path of `Ultron3`.
| File | Status | Purpose |
|------|--------|---------|
| `VoiceImplementation/*.md` | LEGACY/DOCS | 8 markdown files detailing the architecture of audio capture, Gemini Live, and Groq. |
| `VoiceImplementation/starter_code/*.js` | LEGACY/REF | 6 JS files providing reference implementations for the features described in the docs. |

---
*Coverage Status: 100% of discovered files outside of `node_modules` and `out/` are classified.*

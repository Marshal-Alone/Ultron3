# Ultron3 Codebase Reference

## Purpose and scope

This is a source-verified reference for the current `Ultron3` checkout. It is intended to be the practical starting point for future work: it describes what is actually wired today, where the ownership boundaries are, and which features are only partially implemented.

It was compiled from the root `AI-QUICK-CONTEXT.md`, the `docs/ai-context/` package, the active source and tests. The root quick-context file and the `docs/ai-context/` directory are currently untracked in this checkout, so this document treats the source as the final authority whenever documentation and code differ.

The project is an Electron desktop assistant that captures user-selected screen/audio media, sends that context to Gemini and/or Groq, streams answers into a Lit-based overlay, and stores session history locally. It also contains Windows-specific native input automation. That automation is a privileged platform integration and must remain isolated from ordinary UI and AI changes.

## Current technology snapshot

| Area | Current implementation |
| --- | --- |
| Runtime | Electron 30, Electron Forge 7, Node/CommonJS in the main process |
| Renderer | Lit 2.7 Web Components loaded directly from vendored assets |
| AI SDKs | `@google/genai` and the OpenAI SDK configured for Groq's compatible endpoint |
| Tests | Vitest 1.6, Node environment, with an Electron mock |
| Packaging | Forge for Windows Squirrel, macOS DMG, Linux AppImage; ASAR enabled |
| State | Synchronous local JSON files, not a database |
| Styling | Component-local CSS plus global CSS custom properties |

There is no active TypeScript, React, Tailwind, shadcn/ui, or `npm run typecheck` script. Those are future-direction notes in `AGENTS.md`, not characteristics of the active app.

## Repository layout

### Active application code

- `src/index.js` — Electron main-process entry point. Starts storage, creates the window, installs IPC handlers, owns native keyboard operations, and exports active sessions on quit.
- `src/utils/window.js` — `BrowserWindow` configuration, display-media request handler, global shortcuts, visibility/click-through control, and resize IPC.
- `src/preload.js` — only suppresses one known external-monitoring error. It does not expose a `contextBridge` API.
- `src/utils/renderer.js` — legacy renderer utility layer. Captures screen/audio, exposes `window.cheatingDaddy`, proxies storage calls through IPC, and stores incoming session updates.
- `src/components/app/CheatingDaddyApp.js` — Lit root component, view router, streamed-response state owner, and invigilator-mode coordinator.
- `src/components/views/` — all renderer views: onboarding, main/start, assistant, customize, history, help, and an unmounted preview component.
- `src/utils/gemini.js` — Gemini Live connection, transcription-to-answer routing, Gemini HTTP vision, session memory, and macOS system-audio process management.
- `src/utils/groq.js` — Groq/OpenAI-compatible streaming text and staged screenshot analysis.
- `src/utils/prompts.js` — profile prompts and final prompt construction.
- `src/storage.js` — configuration, credentials, preferences, limits, session history, screenshots, and export.
- `src/audioUtils.js` — PCM conversion, WAV/debug utilities, RMS, resampling, and a VAD class.
- `src/utils/invigilatorMode.js` and `src/utils/autotype.js` — renderer state and typed-input orchestration.
- `src/utils/AutoTyper.cs` and `src/utils/AutoTyper.exe` — compiled Windows native input helper and source.

### Supporting and non-runtime material

- `src/assets/` contains vendored Lit, Marked, Highlight.js, CSS, icons, onboarding images, and the macOS `SystemAudioDump` binary.
- `src/__tests__/` contains helper-level Vitest coverage. It does not exercise a real Electron window, OS permissions, real API calls, or packaged executables.
- `VoiceImplementation/` contains reference architecture and starter code. It is historical/reference material, not the active execution path.
- `proctor-rounds/` is an experimental Express/mock-browser environment for manual scenario testing. It is separate from the Electron app.
- `docs/ai-context/` is a detailed architecture package. It is useful background, but some paths and claims have drifted from the implementation.

## End-to-end runtime architecture

### Startup and shutdown

1. `src/index.js` applies Windows console encoding workarounds, handles Squirrel startup, and acquires Electron's single-instance lock.
2. On `app.whenReady()`, it initializes local storage, creates the main window, and registers Gemini, storage, and general IPC handlers.
3. The window loads `src/index.html`. That HTML first loads Marked and Highlight.js, then the Lit root component module, then the legacy `utils/renderer.js` script.
4. `renderer.js` exposes `window.cheatingDaddy`; Lit components call that object for capture, storage, theming, and text messaging.
5. When a user starts a session, the renderer initializes a Gemini Live session and begins screen/audio capture. The main process owns the Gemini session object, while the renderer owns browser media streams.
6. On close, Quick Stop, or normal app shutdown, the renderer stops media streams and the main process closes the Live session. `before-quit` synchronously exports a non-empty active session if it knows the session ID.

### Process ownership

| Owner | Responsibilities |
| --- | --- |
| Main process | Electron lifecycle, `BrowserWindow`, shortcuts, filesystem storage, Gemini/WebSocket state, native helper processes, external links, clipboard/native keyboard calls |
| Renderer utility layer | Browser media APIs, screen snapshots, audio chunking, JSON-storage proxies, preference cache, theme system, global `cheatingDaddy` bridge |
| Lit root | Navigation, UI/session state, streamed response array, status, invigilator state, window-size notifications |
| View components | View-specific forms, controls, rendering, and shortcut listeners |

## Main process and window behavior

### `src/index.js`

The main process retains four meaningful mutable references:

- `geminiSessionRef.current` — the active Gemini Live session, shared with audio handlers and shortcuts.
- `mainWindow` — the single overlay window.
- `activeTypingProcess` — the active native typing child process.
- `currentSessionId` — set from the renderer so quit/export logic knows which session to export.

It exposes storage getters and setters, app operations, session tracking/export, keyboard operations, and delegates all AI-specific IPC registration to `setupGeminiIpcHandlers`.

### `src/utils/window.js`

The app window is frameless, transparent, always-on-top, has no taskbar presence, supports resizing, restores persisted bounds, and is visible across workspaces/full-screen spaces. The initial click-through state is enabled after DOM readiness. On Windows it is placed at the `screen-saver` always-on-top level.

`setContentProtection(true)` is requested for the window. This is an OS/Electron best-effort capture-protection setting, not a general security boundary and not a guarantee that all capture paths will omit the window.

Electron's default session has a display-media request handler. It returns the first screen source and requests `loopback` audio, while allowing the system picker. The renderer subsequently uses `getDisplayMedia`.

The window persists `{ x, y, width, height }` to preferences when moved or resized. It validates a saved position against all displays and falls back to the top-left corner if the bounds are no longer entirely visible.

### Global shortcut features

Shortcuts are configurable and registered through `globalShortcut`. Core categories are:

- Window movement: up, down, left, right.
- Window behavior: visibility toggle, click-through toggle, focus/stealth toggle, navbar toggle, resize width/height.
- Response controls: take the next action/screenshot, previous/next response, scroll up/down, transparency/text/font adjustments.
- Session controls: listen/answer toggle, Quick Start Groq, Quick Stop, emergency erase, kill switch.
- Provider control: a fixed `Ctrl+Alt+Return` provider toggle.
- Invigilator controls: mode toggle, answer capture, confirm typing, mode cycle, pause/resume, and stop.

Global shortcut registration is centralized in `updateGlobalShortcuts()`, which first calls `globalShortcut.unregisterAll()`. Consequently, adding a shortcut must be done there, and any competing registration can affect every other shortcut.

The emergency erase hides the window, closes the Gemini session, asks the renderer to clear local data, and quits shortly afterward. The kill-switch code attempts to read a non-existent `window.electronbridge` object, so its intended export signal is not reliably sent before `process.exit(0)`.

## Renderer, UI, and theming

### Renderer bridge

`src/utils/renderer.js` runs in the renderer with direct `require('electron')` access. Its global `window.cheatingDaddy` includes:

- IPC-backed storage methods.
- `initializeGemini`, `startCapture`, `stopCapture`, and `sendTextMessage`.
- helpers that call the root Lit element for status and streamed responses.
- theme operations and a refreshable preference cache.
- platform flags for Linux and macOS.

It does **not** expose `ipcRenderer` itself or a `currentSessionId` property. Some historical UI code still assumes those properties exist.

### Root application component

`CheatingDaddyApp` maintains view routing through `currentView`; it does not use a browser router. Supported views are `onboarding`, `main`, `assistant`, `customize`, `help`, and `history`.

It also owns:

- selected profile and language;
- capture/image settings;
- status text and recording state;
- streamed response history and selected response index;
- opacity/navbar state and layout mode;
- invigilator-mode activation and typing mode.

`new-response` adds a response entry; `update-response` replaces the last response entry. Provider code therefore sends accumulated text, not deltas, on update events.

### Main/start view

The main view displays Gemini and Groq API-key fields with separate Start buttons. It writes keys as the user types and changes the `aiProvider` preference before calling the root `handleStart()`.

The root start flow currently requires a non-empty Gemini API key even if the Groq button was used. It initializes Gemini, starts media capture, clears rendered responses, switches to the assistant view, and marks recording active. This means the current app cannot start a fully Groq-only live workflow; Gemini remains the transcription transport.

### Assistant view

The assistant view renders the selected response as Markdown using the vendored Marked library and direct `innerHTML`. It uses Highlight.js assets for code styling. The view supports response navigation and scrolling shortcuts, captures a manual screenshot from its screen-answer control, displays provider/usage information, and loads daily rate-limit counts.

The text input is conditionally rendered only when `isRecording` is false, so the visible manual-text interface is unavailable during an active recording session despite the underlying text-message IPC being implemented.

### Settings/customize view

Settings are divided into profile, AI provider, appearance, audio, language, capture, keyboard, search, and advanced/data-management sections.

It can configure:

- profiles: interview, sales, meeting, presentation, negotiation, and exam;
- speech language from a large fixed locale list;
- audio mode: speaker-only, microphone-only, or both;
- screenshot image quality: high, medium, or low;
- theme, background transparency, text opacity, font size, and compact/normal layout;
- Gemini/Groq provider choice and Groq/OpenRouter key persistence;
- global keybinds;
- custom prompt, system-instruction override, developer/meta instruction, and full-system-prompt override;
- a boolean Google-search setting;
- hold-to-type preference values;
- a button labelled to clear all local data.

The view contains duplicated profile methods from older revisions. The later definitions override the earlier class methods at runtime. The clear-data UI promises to remove keys, preferences, and history, but the current storage implementation does not do that completely.

### Header, onboarding, help, history, and preview

- `AppHeader` shows navigation controls, session elapsed time, status, a sound-reactive canvas waveform, provider badge/toggle, click-through state, and an invigilator indicator. It also performs a best-effort remote update check against upstream's `package.json`.
- `OnboardingView` is a five-slide first-run flow. It offers a context text area, writes it to `customPrompt`, and sets `config.onboarded` on completion. Its animated canvas is visual only.
- `HelpView` renders support links, usage instructions, supported profiles, and the loaded/default shortcuts.
- `HistoryView` lists stored sessions, shows conversation/context/screenshot tabs, and can request deletion of all history. Its clear action currently refers to `cheatingDaddy.ipcRenderer`, which the bridge does not provide.
- `InvigilatorPreviewView` can display syntax-highlighted code and mode labels, but it is not mounted by the root component. Current capture handling stores answer text in the state manager and uses the normal window instead.

## Audio, screen capture, and vision

### Audio capture

The renderer uses browser media APIs, chunks audio as 24 kHz mono 16-bit PCM, Base64 encodes it, and emits IPC messages every approximately 100 ms. The main process forwards those chunks to Gemini Live with `audio/pcm;rate=24000`.

Platform-specific paths are:

- Windows: `getDisplayMedia` is requested with loopback audio. When present, system audio is processed; a microphone stream is added for `mic_only`, `both`, or if loopback was not returned.
- Linux: the app first attempts display-media system audio, falls back to screen-only capture, and independently tries microphone capture when requested.
- macOS: the main process starts the packaged `SystemAudioDump` executable for system audio. The renderer requests screen media with audio disabled and may add a microphone stream.

The `AudioContext`/`ScriptProcessorNode` code dispatches RMS `audio-activity` events so the header waveform can react. `src/audioUtils.js` contains `VadResampler`, RMS, and 24 kHz to 16 kHz resampling utilities, but the active capture pipeline does not instantiate the VAD or resample to 16 kHz. It streams all captured chunks at 24 kHz.

### Screenshots

The renderer keeps the user-selected display stream alive. On demand, it attaches that stream to a hidden video element, draws the current frame to an offscreen canvas, JPEG-encodes at a selected quality (`0.9`, `0.7`, or `0.5`), and sends Base64 image data plus a prompt through `send-image-content`.

There is no active periodic screenshot loop even though a screenshot interval preference exists. Capture is manual: through the Assistant control, the next-step shortcut, or invigilator-related handling.

### Screenshot prompting

Normal manual capture appends custom/developer/full-prompt preferences to a built-in screen-help prompt. A separate restricted-output prompt is selected for invigilator answer capture. The renderer leaves a global capture flag true while responses stream, and the root component stores the most recent streamed answer when that flag is set.

## AI and prompt behavior

### Gemini Live

`gemini.js` connects to `gemini-2.5-flash-native-audio-latest` through the Google GenAI SDK's v1alpha live API. Its Live config requests audio output modality, input and output transcription, two-speaker diarization, sliding-window context compression, optional Google Search tools, language selection, and the built system instruction.

Incoming transcription results are formatted as `[Interviewer]` for speaker ID 1 and `[Candidate]` for all other speaker IDs. The code collects new transcript text and triggers an answer after a 350 ms pause when the accumulated text ends in punctuation, otherwise 900 ms. A completed Live turn immediately triggers any pending answer.

If Groq is selected and a Groq key exists, Gemini stays connected for transcription but sends the transcribed question to Groq. Otherwise `geminiStreamAnswer()` uses Gemini HTTP streaming (`gemini-2.5-flash`) to produce an answer. This is the actual dual-provider division.

Unexpected Live-session closes retry up to five times with a two-second delay and inject the last valid saved conversation turns as context after reconnecting.

### Gemini HTTP vision and text

Gemini image analysis sends an inline JPEG to `gemini-2.5-flash`, streams accumulated text to the renderer, saves screen analysis, and saves a corresponding conversation turn. The plain manual-text IPC does not use `geminiStreamAnswer`; if a Live session exists it calls `sendRealtimeInput({ text })` and returns success.

### Groq

Groq uses the OpenAI SDK with base URL `https://api.groq.com/openai/v1`. It has three active operations:

- `generateAnswer()` streams conversational answers from `qwen/qwen3.6-27b` and tries to strip `<think>` blocks before display.
- `sendTextMessage()` streams text requests with `openai/gpt-oss-120b`.
- `analyzeScreenshot()` performs a three-stage sequence: image/text extraction with `qwen/qwen3.6-27b`, initial solution generation with `openai/gpt-oss-120b`, then verification with the same model.

The Groq primary-answer failure path contains a defect: it references `fallbackModel` instead of `this.fallbackModel`, so the intended `llama-3.1-8b-instant` fallback is not reliable.

### Prompts

`prompts.js` provides six profile templates. Each includes a persona introduction, response format instructions, search-use instructions, examples/content, and output instructions.

`getSystemPrompt()` builds the final prompt from the selected profile, user context, search setting, optional system override, optional developer/meta instruction, and optional full override. A full-system-prompt override replaces the modular profile prompt, while adding the custom user context if it was not already embedded.

Several call paths look up `prefs.profile`, but stored preferences use `selectedProfile`. The initial Live connection gets the selected profile from the UI directly; some later text/vision prompt paths can fall back to `interview` unintentionally. Similarly, the live Google Search tool reads browser `localStorage`, while the settings UI writes the JSON preference, so changing the visible setting does not reliably change the active Live tool configuration.

### AI module status

`src/utils/ai.js` is a clean provider-router abstraction with key-based provider fallback, but no active app code imports it. `getAvailableModel()` and `incrementLimitCount()` are likewise defined in storage and shown in the UI but are not called by current Gemini request paths.

## Storage, history, export, and privacy behavior

### Storage locations

All active persistence is synchronous JSON under `jarvis-config`:

- Windows: `%USERPROFILE%\\AppData\\Roaming\\jarvis-config`
- macOS: `~/Library/Application Support/jarvis-config`
- Linux: `~/.config/jarvis-config`

The files are:

- `config.json` — `configVersion`, `onboarded`, layout.
- `credentials.json` — Gemini, Groq, and OpenRouter API keys.
- `preferences.json` — prompts, profile/language/capture choices, theme values, audio mode, typing options, and UI state.
- `keybinds.json` — custom keybind overrides or absent/null defaults.
- `limits.json` — date and flash/flash-lite counters.
- `history/<sessionId>.json` — session profile/context, conversation history, and screen-analysis history.

API keys are stored in plaintext. There is no OS keychain/credential manager integration or encryption at rest.

### Session history

Sessions use `Date.now().toString()` as their ID. Main-process Gemini helpers keep in-memory conversation and screen-analysis arrays, send full snapshots to the renderer, and the renderer saves them back through storage IPC.

A history session normally contains:

```json
{
  "sessionId": "timestamp",
  "createdAt": 0,
  "lastUpdated": 0,
  "profile": "interview",
  "customPrompt": "optional context",
  "conversationHistory": [
    { "timestamp": 0, "transcription": "...", "ai_response": "..." }
  ],
  "screenAnalysisHistory": [
    { "timestamp": 0, "prompt": "...", "response": "...", "model": "..." }
  ]
}
```

`saveSessionScreenshot()` writes original image data and optional answer metadata below the user's Downloads `Ultron-Conversations` directory. It also tries to add a `screenshotReferences` array to the session for HistoryView.

However, `saveSession()` reconstructs the stored session using only selected fields and drops `screenshotReferences`. As a result, images can exist on disk while the history UI and export JSON no longer retain the references. This needs a schema-preserving fix before relying on screenshot history.

### Export

`exportSessionToDownloads()` creates a timestamped `conversation_*` directory below `~/Downloads/Ultron-Conversations`, writes JSON and Markdown, and copies a session screenshot directory if present. It exports conversation Q&A pairs, not a dedicated human-readable screen-analysis section.

### Clear behavior

`clearAllData()` calls `resetConfigDir()`. That routine deletes/recreates `config.json` but deliberately preserves credentials, preferences, and history. This conflicts with the advanced settings wording and emergency-clear expectation.

## Native platform integrations

### macOS system audio

`SystemAudioDump` is packaged as an extra Forge resource and launched as a child process only on macOS. The main process expects 24 kHz, 16-bit stereo PCM on stdout, downmixes to mono by retaining the left channel, and forwards chunks to Gemini. It stops the child process on session close/window close/app quit.

### Windows typed-input integration

The application has renderer orchestration plus a compiled `AutoTyper.exe` helper. The main process writes the requested text to a temporary file, runs the executable with a selected mode, allows an Escape shortcut to terminate it, and manages pause/stop files in the operating system's temporary directory.

The renderer supports char-by-char, word-by-word, line-by-line, and instant modes. The native helper uses Windows User32 input APIs. This feature is Windows-specific; there is no equivalent macOS/Linux implementation. Changes to its interface, temporary-file conventions, or process lifecycle must be treated as a native compatibility change.

`holdToTypeEnabled` and `holdToTypeKey` are stored preferences, but the active native helper does not read or enforce those settings.

## IPC contract

The application has no constrained preload API. The renderer imports Electron directly because the window is created with `nodeIntegration: true` and `contextIsolation: false`.

### Renderer to main invokes/handlers

- Storage/config: `storage:get-config`, `storage:set-config`, `storage:update-config`, `storage:get-credentials`, `storage:set-credentials`, API-key methods, preferences methods, keybind methods, session methods, `storage:get-today-limits`, and `storage:clear-all`.
- Prompt: `prompts:get-default-system-prompt`.
- Window/app: `get-app-version`, `quit-application`, `open-external`, `toggle-window-visibility`, `update-sizes`.
- AI/session: `initialize-gemini`, `send-audio-content`, `send-mic-audio-content`, `send-image-content`, `send-text-message`, `force-trigger-answer`, `start-macos-audio`, `stop-macos-audio`, `close-session`, `get-current-session`, `start-new-session`, `update-google-search-setting`.
- Keyboard/native: `keyboard:send-key-sync`, `keyboard:type-text`, `keyboard:pause-typing`, `keyboard:resume-typing`, `keyboard:kill-typing`, `keyboard:type-text-clipboard`.

### Renderer to main sends

- `send-audio-content`, `send-mic-audio-content`.
- `session-started`, `kill-switch-export`, `update-keybinds`, `ai-provider-changed-notify`, `view-changed`, `log-message`.
- `invigilator:hide-window`, `invigilator:show-window`.
- `background-opacity-changed` is sent by renderer code but no main-process listener uses it.

### Main to renderer events

- AI/status: `update-status`, `new-response`, `update-response`, `session-initializing`, `reconnect-failed`.
- Persistence: `save-session-context`, `save-conversation-turn`, `save-screen-analysis`.
- Window/shortcut: `click-through-toggled`, `navigate-previous-response`, `navigate-next-response`, `scroll-response-up`, `scroll-response-down`, `adjust-transparency`, `adjust-font-size`, `adjust-text-opacity`, `clipboard-query`, `stealth-mode-changed`, `toggle-navbar`, `quick-start-groq`, `quick-stop`.
- Invigilator: `invigilator:toggle-mode`, `invigilator:capture-answer`, `invigilator:confirm-autotype`, `invigilator:toggle-typing-mode`, `invigilator:pause-resume-typing`, `invigilator:stop-typing`.

There are redundant `update-keybinds` listeners in both `index.js` and `window.js`, and two listeners inside `window.js`. Since shortcut updates unregister all shortcuts, this duplication makes the final registration behavior sensitive to listener order.

## Security and robustness posture

The following are current technical facts, not a claim that the application is safe for a particular deployment:

- Renderer code has full Node/Electron access. A renderer compromise can invoke high-privilege IPC and filesystem/native operations.
- `index.html` permits inline scripts with a minimal CSP and includes third-party vendored libraries.
- Marked rendering sets `sanitize: false` and writes generated HTML with `innerHTML`. AI/model output is therefore treated as trusted HTML.
- Credentials and conversation contents are plaintext local files. Screenshots and exports can contain sensitive data under Downloads.
- Most IPC handlers accept renderer input without sender validation or schema validation. The generic `open-external` handler accepts any URL.
- Session IDs reach `path.join(historyDir, `${sessionId}.json`)` without explicit validation, so session/path inputs should be validated before exposing these methods to untrusted code.
- Audio, screenshot, and native helpers require real-world permission and platform validation; the unit suite does not cover those integrations.

## Packaging and platform matrix

`forge.config.js` packages the app as ASAR and includes `SystemAudioDump` plus `AutoTyper.exe` as extra resources. The packager uses `audiodg` as the product/application resource name, while `package.json` retains `ServiceHost` metadata and the UI uses Jarvis/CheatingDaddy names. This naming drift should be resolved carefully because packaging paths use `process.resourcesPath`.

| Capability | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Screen capture | Browser display media | Browser display media | Browser display media, desktop dependent |
| System audio | Electron loopback/display media | `SystemAudioDump` child process | Best-effort display media; may fall back to screen only |
| Microphone | Browser media API | Browser media API | Browser media API |
| Live transcription | Gemini Live | Gemini Live | Gemini Live |
| Native typed input | Supported by packaged Windows helper | Not implemented | Not implemented |
| Global shortcuts | Electron | Electron | Electron/window-manager dependent |

## Tests and verification

The active Vitest suite has 10 files and 59 passing tests. It covers:

- audio conversion, WAV/debug utilities, RMS, resampling, and VAD helpers;
- renderer-independent auto-typing orchestration;
- invigilator state manager transitions;
- prompt construction and default keybinds;
- Groq thinking-tag stripping;
- Gemini conversation-helper state and speaker formatting;
- Highlight.js loading from the renderer HTML.

It does not validate real Electron process startup, actual global-shortcut registration, permissions, browser media streams, Gemini/Groq network calls, session persistence across app processes, macOS audio output, Windows executable behavior, or Forge packaging.

Running the audio tests writes debug files below `C:\\Users\\marsh\\jarvis-debug` and a temporary test directory. Those are test side effects outside the repository.

## High-value maintenance guide

Before changing code, follow these ownership rules:

1. Change storage schema and history rendering together. Preserve unknown session fields when writing a session, and decide how migrations work before changing defaults or `CONFIG_VERSION`.
2. Change audio format only as a complete contract: capture sample rate/channels, Base64 conversion, Gemini MIME type, macOS helper output, and tests all need to agree.
3. Change response streaming only with the `new-response`/full-text `update-response` convention in mind. The root component replaces the final array element on updates.
4. Change global shortcuts only in `window.js` and test collisions; registration is global and reconfiguration is destructive to the existing set.
5. Keep process boundaries explicit. Renderer code currently depends on unrestricted Electron APIs, so a context-isolation migration would be an architectural project, not a local replacement.
6. Treat the native typing executable and macOS binary as versioned platform dependencies. Do not change the JavaScript invocation contract without rebuilding and manually validating the native helper.
7. Prefer repairing existing data-flow gaps before adding new surface area: provider/profile preference alignment, search setting ownership, screenshot-reference retention, clear-data semantics, and inactive rate limiting are all important correctness work.

## Documentation drift and known implementation gaps

The `docs/ai-context/` package is a useful map but should not be copied blindly. The following distinctions are important:

- The quick-context entry file is at repository root, not in `docs/ai-context/`.
- The code uses `src/assets/SystemAudioDump` and `src/utils/AutoTyper.exe`; some docs describe `src/bin/` paths.
- IPC uses `close-session`, not a documented `stop-gemini` handler.
- The screen capture interval preference is not an automated capture schedule.
- VAD, 16 kHz resampling, the generic AI router, and rate-limit incrementing are not active in the main capture/request flow.
- OpenRouter credentials are stored and displayed but no active OpenRouter request path exists.
- The component barrel `src/components/index.js` exports a non-existent `AdvancedView.js`; the active `index.html` imports the root component directly, so this currently does not block the app.
- The docs' description of clear-all data is stronger than the actual reset implementation.

## Working-tree note

At the time this reference was written, the worktree already contained user-owned modifications to `VoiceImplementation/03_DUAL_AI_GROQ_ORCHESTRATION.md` and `src/components/views/CustomizeView.js`, plus untracked AI-context documents and scratch files. This reference makes no changes to those files.

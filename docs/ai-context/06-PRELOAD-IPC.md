# Preload & IPC Architecture

This document maps the Inter-Process Communication (IPC) architecture used throughout the Ultron3 repository.

## Preload Script Bypass
> [!WARNING]
> **Context Isolation is Disabled**
> The `src/preload.js` script does *not* set up a `contextBridge`. The application runs with `nodeIntegration: true` and `contextIsolation: false`. The renderer process directly imports Electron modules via `const { ipcRenderer } = window.require('electron')`.
> 
> The sole purpose of `src/preload.js` is to suppress specific console errors caused by monitoring tools hook failures (specifically `__REACT_DEVTOOLS_GLOBAL_HOOK__`).

## Complete IPC Channel Registry

Below is the exhaustive list of IPC channels mapped across the application. 

### `src/index.js` Handlers

**Storage & Config (`storage:*`)**
- `storage:get-config` / `storage:set-config` / `storage:update-config`
- `storage:get-credentials` / `storage:set-credentials`
- `storage:get-api-key` / `storage:set-api-key` (Gemini)
- `storage:get-groq-api-key` / `storage:set-groq-api-key`
- `storage:get-openrouter-api-key` / `storage:set-openrouter-api-key`
- `storage:get-preferences` / `storage:set-preferences` / `storage:update-preference`
- `storage:get-keybinds` / `storage:set-keybinds`
- `storage:get-all-sessions` / `storage:get-session` / `storage:save-session` / `storage:delete-session` / `storage:delete-all-sessions`
- `storage:get-today-limits`
- `storage:clear-all`

**General App Lifecycle**
- `get-app-version`: Returns `string` (e.g., "1.0.0").
- `quit-application`: Gracefully stops macOS audio capture and calls `app.quit()`.
- `open-external`: Payload `{ url: string }`. Opens URL in default OS browser.
- `update-keybinds`: Payload `{ keybinds: Object }`. Re-registers global shortcuts.
- `ai-provider-changed-notify`: Payload `string` ("gemini" | "groq").
- `log-message`: Payload `string`. Renderer -> Main debug logging.
- `session-started`: Payload `string` (sessionId). Tracks the active session for auto-save.
- `kill-switch-export`: Forcibly exports the current session data to Downloads.

**Keyboard Injection (AutoTyper)**
- `keyboard:send-key`: Payload `string` (e.g., "Enter", "A").
- `keyboard:send-key-sync`: Payload `string`. Returns `Promise<void>`.
- `keyboard:type-text`: Payload `{ text: string, mode: string, options?: Object }`.
  - Example: `ipcRenderer.invoke('keyboard:type-text', { text: "const a = 1;", mode: "charByChar", options: { minDelay: 40, maxDelay: 80 } })`.
- `keyboard:type-text-clipboard`: Payload `{ text: string }`. Fast pasting via OS clipboard.
- `keyboard:pause-typing` / `keyboard:resume-typing` / `keyboard:kill-typing`: No payload. Modifies C# child process.

### `src/utils/gemini.js` Handlers

**AI & Audio Session**
- `initialize-gemini`: Payload `{ profile: string, language: string, customPrompt: string }`. Starts WebSocket.
- `send-audio-content` / `send-mic-audio-content`: Payload `{ data: string (Base64) }`.
  - Example: `ipcRenderer.send('send-mic-audio-content', { data: "UklGRiQAAABXQVZFZm10IBAAAAABAAEA..." })`
- `send-image-content`: Payload `{ imageBase64: string, prompt: string }`. Routes base64 screenshot to Groq/Gemini.
- `send-text-message`: Payload `{ text: string }`. Routes manual text message.
- `stop-gemini`: No payload. Gracefully closes active WebSocket.
- `start-macos-audio` / `stop-macos-audio`: Spawns native `SystemAudioDump`.

### Main to Renderer Events (`sendToRenderer`)
These events are emitted *from* the Main Process *to* the Renderer (listened to by `CheatingDaddyApp.js`):

- `update-status`: Status text updates (e.g., "Listening...", "Thinking...").
- `new-response`: Indicates a new AI response block has started.
- `update-response`: Streaming chunks for the current AI response.
- `save-session-context`: Payload containing current profile and custom prompt.
- `save-conversation-turn`: Real-time conversation sync.
- `save-screen-analysis`: Real-time vision analysis sync.
- `session-initializing`: Boolean flag indicating WebSocket connection state.
- `reconnect-failed`: Fired when max reconnect attempts (5) are reached.
- `shortcut-triggered`: Fired when a global shortcut (Ctrl+Space, etc.) is pressed.
- `quick-start-groq` / `quick-stop`: Fired by dedicated hotkeys.

## IPC Data Flow Examples

**Start Audio Session Flow**
1. User clicks "Start Live Session" in Renderer.
2. Renderer invokes `initialize-gemini`.
3. Main Process connects WebSocket to Google APIs.
4. Renderer loops `navigator.mediaDevices.getUserMedia`.
5. Renderer sends raw chunks via `ipcRenderer.send('send-mic-audio-content', { data })`.
6. Main Process relays chunks to WebSocket.

**AutoTyper Flow**
1. User triggers code insertion shortcut.
2. Renderer reads state and invokes `keyboard:type-text` with payload `{ text: "console.log('hi');", mode: "instant" }`.
3. Main Process writes payload to OS temp directory.
4. Main Process spawns `AutoTyper.exe tmp.txt`.
5. C# executable injects keystrokes directly into the OS.

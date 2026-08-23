# Electron IPC & Stealth Window Lifecycle

## 1. Process Architecture & IPC Schema

The application uses Electron's multi-process architecture:
- **Main Process (Node.js)**: Manages OS windows, native audio capture, WebSocket connections to Gemini Live, HTTP requests to Groq, and child process execution.
- **Renderer Process (Chromium)**: Handles Web Audio stream generation, microphone capture, UI event loop, and streaming Markdown rendering.

---

## 2. Complete IPC Communication Table

### A. Renderer to Main Process (`ipcRenderer.invoke`)

| IPC Channel | Payload | Response | Description |
|---|---|---|---|
| `initialize-gemini` | `(apiKey, customPrompt, profile, language)` | `{ success: boolean }` | Establishes Gemini Live WebSocket connection. |
| `initialize-local` | `(llmModel, whisperModel, profile, prompt)` | `{ success: boolean }` | Starts local Whisper & LLaMA native servers. |
| `send-audio-content` | `{ data: base64, mimeType: string }` | `{ success: boolean }` | Streams 24kHz system loopback audio chunk (0.1s). |
| `send-mic-audio-content` | `{ data: base64, mimeType: string }` | `{ success: boolean }` | Streams 24kHz user microphone audio chunk (0.1s). |
| `send-text-message` | `text: string` | `{ success: boolean }` | Dispatches manual text message into active session. |
| `send-image-content` | `{ data: base64, prompt: string }` | `{ success, text, model }` | Dispatches screenshot for on-demand vision reasoning. |
| `start-macos-audio` | *none* | `{ success: boolean }` | Spawns `SystemAudioDump` daemon on macOS. |
| `stop-macos-audio` | *none* | `{ success: boolean }` | Kills `SystemAudioDump` process. |
| `close-session` | *none* | `{ success: boolean }` | Closes active AI session and releases resources. |
| `toggle-window-visibility` | *none* | `{ success: boolean }` | Toggles window between hidden and shown inactive. |

---

### B. Main to Renderer Process (`webContents.send`)

| IPC Channel | Payload | Action in Renderer |
|---|---|---|
| `new-response` | `text: string` | Appends a new conversation card and displays first token. |
| `update-response` | `text: string` | Continuously updates the active response card with incoming text. |
| `update-status` | `status: string` | Updates status pill (`Listening...`, `Transcribing...`, etc.). |
| `save-conversation-turn` | `{ sessionId, turn, fullHistory }` | Persists conversation turn into local storage. |
| `click-through-toggled` | `isEnabled: boolean` | Updates UI indicator when mouse events pass through. |
| `navigate-previous-response` | *none* | Navigates to previous AI response card. |
| `navigate-next-response` | *none* | Navigates to next AI response card. |
| `scroll-response-up` | *none* | Scrolls the response container up smoothly. |
| `scroll-response-down` | *none* | Scrolls the response container down smoothly. |
| `clear-sensitive-data` | *none* | Emergency wipe: deletes history and closes application. |

---

## 3. Stealth Overlay Window Configuration

For discreet on-screen teleprompting during video calls or interviews, the window is configured with specific OS protection flags:

```javascript
function createStealthWindow() {
    const mainWindow = new BrowserWindow({
        width: 1100,
        height: 800,
        minWidth: 700,
        minHeight: 320,
        resizable: true,
        frame: false,               // Frameless borderless window
        transparent: true,          // Transparent background
        hasShadow: false,
        alwaysOnTop: true,          // Floats above other windows
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false, // Prevents audio throttles when unfocused
            enableBlinkFeatures: 'GetDisplayMedia',
        },
        backgroundColor: '#00000000',
    });

    // 1. Screen-share Invisibility: Hides window from Zoom, Teams, Google Meet, OBS
    mainWindow.setContentProtection(true);

    // 2. Windows Taskbar Stealth: Hides window icon from taskbar & Alt+Tab
    if (process.platform === 'win32') {
        mainWindow.setSkipTaskbar(true);
        mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    }

    // 3. macOS Mission Control Stealth: Hides from Mission Control & App Switcher
    if (process.platform === 'darwin') {
        mainWindow.setHiddenInMissionControl(true);
    }

    return mainWindow;
}
```

---

## 4. Click-Through & Transparency Toggling

Allows the user to click through the overlay window to underlying applications without minimizing:

```javascript
let mouseEventsIgnored = false;

function toggleClickThrough(mainWindow) {
    mouseEventsIgnored = !mouseEventsIgnored;
    if (mouseEventsIgnored) {
        // Clicks pass directly through the transparent window to the app behind it
        mainWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
        mainWindow.setIgnoreMouseEvents(false);
    }
    mainWindow.webContents.send('click-through-toggled', mouseEventsIgnored);
}
```

---

## 5. Global Hotkeys System (`globalShortcut`)

Hotkeys are registered at the OS level so they trigger even when another application (e.g., Zoom or a coding IDE) is focused:

```javascript
function registerGlobalHotkeys(mainWindow) {
    const isMac = process.platform === 'darwin';

    // Move window around screen
    globalShortcut.register(isMac ? 'Alt+Up' : 'Ctrl+Up', () => moveWindow(mainWindow, 0, -50));
    globalShortcut.register(isMac ? 'Alt+Down' : 'Ctrl+Down', () => moveWindow(mainWindow, 0, 50));
    globalShortcut.register(isMac ? 'Alt+Left' : 'Ctrl+Left', () => moveWindow(mainWindow, -50, 0));
    globalShortcut.register(isMac ? 'Alt+Right' : 'Ctrl+Right', () => moveWindow(mainWindow, 50, 0));

    // Toggle Hide / Show
    globalShortcut.register(isMac ? 'Cmd+\\' : 'Ctrl+\\', () => {
        if (mainWindow.isVisible()) mainWindow.hide();
        else mainWindow.showInactive();
    });

    // Toggle Click-Through
    globalShortcut.register(isMac ? 'Cmd+M' : 'Ctrl+M', () => toggleClickThrough(mainWindow));

    // Next / Previous Response Navigation
    globalShortcut.register(isMac ? 'Cmd+[' : 'Ctrl+[', () => mainWindow.webContents.send('navigate-previous-response'));
    globalShortcut.register(isMac ? 'Cmd+]' : 'Ctrl+]', () => mainWindow.webContents.send('navigate-next-response'));

    // Emergency Panic Erase
    globalShortcut.register(isMac ? 'Cmd+Shift+E' : 'Ctrl+Shift+E', () => {
        mainWindow.hide();
        mainWindow.webContents.send('clear-sensitive-data');
        setTimeout(() => app.quit(), 300);
    });
}
```

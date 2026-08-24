# Main Process

This document details the responsibilities and architecture of the Electron Main Process (`src/index.js`).

## File Overview

**File**: `src/index.js`
**Purpose**: The entry point for the Electron application. It manages the application lifecycle, window creation, native platform encoding fixes, and serves as the primary router for Inter-Process Communication (IPC).

## Lifecycle and Initialization

**Execution flow:**
1. **Encoding Fix (Windows Only)**: Executes `chcp 65001` via PowerShell to ensure UTF-8 console output. (Lines 1-15)
2. **Squirrel Startup**: Checks `electron-squirrel-startup`. Exits if true (used during Windows installation). (Lines 17-19)
3. **Single Instance Lock**: Requests a single instance lock (`app.requestSingleInstanceLock()`). If another instance exists, it brings the existing window to the front and quits.
4. **App Ready (`app.whenReady()`)**: 
   - Initializes storage `storage.initializeStorage()`.
   - Creates the main transparent window via `createMainWindow()`.
   ```javascript
   const mainWindow = new BrowserWindow({
       width: windowWidth,
       height: windowHeight,
       frame: false,
       transparent: true,
       hasShadow: false,
       alwaysOnTop: true,
       focusable: true,
       skipTaskbar: true, // Stealth
       webPreferences: {
           nodeIntegration: true,
           contextIsolation: false, // Critical bypass
           backgroundThrottling: false,
           enableBlinkFeatures: 'GetDisplayMedia'
       },
       backgroundColor: '#00000000',
   });
   ```
5. **App Quit (`before-quit`)**: Auto-saves the current active session (transcriptions and screenshots) to the user's Downloads folder.
   ```javascript
   app.on('before-quit', async event => {
       if (currentSessionId) {
           const session = storage.getSession(currentSessionId);
           if (session && (session.conversationHistory?.length > 0 || session.screenAnalysisHistory?.length > 0)) {
               storage.exportSessionToDownloads(currentSessionId);
           }
       }
       stopMacOSAudioCapture(); // Kill native Swift process
   });
   ```

## Global State

The Main Process maintains minimal state:
- `geminiSessionRef`: A mutable object reference `{ current: null }` passed to Gemini handlers to track the active WebSocket session.
- `mainWindow`: Reference to the `BrowserWindow` instance.
- `activeTypingProcess`: Reference to the spawned C# `AutoTyper.exe` child process (used for kill/pause).
- `currentSessionId`: Tracks the ID of the active session (updated via IPC) for auto-saving on quit.

## Key Imported Services

- `src/utils/window.js`: Manages `createWindow` and `updateGlobalShortcuts`. Note that while `index.js` manages the lifecycle, `window.js` dynamically registers the vast majority of the application's global shortcuts based on user preferences.
- `src/utils/gemini.js`: `setupGeminiIpcHandlers`, `stopMacOSAudioCapture`, `sendToRenderer`.
- `src/storage.js`: Handles all filesystem configuration reading/writing.

## Security and Architecture Note

> [!WARNING]
> **Context Isolation is Disabled**
> The application currently runs with `nodeIntegration: true` and `contextIsolation: false` (configured in `src/utils/window.js`). This means the renderer process directly imports `electron` via `window.require('electron')`. The `src/preload.js` script is bypassed for IPC and is only used to suppress a specific monitoring error.

## C# / PowerShell Integration (AutoTyper)

A significant portion of `index.js` (Lines 428-828) is dedicated to native keyboard simulation for the Invigilator Mode feature.

### Implementation Details:
1. **PowerShell Snippet (`winInputCSharp`)**: 
   - A multi-line C# string injected into PowerShell via `Add-Type`.
   - It P/Invokes `user32.dll` (`SendInput`, `VkKeyScan`).
   - Uses `KEYEVENTF_UNICODE` for safe character injection (avoiding accidental Ctrl/Alt trigger).
2. **`keyboard:send-key` (Fire-and-forget)**:
   - Wraps the key in the C# snippet and runs `execFile('powershell.exe', ...)` with a 2-second timeout.
3. **`keyboard:send-key-sync`**:
   - Same as above, but returns a Promise to wait for execution to finish.
4. **`keyboard:type-text` (Bulk Auto-Type)**:
   - Writes the text payload to a temporary file (`ultron_text_[timestamp].txt`) in the OS temp directory.
   - Executes the compiled C# binary `src/utils/AutoTyper.exe` using `execFile`.
   - Supports `instant` mode and `lineByLine` stateful tracking.
   - Registers a temporary `Escape` global shortcut to forcefully kill the `activeTypingProcess` child process.
5. **`keyboard:type-text-clipboard`**:
   - Copies text to the OS clipboard, sends `^v` (Ctrl+V) via PowerShell `System.Windows.Forms.SendKeys`, and then restores the original clipboard content.

## High-Risk Modification Areas
- **App Quit Logic**: Modifying the `before-quit` handler (Lines 71-101) could lead to data loss if sessions aren't exported correctly.
- **AutoTyper Paths**: The path to `AutoTyper.exe` is dynamically resolved based on whether the app is packaged (`app.isPackaged`) (Line 716). Breaking this path resolution will completely break Invigilator Mode.

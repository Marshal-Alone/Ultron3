# Native OS Integration

Ultron3 heavily interacts with the host operating system to achieve features that are normally sandboxed by Chromium/Electron.

## 1. Global Shortcuts (`globalShortcut`)
While some shortcuts are registered in `src/index.js`, the core application shortcuts are dynamically registered in `src/utils/window.js`. These operate at the OS level, meaning they trigger even when Ultron3 is unfocused or completely hidden.

**Core Shortcuts (Hardcoded or Defaulted):**
- `CommandOrControl+Return` (`Ctrl+Enter`): **Next Step**. This is the most critical shortcut. On the Main View, it triggers `handleStart()` to start a session. Inside a session, it triggers `captureManualScreenshot()` to capture the screen and ask the AI.
- `Ctrl+Alt+Return`: Toggle AI Provider (swaps between Gemini and Groq).

**Customizable Shortcuts (Registered dynamically in `window.js` via preferences):**
- `toggleVisibility` (Default: `Ctrl+Shift+Space`): Shows/hides the main window.
- `toggleClickThrough` (Default: `Ctrl+Shift+D`): Toggles transparent overlay mode allowing clicks to pass through to the OS below.
- `nextStep` (Default: `Ctrl+Enter` / `F9` / `Ctrl+Shift+A`): Capture Screen / Force trigger answer.
- `emergencyErase`: Hides the window, kills the session, clears sensitive data, and quits the app instantly.
- Navigation: `previousResponse`, `nextResponse`, `scrollUp`, `scrollDown`.
- Appearance: `decreaseTransparency`, `increaseTransparency`, `decreaseFontSize`, `increaseFontSize`.

*(Invigilator Mode shortcuts like `Ctrl+Shift+L` and `Ctrl+Shift+P` are also registered via IPC/Main process bindings.)*
## 2. Window Management Hacks
To function as an undetectable overlay:
- `transparent: true` and `frame: false`.
- `win.setAlwaysOnTop(true, 'screen-saver')`: Forces the window above almost all other applications, including some full-screen games.
- `win.setIgnoreMouseEvents(true, { forward: true })`: Allows the user to click *through* the UI to the underlying applications.

## 3. Platform Specific Executables
- **macOS Audio**: Uses a compiled Swift binary (`SystemAudioDump`) because macOS restricts loopback audio.
- **Windows Keyboard**: Uses a compiled C# binary (`AutoTyper.exe`) because Node.js keyboard simulation libraries (like robotjs) are either unmaintained, require compilation tools (node-gyp), or are flagged by anti-cheat systems. Native `user32.dll` injection via `KEYEVENTF_UNICODE` is both faster and stealthier.

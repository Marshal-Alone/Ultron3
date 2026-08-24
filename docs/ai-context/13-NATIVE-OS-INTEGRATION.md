# Native OS Integration

Ultron3 heavily interacts with the host operating system to achieve features that are normally sandboxed by Chromium/Electron.

## 1. Global Shortcuts (`globalShortcut`)
Registered in `src/index.js`, these shortcuts operate at the OS level, meaning they trigger even when Ultron3 is unfocused or completely hidden.

- `CommandOrControl+Shift+Space`: Toggle Window Visibility.
- `CommandOrControl+Shift+M`: Toggle Audio Mode (Mic vs System vs Both).
- `CommandOrControl+Shift+D`: Toggle UI Click-Through (Transparent overlay mode).
- `CommandOrControl+Shift+A`: Force trigger answer / Capture Screen (Invigilator Mode).
- `CommandOrControl+Shift+L`: Toggle Invigilator Mode (Stealth ON/OFF).
- `CommandOrControl+Shift+P`: Confirm Auto-Type (Invigilator Mode).

## 2. Window Management Hacks
To function as an undetectable overlay:
- `transparent: true` and `frame: false`.
- `win.setAlwaysOnTop(true, 'screen-saver')`: Forces the window above almost all other applications, including some full-screen games.
- `win.setIgnoreMouseEvents(true, { forward: true })`: Allows the user to click *through* the UI to the underlying applications.

## 3. Platform Specific Executables
- **macOS Audio**: Uses a compiled Swift binary (`SystemAudioDump`) because macOS restricts loopback audio.
- **Windows Keyboard**: Uses a compiled C# binary (`AutoTyper.exe`) because Node.js keyboard simulation libraries (like robotjs) are either unmaintained, require compilation tools (node-gyp), or are flagged by anti-cheat systems. Native `user32.dll` injection via `KEYEVENTF_UNICODE` is both faster and stealthier.

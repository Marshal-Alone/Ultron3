# Environment & Platform Matrix

Ultron3 utilizes highly platform-specific hacks to achieve its stealth and media capture capabilities. Any modifications must consider this matrix.

| Feature | Windows | macOS | Linux |
| :--- | :--- | :--- | :--- |
| **System Audio Capture** | Supported. Uses `navigator.mediaDevices.getDisplayMedia({audio: true})`. | Supported, but requires `src/bin/SystemAudioDump` (Swift binary) to bypass macOS CoreAudio restrictions. | Partial support depending on Wayland/X11 and PulseAudio configuration. |
| **Microphone Capture** | Supported natively via WebRTC. | Supported natively via WebRTC. | Supported natively via WebRTC. |
| **Screen Capture** | Supported via `getDisplayMedia` to hidden `<video>` element. | Supported via `getDisplayMedia` to hidden `<video>` element. | Supported via `getDisplayMedia`. |
| **Auto-Typing / Stealth** | Fully Supported. Uses `src/bin/AutoTyper/Program.cs` compiled to `.exe` which hooks into `user32.dll` `SendInput`. | **UNSUPPORTED**. C# binary will not run. (Would require an AppleScript or C/IOKit equivalent). | **UNSUPPORTED**. (Would require xdotool or evdev equivalent). |
| **Window Click-Through** | Supported (`setIgnoreMouseEvents`). | Supported. | Supported (window manager dependent). |
| **Global Shortcuts** | Supported natively via Electron `globalShortcut`. | Supported natively via Electron `globalShortcut`. | Supported natively via Electron `globalShortcut`. |

## Development Requirements
- **Node**: v18+
- **Electron**: v30+
- **Compiler (Windows)**: `csc.exe` (.NET Framework) is required to recompile `AutoTyper.cs` if modifications are made.
- **Compiler (macOS)**: `swiftc` is required to recompile `SystemAudioDump` if modifications are made.

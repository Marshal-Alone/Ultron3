# Invigilator Mode (Stealth & Auto-Type) Architecture

This document explains the mechanics of "Invigilator Mode," the core functionality that allows Ultron3 to physically type answers into proctored online exams without being detected by strict invigilation software.

## The Goal
Many online exam platforms (like Honorlock, ProctorU, or HackerRank) monitor the clipboard and track focus events. If the user pastes code or if the browser loses focus (because an overlay application is active), the student is flagged. 

Invigilator Mode solves this by:
1. Staying entirely hidden during the exam.
2. Capturing screenshots via physical keyboard shortcuts.
3. Generating the code solution (bypassing normal UI rendering).
4. Injecting the solution back into the exam field by simulating physical keystrokes via Windows Native APIs.

## Architecture & Components

### 1. `InvigilatorModeManager` (`src/utils/invigilatorMode.js`)
This is the state manager for the frontend.
- Tracks `isActive`, `typingMode` (charByChar, lineByLine, instant), and `lastAnswerCode`.
- Uses a Publisher/Subscriber model so the UI (`CheatingDaddyApp.js`) can react to mode toggles without circular dependencies.

### 2. The Keyboard Injector (`src/index.js` & `AutoTyper.exe`)
This is the heart of the stealth mechanism.
- **Why C#?** Early versions used `node-powershell` to invoke `SendKeys.SendWait`, but this was too slow and occasionally unreliable. The `AutoTyper.cs` file is compiled into a standalone `AutoTyper.exe` which uses the native Windows User32 `SendInput` API.
- **Stealth / Focus Safety**:
  - The script explicitly calls `GetAsyncKeyState` to check if the user is physically holding `Ctrl`, `Alt`, or `Win`. If they are, it pauses typing to prevent triggering browser shortcuts that could close the exam.
  - Characters that require `Ctrl` or `Alt` combinations (as determined by `VkKeyScan`) are injected using the `KEYEVENTF_UNICODE` flag instead of standard Virtual Keys.

**C# Unicode Injection Snippet:**
```csharp
[StructLayout(LayoutKind.Sequential)]
public struct INPUT {
    public uint type;
    public KEYBDINPUT ki;
}

const uint INPUT_KEYBOARD = 1;
const uint KEYEVENTF_UNICODE = 0x0004;

// If VkKeyScan wants Ctrl (0x0200) or Alt (0x0400),
// use Unicode injection instead to avoid triggering shortcuts.
bool needsCtrl = (vkCode & 0x0200) != 0;
bool needsAlt  = (vkCode & 0x0400) != 0;

if (vkCode == -1 || needsCtrl || needsAlt) {
    // Send as unicode
    INPUT[] inputs = new INPUT[2];
    inputs[0].type = INPUT_KEYBOARD;
    inputs[0].ki.wScan = (ushort)ch;
    inputs[0].ki.dwFlags = KEYEVENTF_UNICODE;
    
    // ... send input ...
}
```

### 3. The Orchestrator (`src/utils/autotype.js`)
This module links the frontend UI/IPC to the native backend.
- Contains the `createAutotyper` factory which accepts a `keyboard` control object (mapped to `ipcRenderer.invoke('keyboard:type-text')`).
- Implements the logic for different typing speeds (e.g., adding a 40-80ms random delay in `charByChar` mode).
- Uses a temporary lock file (`%TEMP%\ultron_pause.flag`) to allow the user to pause/resume the physical C# executable instantly via IPC without killing the process.

## Flow of Execution
1. User presses `Ctrl+Shift+L` (Toggle Invigilator Mode). The UI hides completely.
2. User presses `Ctrl+Shift+A` (Capture Answer). 
3. The Renderer triggers `captureManualScreenshot()` with `_invigilatorAnswerCapture = true`.
4. The AI processes the image and streams the response back. The UI intercepts it via `setAnswerCode()` instead of displaying it.
5. User clicks into the exam text box.
6. User presses `Ctrl+Shift+P` (Confirm Auto-Type).
7. The Main Process writes the code to a temporary text file, spawns `AutoTyper.exe <filepath> charByChar`, and physical keystrokes begin pouring into the exam.

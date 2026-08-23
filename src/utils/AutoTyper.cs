using System;
using System.IO;
using System.Threading;
using System.Runtime.InteropServices;

public class KeyMap {
    [DllImport("user32.dll")]
    public static extern short VkKeyScan(char ch);
}

public class Program {
    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT
    {
        public uint type;
        public InputUnion u;
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct InputUnion
    {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct HARDWAREINPUT
    {
        public uint uMsg;
        public ushort wParamL;
        public ushort wParamH;
    }

    [DllImport("user32.dll")]
    public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    const uint INPUT_KEYBOARD = 1;
    const uint KEYEVENTF_KEYUP = 0x0002;
    const uint KEYEVENTF_UNICODE = 0x0004;

    public static void SendVk(ushort vk) {
        INPUT[] inputs = new INPUT[2];
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].u.ki.wVk = vk;
        inputs[1].type = INPUT_KEYBOARD;
        inputs[1].u.ki.wVk = vk;
        inputs[1].u.ki.dwFlags = KEYEVENTF_KEYUP;
        SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    public static void SendVkCombo(ushort modifierVk, ushort keyVk) {
        INPUT[] inputs = new INPUT[4];
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].u.ki.wVk = modifierVk;
        
        inputs[1].type = INPUT_KEYBOARD;
        inputs[1].u.ki.wVk = keyVk;
        
        inputs[2].type = INPUT_KEYBOARD;
        inputs[2].u.ki.wVk = keyVk;
        inputs[2].u.ki.dwFlags = KEYEVENTF_KEYUP;
        
        inputs[3].type = INPUT_KEYBOARD;
        inputs[3].u.ki.wVk = modifierVk;
        inputs[3].u.ki.dwFlags = KEYEVENTF_KEYUP;
        
        SendInput(4, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    public static void SendChar(char ch) {
        if (ch == '\r') return;
        if (ch == '\n') { SendVk(0x0D); return; }
        if (ch == '\t') { SendVk(0x09); return; }
        
        short vkCode = KeyMap.VkKeyScan(ch);
        
        // SAFETY: Check if VkKeyScan wants Ctrl (0x0200) or Alt (0x0400).
        // If it does, DO NOT use VK-based input — that would send Ctrl+key
        // or Alt+key combos which trigger editor/browser shortcuts and can
        // cause focus loss in proctored online platforms.
        // Instead, fall through to safe Unicode injection.
        bool needsCtrl = (vkCode & 0x0200) != 0;
        bool needsAlt  = (vkCode & 0x0400) != 0;
        
        if (vkCode == -1 || needsCtrl || needsAlt) {
            // Safe Unicode injection — never triggers any shortcut
            INPUT[] uInputs = new INPUT[2];
            uInputs[0].type = INPUT_KEYBOARD;
            uInputs[0].u.ki.wScan = (ushort)ch;
            uInputs[0].u.ki.dwFlags = KEYEVENTF_UNICODE;
            uInputs[1].type = INPUT_KEYBOARD;
            uInputs[1].u.ki.wScan = (ushort)ch;
            uInputs[1].u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
            SendInput(2, uInputs, Marshal.SizeOf(typeof(INPUT)));
            return;
        }

        ushort vk = (ushort)(vkCode & 0xFF);
        bool shift = (vkCode & 0x0100) != 0;
        
        // Only Shift is safe to combine with VK codes.
        // Ctrl and Alt are NEVER sent (handled above).
        int numInputs = 2;
        if (shift) numInputs += 2;
        
        INPUT[] inputs = new INPUT[numInputs];
        int i = 0;
        
        if (shift) {
            inputs[i].type = INPUT_KEYBOARD;
            inputs[i].u.ki.wVk = 0x10; // VK_SHIFT
            i++;
        }
        
        inputs[i].type = INPUT_KEYBOARD;
        inputs[i].u.ki.wVk = vk;
        i++;
        
        inputs[i].type = INPUT_KEYBOARD;
        inputs[i].u.ki.wVk = vk;
        inputs[i].u.ki.dwFlags = KEYEVENTF_KEYUP;
        i++;
        
        if (shift) {
            inputs[i].type = INPUT_KEYBOARD;
            inputs[i].u.ki.wVk = 0x10;
            inputs[i].u.ki.dwFlags = KEYEVENTF_KEYUP;
            i++;
        }
        
        SendInput((uint)numInputs, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);

    public static void Main(string[] args) {
        if (args.Length < 1) {
            Console.WriteLine("Usage: AutoTyper.exe <filepath> [mode]");
            return;
        }

        // Wait until physical modifier keys are released (Ctrl, Alt, Win)
        int waitCount = 0;
        while (waitCount < 50) {
            bool anyPressed = (GetAsyncKeyState(0x11) < 0) || // Ctrl
                              (GetAsyncKeyState(0x12) < 0) || // Alt
                              (GetAsyncKeyState(0x5B) < 0) || // LWin
                              (GetAsyncKeyState(0x5C) < 0);   // RWin
            if (!anyPressed) break;
            Thread.Sleep(40);
            waitCount++;
        }

        string filepath = args[0];
        string mode = args.Length > 1 ? args[1] : "charByChar";

        if (!File.Exists(filepath)) {
            Console.WriteLine("File not found: " + filepath);
            return;
        }

        string text = File.ReadAllText(filepath);

        Random rnd = new Random();

        for (int j = 0; j < text.Length; j++) {
            // Safety check: if user accidentally touches Ctrl, Alt, or Win during typing, pause until they release it
            // This guarantees we never fire a shortcut (like Ctrl+Enter) by accident!
            while ((GetAsyncKeyState(0x11) < 0) || // Ctrl
                   (GetAsyncKeyState(0x12) < 0) || // Alt
                   (GetAsyncKeyState(0x5B) < 0) || // LWin
                   (GetAsyncKeyState(0x5C) < 0))   // RWin
            {
                Thread.Sleep(20);
            }

            char c = text[j];

            if (c == '\n') {
                SendChar(c);
                if (mode == "lineByLine") {
                    Thread.Sleep(200);
                } else if (mode == "wordByWord") {
                    Thread.Sleep(120);
                } else if (mode == "instant") {
                    Thread.Sleep(15);
                } else {
                    Thread.Sleep(rnd.Next(40, 80));
                }
            } else {
                if (mode == "wordByWord") {
                    if (c == ' ' || c == '\t') {
                        SendChar(c);
                        Thread.Sleep(120);
                    } else {
                        SendChar(c);
                        Thread.Sleep(20);
                    }
                } else if (mode == "lineByLine") {
                    SendChar(c);
                    Thread.Sleep(20);
                } else if (mode == "instant") {
                    SendChar(c);
                    Thread.Sleep(1);
                } else { // charByChar
                    SendChar(c);
                    Thread.Sleep(rnd.Next(40, 80));
                }
            }

            string pauseFile = Path.Combine(Path.GetTempPath(), "ultron_pause.flag");
            while (File.Exists(pauseFile)) {
                Thread.Sleep(100);
            }
        }
    }
}

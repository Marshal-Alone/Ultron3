# Instant 100% Window & Taskbar Restorer for Antigravity IDE

$code = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Diagnostics;
using System.Collections.Generic;

public class AntigravityRestorer {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetWindowDisplayAffinity(IntPtr hWnd, uint dwAffinity);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public const uint WDA_NONE = 0x00000000;
    public const int GWL_EXSTYLE = -20;
    public const int WS_EX_TOOLWINDOW = 0x00000080;
    public const int WS_EX_APPWINDOW = 0x00040000;
    public const uint SWP_FRAMECHANGED = 0x0020;
    public const uint SWP_NOMOVE = 0x0002;
    public const uint SWP_NOSIZE = 0x0001;
    public const uint SWP_NOZORDER = 0x0004;

    public static List<string> RestoreAll() {
        List<string> restored = new List<string>();

        // Collect Antigravity PIDs
        HashSet<uint> antigravityPids = new HashSet<uint>();
        foreach (Process p in Process.GetProcesses()) {
            try {
                if (p.ProcessName.IndexOf("Antigravity", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    p.MainWindowTitle.IndexOf("Antigravity", StringComparison.OrdinalIgnoreCase) >= 0) {
                    antigravityPids.Add((uint)p.Id);
                }
            } catch {}
        }

        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);

            StringBuilder sb = new StringBuilder(512);
            GetWindowText(hWnd, sb, 512);
            string title = sb.ToString();

            bool isAntigravity = antigravityPids.Contains(pid) || 
                                 (!string.IsNullOrEmpty(title) && title.IndexOf("Antigravity", StringComparison.OrdinalIgnoreCase) >= 0);

            if (isAntigravity) {
                // 1. Reset Display Affinity
                SetWindowDisplayAffinity(hWnd, WDA_NONE);

                // 2. Restore normal window styles and taskbar presence
                try {
                    int exStyle = GetWindowLong(hWnd, GWL_EXSTYLE);
                    exStyle = (exStyle & ~WS_EX_TOOLWINDOW) | WS_EX_APPWINDOW;
                    SetWindowLong(hWnd, GWL_EXSTYLE, exStyle);
                    SetWindowPos(hWnd, IntPtr.Zero, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
                    ShowWindow(hWnd, 5); // SW_SHOW
                } catch {}

                restored.Add(string.Format("Restored: '{0}' (PID: {1})", title, pid));
            }
            return true;
        }, IntPtr.Zero);

        return restored;
    }
}
"@

Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue

Clear-Host
Write-Host "Restoring Antigravity IDE to normal Taskbar & Screen visibility..." -ForegroundColor Yellow

$res = [AntigravityRestorer]::RestoreAll()

foreach ($line in $res) {
    Write-Host "  ✅ $line" -ForegroundColor Green
}

Write-Host "`n🎉 Antigravity IDE is completely RESTORED to normal mode!" -ForegroundColor Green
Write-Host "• Taskbar icon is restored" -ForegroundColor Cyan
Write-Host "• Window styles are normal" -ForegroundColor Cyan

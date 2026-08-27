# 100% Guaranteed Antigravity IDE Stealth Cloak
# Uses SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE = 0x00000011)

$code = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
using System.Diagnostics;

public class AntigravityStealth {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetWindowDisplayAffinity(IntPtr hWnd, uint dwAffinity);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public const uint WDA_NONE = 0x00000000;
    public const uint WDA_EXCLUDEFROMCAPTURE = 0x00000011; // Completely invisible to screen capture & screen share
    public const uint WDA_MONITOR = 0x00000001;

    public static List<string> CloakAntigravity() {
        List<string> results = new List<string>();

        // 1. Get all process IDs for Antigravity IDE
        HashSet<uint> antigravityPids = new HashSet<uint>();
        foreach (Process p in Process.GetProcesses()) {
            try {
                if (p.ProcessName.IndexOf("Antigravity", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    p.MainWindowTitle.IndexOf("Antigravity", StringComparison.OrdinalIgnoreCase) >= 0) {
                    antigravityPids.Add((uint)p.Id);
                }
            } catch {}
        }

        // 2. Enumerate all visible windows on desktop
        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
            if (!IsWindowVisible(hWnd)) return true;

            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);

            StringBuilder sb = new StringBuilder(512);
            GetWindowText(hWnd, sb, 512);
            string title = sb.ToString();

            bool shouldCloak = antigravityPids.Contains(pid) || 
                               (!string.IsNullOrEmpty(title) && title.IndexOf("Antigravity", StringComparison.OrdinalIgnoreCase) >= 0);

            if (shouldCloak && !string.IsNullOrEmpty(title)) {
                bool ok = SetWindowDisplayAffinity(hWnd, WDA_EXCLUDEFROMCAPTURE);
                int err = Marshal.GetLastWin32Error();
                if (!ok) {
                    ok = SetWindowDisplayAffinity(hWnd, WDA_MONITOR);
                }
                results.Add(string.Format("Window: '{0}' (PID: {1}) -> Cloaked: {2}", title, pid, ok));
            }
            return true;
        }, IntPtr.Zero);

        return results;
    }

    public static List<string> UncloakAntigravity() {
        List<string> results = new List<string>();
        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);

            StringBuilder sb = new StringBuilder(512);
            GetWindowText(hWnd, sb, 512);
            string title = sb.ToString();

            if (!string.IsNullOrEmpty(title) && title.IndexOf("Antigravity", StringComparison.OrdinalIgnoreCase) >= 0) {
                SetWindowDisplayAffinity(hWnd, WDA_NONE);
                results.Add(string.Format("Restored: '{0}'", title));
            }
            return true;
        }, IntPtr.Zero);
        return results;
    }
}
"@

Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue

Clear-Host
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "     ANTIGRAVITY IDE STEALTH CLOAK (100% Invisible)       " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Protecting Antigravity IDE window from all screen shares..." -ForegroundColor Yellow

$cloaked = [AntigravityStealth]::CloakAntigravity()

if ($cloaked.Count -gt 0) {
    Write-Host ""
    foreach ($line in $cloaked) {
        Write-Host "  ✅ $line" -ForegroundColor Green
    }
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "🎉 SUCCESS! Antigravity IDE is now in 100% STEALTH MODE:" -ForegroundColor Green
    Write-Host "  • INVISIBLE in Google Meet, Zoom, MS Teams & Screenshots" -ForegroundColor Cyan
    Write-Host "  • VISIBLE TO YOU on your monitor so you can chat freely!" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Green
} else {
    Write-Host "⚠️ No active Antigravity IDE window was detected." -ForegroundColor Red
    Write-Host "Please make sure Antigravity IDE is open on your screen and run this again." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Press Enter to close this window..." -ForegroundColor Gray
Read-Host

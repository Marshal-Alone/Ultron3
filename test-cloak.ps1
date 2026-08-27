Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class WinProtect {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetWindowDisplayAffinity(IntPtr hWnd, uint dwAffinity);

    public const uint WDA_NONE = 0x00000000;
    public const uint WDA_MONITOR = 0x00000001;
    public const uint WDA_EXCLUDEFROMCAPTURE = 0x00000011;

    public static int ProtectPid(int pid) {
        int count = 0;
        IntPtr hwnd = System.Diagnostics.Process.GetProcessById(pid).MainWindowHandle;
        if (hwnd != IntPtr.Zero) {
            bool ok = SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE);
            if (!ok) {
                int err = Marshal.GetLastWin32Error();
                Console.WriteLine("PID " + pid + " HWND 0x" + hwnd.ToString("X") + " Error: " + err);
                ok = SetWindowDisplayAffinity(hwnd, WDA_MONITOR);
            }
            if (ok) {
                Console.WriteLine("PID " + pid + " HWND 0x" + hwnd.ToString("X") + " PROTECTED successfully!");
                count++;
            }
        }
        return count;
    }
}
"@

$procs = Get-Process -Name "Antigravity IDE" -ErrorAction SilentlyContinue
Write-Host "Found $($procs.Count) Antigravity IDE processes."
foreach ($p in $procs) {
    if ($p.MainWindowHandle -ne [IntPtr]::Zero) {
        Write-Host "Checking PID $($p.Id) (MainWindowHandle: 0x$($p.MainWindowHandle.ToString('X')) Title: '$($p.MainWindowTitle)')..."
        [WinProtect]::ProtectPid($p.Id)
    }
}

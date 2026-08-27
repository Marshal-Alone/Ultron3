Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;

public class ThreadWindowCloak {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetWindowDisplayAffinity(IntPtr hWnd, uint dwAffinity);

    [DllImport("user32.dll")]
    public static extern bool EnumThreadWindows(int dwThreadId, EnumThreadDelegate lpfn, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    public delegate bool EnumThreadDelegate(IntPtr hWnd, IntPtr lParam);

    public const uint WDA_EXCLUDEFROMCAPTURE = 0x00000011;

    public static List<string> ProtectAllAntigravityWindows() {
        List<string> protectedWindows = new List<string>();

        System.Diagnostics.Process[] procs = System.Diagnostics.Process.GetProcessesByName("Antigravity IDE");
        foreach (System.Diagnostics.Process p in procs) {
            try {
                foreach (System.Diagnostics.ProcessThread t in p.Threads) {
                    EnumThreadWindows(t.Id, delegate(IntPtr hWnd, IntPtr lParam) {
                        if (IsWindowVisible(hWnd)) {
                            StringBuilder sb = new StringBuilder(512);
                            GetWindowText(hWnd, sb, 512);
                            string title = sb.ToString();

                            bool ok = SetWindowDisplayAffinity(hWnd, WDA_EXCLUDEFROMCAPTURE);
                            int err = Marshal.GetLastWin32Error();
                            protectedWindows.Add(string.Format("PID: {0} | HWND: 0x{1:X} | Success: {2} | Err: {3} | Title: '{4}'", p.Id, hWnd.ToInt64(), ok, err, title));
                        }
                        return true;
                    }, IntPtr.Zero);
                }
            } catch {}
        }
        return protectedWindows;
    }
}
"@

$results = [ThreadWindowCloak]::ProtectAllAntigravityWindows()
Write-Host "Total Windows Checked: $($results.Count)"
foreach ($r in $results) {
    Write-Host $r
}

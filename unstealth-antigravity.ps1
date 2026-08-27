# Restores Antigravity IDE window to normal taskbar and screen capture visibility

$signature = @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class RestoreWindow {
    [DllImport("user32.dll")]
    public static extern bool SetWindowDisplayAffinity(IntPtr hWnd, uint dwAffinity);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    public const uint WDA_NONE = 0x00000000;
    public const int GWL_EXSTYLE = -20;
    public const int WS_EX_TOOLWINDOW = 0x00000080;
    public const int WS_EX_APPWINDOW = 0x00040000;

    public static void Unprotect(IntPtr hWnd) {
        if (hWnd == IntPtr.Zero) return;
        SetWindowDisplayAffinity(hWnd, WDA_NONE);
        int exStyle = GetWindowLong(hWnd, GWL_EXSTYLE);
        exStyle = (exStyle & ~WS_EX_TOOLWINDOW) | WS_EX_APPWINDOW;
        ShowWindow(hWnd, 0);
        SetWindowLong(hWnd, GWL_EXSTYLE, exStyle);
        ShowWindow(hWnd, 5);
    }
}
"@

Add-Type -TypeDefinition $signature

$processes = Get-Process | Where-Object { $_.ProcessName -like "*antigravity*" -or $_.MainWindowTitle -like "*Antigravity*" -or $_.MainWindowTitle -like "*Ultron3*" }

foreach ($proc in $processes) {
    if ($proc.MainWindowHandle -ne [IntPtr]::Zero) {
        [RestoreWindow]::Unprotect($proc.MainWindowHandle)
        Write-Host "[SUCCESS] Restored normal window for: '$($proc.MainWindowTitle)'" -ForegroundColor Green
    }
}

Write-Host "`nAntigravity is now in NORMAL MODE (Visible on taskbar and screen capture)." -ForegroundColor Cyan

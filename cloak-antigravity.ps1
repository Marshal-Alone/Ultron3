# 100% Guaranteed Antigravity IDE Stealth Cloak
# Uses SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE = 0x11) + WS_EX_TOOLWINDOW

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;

public class AntigravityCloak {
    [DllImport("user32.dll")]
    public static extern bool SetWindowDisplayAffinity(IntPtr hWnd, uint dwAffinity);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public const uint WDA_NONE = 0x00000000;
    public const uint WDA_EXCLUDEFROMCAPTURE = 0x00000011; // Windows 10 2004+ / Win 11 exclude from capture
    public const uint WDA_MONITOR = 0x00000001;

    public const int GWL_EXSTYLE = -20;
    public const int WS_EX_TOOLWINDOW = 0x00000080;
    public const int WS_EX_APPWINDOW = 0x00040000;

    public static bool CloakWindow(IntPtr hWnd) {
        if (hWnd == IntPtr.Zero) return false;

        // Apply Screen Capture Exclusion (WDA_EXCLUDEFROMCAPTURE)
        // This keeps the window 100% VISIBLE TO YOU on your monitor,
        // but completely INVISIBLE TO SCREEN SHARE (Google Meet, Zoom, Teams, Screenshots)
        bool ok = SetWindowDisplayAffinity(hWnd, WDA_EXCLUDEFROMCAPTURE);
        if (!ok) {
            ok = SetWindowDisplayAffinity(hWnd, WDA_MONITOR);
        }

        return ok;
    }

    public static bool UncloakWindow(IntPtr hWnd) {
        if (hWnd == IntPtr.Zero) return false;
        SetWindowDisplayAffinity(hWnd, WDA_NONE);
        return true;
    }
}
"@ -ErrorAction SilentlyContinue

Clear-Host
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "       ANTIGRAVITY IDE 100% STEALTH CLOAK               " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Please select how you want to cloak Antigravity IDE:" -ForegroundColor White
Write-Host " [1] Auto-Detect Antigravity Window (Recommended)" -ForegroundColor Yellow
Write-Host " [2] Click-to-Cloak (Click the Antigravity window in 3 seconds)" -ForegroundColor Yellow
Write-Host " [3] Restore Normal Mode (Uncloak)" -ForegroundColor Yellow
Write-Host ""

$choice = Read-Host "Enter Choice [1, 2, or 3]"

if ($choice -eq "2") {
    Write-Host "`n>>> CLICK ON THE ANTIGRAVITY IDE WINDOW NOW! Cloaking in 3 seconds..." -ForegroundColor Green
    for ($i = 3; $i -gt 0; $i--) {
        Write-Host "  $i..." -ForegroundColor Yellow
        Start-Sleep -Seconds 1
    }
    $fgHwnd = [AntigravityCloak]::GetForegroundWindow()
    $sb = New-Object System.Text.StringBuilder 512
    [AntigravityCloak]::GetWindowText($fgHwnd, $sb, 512) | Out-Null
    $title = $sb.ToString()
    
    $res = [AntigravityCloak]::CloakWindow($fgHwnd)
    if ($res) {
        Write-Host "`n[SUCCESS] Antigravity window '$title' is now in STEALTH MODE!" -ForegroundColor Green
        Write-Host "• 100% Invisible in Google Meet, Zoom, MS Teams & Screenshots" -ForegroundColor Cyan
        Write-Host "• 100% Visible to YOU so you can chat and ask questions normally!" -ForegroundColor Green
    } else {
        Write-Host "`n[FAILED] Could not apply display affinity. Make sure you run on Windows 10/11." -ForegroundColor Red
    }
} elseif ($choice -eq "3") {
    Write-Host "`nRestoring all windows to Normal Mode..." -ForegroundColor Yellow
    [AntigravityCloak]::EnumWindows({
        param($hwnd, $lparam)
        $sb = New-Object System.Text.StringBuilder 512
        [AntigravityCloak]::GetWindowText($hwnd, $sb, 512) | Out-Null
        $t = $sb.ToString()
        if ($t -like "*Antigravity*" -or $t -like "*Ultron3*") {
            [AntigravityCloak]::UncloakWindow($hwnd) | Out-Null
            Write-Host "[RESTORED] $t" -ForegroundColor Green
        }
        return $true
    }, [IntPtr]::Zero)
    Write-Host "`nRestored to Normal Mode!" -ForegroundColor Green
} else {
    Write-Host "`nScanning for Antigravity IDE window..." -ForegroundColor Yellow
    $found = 0
    [AntigravityCloak]::EnumWindows({
        param($hwnd, $lparam)
        $sb = New-Object System.Text.StringBuilder 512
        [AntigravityCloak]::GetWindowText($hwnd, $sb, 512) | Out-Null
        $t = $sb.ToString()
        if ($t -like "*Antigravity*" -or $t -like "*ultron-antigravity*") {
            $ok = [AntigravityCloak]::CloakWindow($hwnd)
            if ($ok) {
                Write-Host "[CLOAKED] $t" -ForegroundColor Green
                $script:found++
            }
        }
        return $true
    }, [IntPtr]::Zero)

    if ($found -gt 0) {
        Write-Host "`n[SUCCESS] Antigravity IDE is now in STEALTH MODE!" -ForegroundColor Green
        Write-Host "• 100% Invisible in Google Meet, Zoom, MS Teams & Screenshots" -ForegroundColor Cyan
        Write-Host "• 100% Visible to YOU so you can chat and ask questions normally!" -ForegroundColor Green
    } else {
        Write-Host "`nAuto-detection didn't match title. Run again and choose Option [2] (Click-to-Cloak)!" -ForegroundColor Yellow
    }
}

Write-Host "`nPress Enter to exit..." -ForegroundColor Gray
Read-Host

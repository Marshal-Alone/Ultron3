Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Win32 Native Interop for Taskbar and Alt+Tab Cloaking
$win32Code = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;

[ComImport]
[Guid("56FDF342-43D4-11CF-9E06-00A0C90349BE")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface ITaskbarList {
    void HrInit();
    void AddTab(IntPtr hWnd);
    void DeleteTab(IntPtr hWnd);
    void ActivateTab(IntPtr hWnd);
    void SetActiveAlt(IntPtr hWnd);
}

[ComImport]
[Guid("56FDF344-43D4-11CF-9E06-00A0C90349BE")]
[ClassInterface(ClassInterfaceType.None)]
public class TaskbarInstance {}

public class WindowManager {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public const int GWL_EXSTYLE = -20;
    public const int WS_EX_TOOLWINDOW = 0x00000080;
    public const int WS_EX_APPWINDOW = 0x00040000;
    public const uint SWP_FRAMECHANGED = 0x0020;
    public const uint SWP_NOMOVE = 0x0002;
    public const uint SWP_NOSIZE = 0x0001;
    public const uint SWP_NOZORDER = 0x0004;

    private static ITaskbarList _taskbarList;

    static WindowManager() {
        try {
            _taskbarList = (ITaskbarList)new TaskbarInstance();
            _taskbarList.HrInit();
        } catch {}
    }

    public static bool HideFromTaskbarAndAltTab(IntPtr hWnd) {
        if (hWnd == IntPtr.Zero) return false;
        try {
            // 1. Delete from Windows Taskbar
            if (_taskbarList != null) {
                _taskbarList.DeleteTab(hWnd);
            }

            // 2. Add WS_EX_TOOLWINDOW to remove from Alt+Tab and Task View
            int exStyle = GetWindowLong(hWnd, GWL_EXSTYLE);
            exStyle = (exStyle | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW;
            SetWindowLong(hWnd, GWL_EXSTYLE, exStyle);
            SetWindowPos(hWnd, IntPtr.Zero, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);

            return true;
        } catch {
            return false;
        }
    }

    public static bool RestoreToTaskbarAndAltTab(IntPtr hWnd) {
        if (hWnd == IntPtr.Zero) return false;
        try {
            // 1. Restore normal styles
            int exStyle = GetWindowLong(hWnd, GWL_EXSTYLE);
            exStyle = (exStyle & ~WS_EX_TOOLWINDOW) | WS_EX_APPWINDOW;
            SetWindowLong(hWnd, GWL_EXSTYLE, exStyle);
            SetWindowPos(hWnd, IntPtr.Zero, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);

            // 2. Add back to Windows Taskbar
            if (_taskbarList != null) {
                _taskbarList.AddTab(hWnd);
            }

            return true;
        } catch {
            return false;
        }
    }
}
"@

Add-Type -TypeDefinition $win32Code -ErrorAction SilentlyContinue

# Create Modern Dark-Themed GUI Form
$form = New-Object System.Windows.Forms.Form
$form.Text = "Taskbar & Alt+Tab Stealth Cloaker"
$form.Size = New-Object System.Drawing.Size(720, 600)
$form.StartPosition = "CenterScreen"
$form.BackColor = [System.Drawing.Color]::FromArgb(20, 24, 30)
$form.ForeColor = [System.Drawing.Color]::White
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)

# Header Label
$header = New-Object System.Windows.Forms.Label
$header.Text = "🥷 Taskbar & Alt+Tab Stealth Manager"
$header.Font = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)
$header.ForeColor = [System.Drawing.Color]::FromArgb(0, 210, 255)
$header.Location = New-Object System.Drawing.Point(20, 15)
$header.Size = New-Object System.Drawing.Size(500, 30)
$form.Controls.Add($header)

# Subtitle
$sub = New-Object System.Windows.Forms.Label
$sub.Text = "Check any running app below to INSTANTLY hide its icon from the Taskbar & Alt+Tab. Uncheck to restore."
$sub.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$sub.ForeColor = [System.Drawing.Color]::FromArgb(160, 170, 185)
$sub.Location = New-Object System.Drawing.Point(22, 45)
$sub.Size = New-Object System.Drawing.Size(660, 20)
$form.Controls.Add($sub)

# Search Filter Box
$searchLabel = New-Object System.Windows.Forms.Label
$searchLabel.Text = "Search Filter:"
$searchLabel.Location = New-Object System.Drawing.Point(22, 77)
$searchLabel.Size = New-Object System.Drawing.Size(90, 22)
$form.Controls.Add($searchLabel)

$searchBox = New-Object System.Windows.Forms.TextBox
$searchBox.Location = New-Object System.Drawing.Point(115, 74)
$searchBox.Size = New-Object System.Drawing.Size(260, 26)
$searchBox.BackColor = [System.Drawing.Color]::FromArgb(35, 40, 50)
$searchBox.ForeColor = [System.Drawing.Color]::White
$searchBox.BorderStyle = "FixedSingle"
$form.Controls.Add($searchBox)

# Refresh Button
$refreshBtn = New-Object System.Windows.Forms.Button
$refreshBtn.Text = "🔄 Refresh List"
$refreshBtn.Location = New-Object System.Drawing.Point(390, 72)
$refreshBtn.Size = New-Object System.Drawing.Size(125, 28)
$refreshBtn.FlatStyle = "Flat"
$refreshBtn.BackColor = [System.Drawing.Color]::FromArgb(40, 50, 65)
$refreshBtn.ForeColor = [System.Drawing.Color]::FromArgb(0, 210, 255)
$form.Controls.Add($refreshBtn)

# Restore All Button
$restoreAllBtn = New-Object System.Windows.Forms.Button
$restoreAllBtn.Text = "♻️ Restore All"
$restoreAllBtn.Location = New-Object System.Drawing.Point(525, 72)
$restoreAllBtn.Size = New-Object System.Drawing.Size(155, 28)
$restoreAllBtn.FlatStyle = "Flat"
$restoreAllBtn.BackColor = [System.Drawing.Color]::FromArgb(55, 35, 45)
$restoreAllBtn.ForeColor = [System.Drawing.Color]::FromArgb(255, 100, 120)
$form.Controls.Add($restoreAllBtn)

# CheckedListBox
$list = New-Object System.Windows.Forms.CheckedListBox
$list.Location = New-Object System.Drawing.Point(22, 115)
$list.Size = New-Object System.Drawing.Size(660, 390)
$list.BackColor = [System.Drawing.Color]::FromArgb(28, 33, 42)
$list.ForeColor = [System.Drawing.Color]::White
$list.BorderStyle = "FixedSingle"
$list.CheckOnClick = $true
$form.Controls.Add($list)

# Status Bar
$statusBar = New-Object System.Windows.Forms.Label
$statusBar.Text = "Ready"
$statusBar.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$statusBar.ForeColor = [System.Drawing.Color]::FromArgb(0, 220, 130)
$statusBar.Location = New-Object System.Drawing.Point(22, 520)
$statusBar.Size = New-Object System.Drawing.Size(660, 25)
$form.Controls.Add($statusBar)

# Store Window Info Objects
$script:windowMap = @{}      # Text -> @{ Hwnd, ProcessName, Title }
$script:hiddenHwnds = @{}    # Hwnd -> $true
$script:updatingList = $false

function Refresh-WindowList {
    $script:updatingList = $true
    $list.Items.Clear()
    $script:windowMap = @{}

    $filter = $searchBox.Text.Trim().ToLower()

    [WindowManager]::EnumWindows({
        param($hWnd, $lParam)
        if (![WindowManager]::IsWindowVisible($hWnd)) { return $true }

        $sb = New-Object System.Text.StringBuilder 512
        [WindowManager]::GetWindowText($hWnd, $sb, 512) | Out-Null
        $title = $sb.ToString()

        if ([string]::IsNullOrWhiteSpace($title)) { return $true }

        # Ignore our own manager window and system overlays
        if ($title -eq "Taskbar & Alt+Tab Stealth Cloaker" -or $title -eq "Program Manager" -or $title -eq "Windows Input Experience") {
            return $true
        }

        $pid = 0
        [WindowManager]::GetWindowThreadProcessId($hWnd, [ref]$pid) | Out-Null
        $pname = ""
        try {
            $p = [System.Diagnostics.Process]::GetProcessById($pid)
            $pname = $p.ProcessName
        } catch {}

        $itemText = "[$pname] $title"

        if ($filter -eq "" -or $itemText.ToLower().Contains($filter)) {
            $script:windowMap[$itemText] = @{
                Hwnd = $hWnd
                ProcessName = $pname
                Title = $title
            }
            
            $isChecked = $script:hiddenHwnds.ContainsKey($hWnd)
            $list.Items.Add($itemText, $isChecked) | Out-Null
        }

        return $true
    }, [IntPtr]::Zero)

    $script:updatingList = $false
    $statusBar.Text = "Found $($list.Items.Count) visible desktop programs."
}

# Checkbox Toggle Event
$list.add_ItemCheck({
    param($sender, $e)
    if ($script:updatingList) { return }

    $itemText = $list.Items[$e.Index]
    $winInfo = $script:windowMap[$itemText]

    if ($winInfo) {
        $hwnd = $winInfo.Hwnd
        if ($e.NewValue -eq [System.Windows.Forms.CheckState]::Checked) {
            # HIDE
            $ok = [WindowManager]::HideFromTaskbarAndAltTab($hwnd)
            $script:hiddenHwnds[$hwnd] = $true
            $statusBar.Text = "🥷 HIDDEN from Taskbar & Alt+Tab: $($winInfo.Title)"
            $statusBar.ForeColor = [System.Drawing.Color]::FromArgb(0, 210, 255)
        } else {
            # RESTORE
            $ok = [WindowManager]::RestoreToTaskbarAndAltTab($hwnd)
            $script:hiddenHwnds.Remove($hwnd)
            $statusBar.Text = "✅ RESTORED to Taskbar & Alt+Tab: $($winInfo.Title)"
            $statusBar.ForeColor = [System.Drawing.Color]::FromArgb(0, 220, 130)
        }
    }
})

# Search Box KeyUp Filter
$searchBox.add_TextChanged({
    Refresh-WindowList
})

# Refresh Button Click
$refreshBtn.add_Click({
    Refresh-WindowList
})

# Restore All Button Click
$restoreAllBtn.add_Click({
    $script:updatingList = $true
    foreach ($hwnd in @($script:hiddenHwnds.Keys)) {
        [WindowManager]::RestoreToTaskbarAndAltTab($hwnd)
    }
    $script:hiddenHwnds.Clear()
    $script:updatingList = $false
    Refresh-WindowList
    $statusBar.Text = "✅ All windows restored to Taskbar and Alt+Tab!"
    $statusBar.ForeColor = [System.Drawing.Color]::FromArgb(0, 220, 130)
})

# Initial Population
Refresh-WindowList

# Show Form
[System.Windows.Forms.Application]::Run($form)

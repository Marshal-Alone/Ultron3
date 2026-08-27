$signature = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;

public class WinDumper {
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public static List<string> Dump() {
        List<string> list = new List<string>();
        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
            if (!IsWindowVisible(hWnd)) return true;
            StringBuilder sb = new StringBuilder(512);
            GetWindowText(hWnd, sb, 512);
            string title = sb.ToString();
            if (!string.IsNullOrWhiteSpace(title)) {
                list.Add(title);
            }
            return true;
        }, IntPtr.Zero);
        return list;
    }
}
"@

Add-Type -TypeDefinition $signature -ErrorAction SilentlyContinue
$titles = [WinDumper]::Dump()
foreach ($t in $titles) {
    Write-Host "TITLE: $t"
}

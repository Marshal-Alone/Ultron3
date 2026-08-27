$proc = Get-Process | Where-Object { $_.MainWindowTitle -like "*Antigravity*" }
if ($proc) {
    Write-Host "Found: $($proc.Id) | $($proc.ProcessName) | $($proc.Path)"
} else {
    Get-Process | Where-Object { $_.Path -like "*antigravity*" } | ForEach-Object {
        Write-Host "Path Match: $($_.Id) | $($_.ProcessName) | $($_.Path)"
    }
}

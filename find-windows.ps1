$procs = Get-Process
foreach ($p in $procs) {
    if ($p.MainWindowTitle) {
        Write-Output "$($p.Id) | $($p.ProcessName) | $($p.MainWindowTitle)"
    }
}

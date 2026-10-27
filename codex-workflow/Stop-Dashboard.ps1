param([int]$Port = 19329)
$ErrorActionPreference = 'Stop'
$dashboardScript = Join-Path $PSScriptRoot 'dashboard.py'
$listeners = @(Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
if (-not $listeners) { Write-Host 'Dashboard da dung.'; return }
foreach ($listener in $listeners) {
    $serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
    if (-not $serverProcess -or $serverProcess.Name -notin @('python.exe', 'pythonw.exe') -or -not $serverProcess.CommandLine.Contains($dashboardScript) -or $serverProcess.CommandLine -notmatch '\bserve\b') {
        throw "Cong $Port khong thuoc dashboard workspace nay; khong dung tien trinh."
    }
    Stop-Process -Id $serverProcess.ProcessId
    Write-Host "Da dung dashboard PID $($serverProcess.ProcessId)."
}

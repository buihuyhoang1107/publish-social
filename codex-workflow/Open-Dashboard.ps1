param([int]$Port = 19329, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$dashboardScript = Join-Path $PSScriptRoot 'dashboard.py'
$workspacePath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$dashboardUrl = "http://127.0.0.1:$Port"

function Get-Dashboard {
    try {
        return Invoke-RestMethod -Uri "$dashboardUrl/api/state" -TimeoutSec 2
    } catch {
        return $null
    }
}

$existing = Get-Dashboard
if ($existing -and ($existing.service -ne 'manu-codex-dashboard' -or $existing.workspace_path -ne $workspacePath)) {
    throw "Cong $Port dang duoc dung boi dich vu/workspace khac. Chon -Port khac."
}
if (-not $existing) {
    $pythonPath = (Get-Command python -ErrorAction Stop).Source
    $serverProcess = Start-Process -FilePath $pythonPath -ArgumentList @('-B', ('"{0}"' -f $dashboardScript), 'serve', '--port', $Port) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot '.dashboard-server.log') -RedirectStandardError (Join-Path $PSScriptRoot '.dashboard-server.error.log')
    $ready = $null
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 200
        $ready = Get-Dashboard
        if ($ready) { break }
        if ($serverProcess.HasExited) { throw 'Dashboard khong khoi dong duoc. Xem .dashboard-server.error.log.' }
    }
    if (-not $ready -or $ready.service -ne 'manu-codex-dashboard' -or $ready.workspace_path -ne $workspacePath) {
        throw 'Chua xac minh duoc dashboard. Xem .dashboard-server.error.log.'
    }
    Write-Host "Dashboard PID: $($serverProcess.Id)"
}
Write-Host $dashboardUrl
if (-not $NoBrowser) { Start-Process $dashboardUrl }

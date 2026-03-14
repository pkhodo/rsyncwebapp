$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$port = 8787
$url = "http://rsync.localhost:$port"

function Info($msg) { Write-Host "[rsyncwebapp] $msg" }

function Test-Port($p) {
  return $null -ne (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)
}

Info "Checking dependencies..."
$depsScript = Join-Path $PSScriptRoot "install-windows-deps.ps1"
if (Test-Path $depsScript) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $depsScript
} else {
  Info "Dependency script missing: $depsScript"
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw "Python is required. Install Python and rerun this script."
}

if (-not (Test-Port $port)) {
  Info "Starting backend server..."
  Start-Process python -ArgumentList "app\backend\server.py" -WorkingDirectory $root -WindowStyle Hidden
  Start-Sleep -Seconds 1
}

Info "Opening $url"
Start-Process $url

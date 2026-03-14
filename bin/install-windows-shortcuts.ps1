$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath("Desktop")

function New-RsyncShortcut {
  param(
    [string]$Name,
    [string]$Command
  )
  $wsh = New-Object -ComObject WScript.Shell
  $shortcut = $wsh.CreateShortcut((Join-Path $desktop "$Name.lnk"))
  $shortcut.TargetPath = "powershell.exe"
  $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -Command ""$Command"""
  $shortcut.WorkingDirectory = $root
  $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,13"
  $shortcut.Save()
}

$startCommand = "Set-Location '$root'; powershell -NoProfile -ExecutionPolicy Bypass -File '.\bin\windows-quickstart.ps1'"
$stopCommand = "Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }; Write-Host 'Stopped listeners on 8787.'"
$statusCommand = "if (Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue) { Write-Host 'Rsync Web App: running on 8787' } else { Write-Host 'Rsync Web App: not running' }; Pause"

New-RsyncShortcut -Name "Rsync Web App Start" -Command $startCommand
New-RsyncShortcut -Name "Rsync Web App Stop" -Command $stopCommand
New-RsyncShortcut -Name "Rsync Web App Status" -Command $statusCommand

Write-Host "Installed Windows desktop shortcuts:"
Write-Host " - Rsync Web App Start"
Write-Host " - Rsync Web App Stop"
Write-Host " - Rsync Web App Status"

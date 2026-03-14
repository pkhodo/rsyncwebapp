$ErrorActionPreference = "Stop"

function Has-Cmd([string]$name) {
  return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function Check-Status {
  $pythonOk = Has-Cmd "python"
  $sshOk = Has-Cmd "ssh"
  $rsyncOk = Has-Cmd "rsync"
  Write-Host "python: $pythonOk"
  Write-Host "ssh: $sshOk"
  Write-Host "rsync: $rsyncOk"
  return ($pythonOk -and $sshOk -and $rsyncOk)
}

if (Check-Status) {
  Write-Host "Dependencies already installed."
  exit 0
}

if (-not (Has-Cmd "winget")) {
  Write-Host "winget not found. Install dependencies manually: Python 3, OpenSSH Client, rsync (via WSL/MSYS2)."
  exit 2
}

if (-not (Has-Cmd "python")) {
  winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
}

if (-not (Has-Cmd "ssh")) {
  Write-Host "OpenSSH client is typically available on modern Windows."
  Write-Host "If missing, enable Optional Feature: OpenSSH Client."
}

if (-not (Has-Cmd "rsync")) {
  Write-Host "Installing MSYS2 (provides rsync)."
  winget install -e --id MSYS2.MSYS2 --accept-package-agreements --accept-source-agreements
  Write-Host "Add C:\msys64\usr\bin to PATH, then reopen terminal."
  Write-Host "Inside MSYS2 shell run: pacman -Sy --noconfirm rsync openssh"
}

if (Check-Status) {
  Write-Host "Dependencies ready."
  exit 0
}

Write-Host "Dependency install incomplete. Follow instructions above, then retry."
exit 2

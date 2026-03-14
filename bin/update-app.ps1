$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$releaseUrl = if ($env:RSYNC_WEBAPP_RELEASE_URL) { $env:RSYNC_WEBAPP_RELEASE_URL } else { "https://github.com/pkhodo/rsyncwebapp/releases/latest" }

Set-Location $root

if ((Test-Path ".git") -and (Get-Command git -ErrorAction SilentlyContinue)) {
  $dirty = git status --porcelain
  if ($dirty) {
    throw "Working tree has uncommitted changes. Commit/stash first, then rerun update."
  }
  $branch = git branch --show-current
  if (-not $branch) { $branch = "main" }
  Write-Host "Updating from origin/$branch..."
  git fetch --tags origin
  git pull --ff-only origin $branch
  if ((Test-Path "package.json") -and (Get-Command npm -ErrorAction SilentlyContinue)) {
    npm install --no-audit --no-fund | Out-Null
  }
  Write-Host "Update complete."
  exit 0
}

Write-Host "This install is not a git checkout."
Write-Host "Opening latest release ZIP page..."
Start-Process $releaseUrl

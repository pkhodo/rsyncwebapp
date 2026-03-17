$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$releaseUrl = if ($env:RSYNC_WEBAPP_RELEASE_URL) { $env:RSYNC_WEBAPP_RELEASE_URL } else { "https://github.com/pkhodo/rsyncwebapp/releases/latest" }

Set-Location $root

if ((Test-Path ".git") -and (Get-Command git -ErrorAction SilentlyContinue)) {
  $dirty = git status --porcelain
  if ($dirty) {
    throw "Working tree has uncommitted changes. Commit/stash first, then rerun update."
  }
  $currentBranch = (git branch --show-current).Trim()
  $targetBranch = "main"
  Write-Host "Updating from origin/$targetBranch..."
  git fetch --tags origin $targetBranch
  if (-not $currentBranch -or $currentBranch -ne $targetBranch) {
    git show-ref --verify --quiet "refs/heads/$targetBranch"
    if ($LASTEXITCODE -eq 0) {
      git checkout $targetBranch
    } else {
      git checkout -b $targetBranch "origin/$targetBranch"
    }
  }
  git pull --ff-only origin $targetBranch
  if ((Test-Path "package.json") -and (Get-Command npm -ErrorAction SilentlyContinue)) {
    npm install --no-audit --no-fund | Out-Null
  }
  Write-Host "Update complete."
  exit 0
}

Write-Host "This install is not a git checkout."
Write-Host "Opening latest release ZIP page..."
Start-Process $releaseUrl

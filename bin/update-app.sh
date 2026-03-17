#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RELEASE_URL="${RSYNC_WEBAPP_RELEASE_URL:-https://github.com/pkhodo/rsyncwebapp/releases/latest}"

cd "${ROOT_DIR}"

if [ -d ".git" ] && command -v git >/dev/null 2>&1; then
  if [ -n "$(git status --porcelain)" ]; then
    echo "Working tree has uncommitted changes."
    echo "Commit/stash your changes, then rerun update."
    exit 1
  fi
  CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || true)"
  TARGET_BRANCH="main"
  echo "Updating from origin/${TARGET_BRANCH}..."
  git fetch --tags origin "${TARGET_BRANCH}"
  if [ -z "${CURRENT_BRANCH}" ] || [ "${CURRENT_BRANCH}" != "${TARGET_BRANCH}" ]; then
    if git show-ref --verify --quiet "refs/heads/${TARGET_BRANCH}"; then
      git checkout "${TARGET_BRANCH}"
    else
      git checkout -b "${TARGET_BRANCH}" "origin/${TARGET_BRANCH}"
    fi
  fi
  git pull --ff-only origin "${TARGET_BRANCH}"
  if [ -f "package.json" ] && command -v npm >/dev/null 2>&1; then
    npm install --no-audit --no-fund >/dev/null 2>&1 || true
  fi
  echo "Update complete."
  exit 0
fi

echo "This install is not a git checkout."
echo "Open latest release and download ZIP: ${RELEASE_URL}"
if command -v open >/dev/null 2>&1; then
  open "${RELEASE_URL}" || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "${RELEASE_URL}" || true
fi

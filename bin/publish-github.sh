#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_NAME="${1:-rsyncwebapp}"
VISIBILITY="${2:-public}" # public|private

if ! command -v git >/dev/null 2>&1; then
  echo "git is required."
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required to publish automatically."
  echo "Install gh and run: gh auth login"
  exit 1
fi

cd "${ROOT_DIR}"

if [ ! -d .git ]; then
  git init
  git branch -M main
fi

git add .
if ! git diff --cached --quiet; then
  git commit -m "Initial release: rsyncwebapp"
fi

if git remote get-url origin >/dev/null 2>&1; then
  git push -u origin main
  echo "Pushed to existing origin."
  exit 0
fi

gh repo create "${REPO_NAME}" --"${VISIBILITY}" --source . --remote origin --push
echo "Published: ${REPO_NAME}"

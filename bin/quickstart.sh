#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Rsync Web App quickstart"
echo "Repository: ${ROOT_DIR}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required."
  echo "Run: ${ROOT_DIR}/bin/install-deps.sh"
  exit 1
fi

if ! command -v ssh >/dev/null 2>&1 || ! command -v rsync >/dev/null 2>&1; then
  echo "Installing missing dependencies..."
  if ! "${ROOT_DIR}/bin/install-deps.sh"; then
    echo "Dependency install did not complete automatically."
    echo "Run install command from output above, then rerun quickstart."
    exit 1
  fi
fi

"${ROOT_DIR}/bin/start-ui.sh"
"${ROOT_DIR}/bin/open-ui.sh"

PORT="$("${ROOT_DIR}/bin/resolve-ui-port.sh")"
echo "Done. Open http://rsync.localhost:${PORT}"

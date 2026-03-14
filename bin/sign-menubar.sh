#!/usr/bin/env bash
set -euo pipefail

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This script is for macOS only."
  exit 1
fi

IDENTITY="${1:-${CODESIGN_IDENTITY:-}}"
APP_PATH="${2:-${HOME}/Applications/RsyncWebAppMenuBar.app}"

if [ -z "${IDENTITY}" ]; then
  echo "Usage: ./bin/sign-menubar.sh \"Developer ID Application: NAME (TEAMID)\" [app_path]"
  echo "Or set CODESIGN_IDENTITY in your shell."
  exit 1
fi

if [ ! -d "${APP_PATH}" ]; then
  echo "App not found: ${APP_PATH}"
  echo "Install it first: ./bin/install-menubar.sh"
  exit 1
fi

if ! command -v codesign >/dev/null 2>&1; then
  echo "codesign command not found."
  exit 1
fi

echo "Signing ${APP_PATH}"
codesign --force --deep --options runtime --timestamp --sign "${IDENTITY}" "${APP_PATH}"

echo "Verifying signature..."
codesign --verify --deep --strict --verbose=2 "${APP_PATH}"

if command -v spctl >/dev/null 2>&1; then
  echo "Gatekeeper assessment:"
  spctl --assess --type execute --verbose=2 "${APP_PATH}" || true
fi

echo "Done."
echo "Next (optional): ./bin/notarize-menubar.sh <notary-profile> \"${APP_PATH}\""

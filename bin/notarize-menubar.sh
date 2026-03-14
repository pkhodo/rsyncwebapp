#!/usr/bin/env bash
set -euo pipefail

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This script is for macOS only."
  exit 1
fi

PROFILE="${1:-}"
APP_PATH="${2:-${HOME}/Applications/RsyncWebAppMenuBar.app}"

if [ -z "${PROFILE}" ]; then
  echo "Usage: ./bin/notarize-menubar.sh <notary-profile> [app_path]"
  echo "Example: ./bin/notarize-menubar.sh rsyncwebapp-notary"
  exit 1
fi

if [ ! -d "${APP_PATH}" ]; then
  echo "App not found: ${APP_PATH}"
  exit 1
fi

if ! command -v xcrun >/dev/null 2>&1; then
  echo "xcrun not found."
  exit 1
fi

TMP_DIR="$(mktemp -d)"
ZIP_PATH="${TMP_DIR}/RsyncWebAppMenuBar.zip"
APP_DIR="$(dirname "${APP_PATH}")"
APP_NAME="$(basename "${APP_PATH}")"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

echo "Creating archive..."
(
  cd "${APP_DIR}"
  /usr/bin/ditto -c -k --sequesterRsrc --keepParent "${APP_NAME}" "${ZIP_PATH}"
)

echo "Submitting to notarization service..."
xcrun notarytool submit "${ZIP_PATH}" --keychain-profile "${PROFILE}" --wait

echo "Stapling ticket..."
xcrun stapler staple "${APP_PATH}"

echo "Validating stapled ticket..."
xcrun stapler validate "${APP_PATH}"

echo "Notarization complete."

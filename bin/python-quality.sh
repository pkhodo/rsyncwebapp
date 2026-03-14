#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV_DIR="${ROOT_DIR}/.venv-quality"
PYTHON_BIN="${PYTHON_BIN:-python3}"

if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
  echo "python3 is required."
  exit 1
fi

if [ ! -d "${VENV_DIR}" ]; then
  echo "Creating local quality venv at ${VENV_DIR}"
  "${PYTHON_BIN}" -m venv "${VENV_DIR}"
fi

"${VENV_DIR}/bin/python" -m pip install --upgrade pip >/dev/null
"${VENV_DIR}/bin/pip" install -r "${ROOT_DIR}/requirements-dev.txt" >/dev/null

echo "Running Ruff..."
"${VENV_DIR}/bin/ruff" check "${ROOT_DIR}/app" "${ROOT_DIR}/tests"

echo "Running mypy..."
"${VENV_DIR}/bin/mypy" "${ROOT_DIR}/app/backend/server.py" "${ROOT_DIR}/tests/test_backend.py"

echo "Running backend tests..."
"${VENV_DIR}/bin/python" -m unittest discover -s "${ROOT_DIR}/tests" -v

echo "Python quality checks completed."

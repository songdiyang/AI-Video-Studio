#!/bin/sh
set -eu

mkdir -p /app/backend/logs

TARGET_DIR="${BACKEND_FALLBACK_DIR:-/app/backend}"
RUNTIME_DIR="${BACKEND_RUNTIME_DIR:-/srv/backend-runtime/current}"

if [ -f "${RUNTIME_DIR}/package.json" ] && [ -f "${RUNTIME_DIR}/src/index.js" ]; then
  TARGET_DIR="${RUNTIME_DIR}"
  echo "[backend] starting from runtime release ${RUNTIME_DIR}"
else
  echo "[backend] runtime release missing, falling back to bundled code at ${TARGET_DIR}"
fi

cd "${TARGET_DIR}"

exec "$@"

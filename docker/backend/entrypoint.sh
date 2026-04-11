#!/bin/sh
set -eu

RUNTIME_DIR="${BACKEND_RUNTIME_DIR:-/srv/backend-runtime/current}"

if [ ! -f "${RUNTIME_DIR}/package.json" ] || [ ! -f "${RUNTIME_DIR}/src/index.js" ]; then
  echo "[backend] runtime release missing at ${RUNTIME_DIR}" >&2
  echo "[backend] run npm run build:release && npm run release:bootstrap before docker:up" >&2
  exit 1
fi

echo "[backend] starting from runtime release ${RUNTIME_DIR}"

cd "${RUNTIME_DIR}"

exec "$@"

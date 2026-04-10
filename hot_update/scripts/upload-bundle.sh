#!/bin/sh
set -eu

if [ "$#" -lt 1 ]; then
  echo "usage: HOT_UPDATE_API_TOKEN=... HOT_UPDATE_SHARED_SECRET=... $0 <bundle-path> [upload-url]" >&2
  exit 1
fi

BUNDLE_PATH="$1"
UPLOAD_URL="${2:-${HOT_UPDATE_URL:-http://127.0.0.1:4205/api/artifacts/upload}}"

if [ ! -f "${BUNDLE_PATH}" ]; then
  echo "bundle not found: ${BUNDLE_PATH}" >&2
  exit 1
fi

: "${HOT_UPDATE_API_TOKEN:?HOT_UPDATE_API_TOKEN is required}"
: "${HOT_UPDATE_SHARED_SECRET:?HOT_UPDATE_SHARED_SECRET is required}"

TIMESTAMP="$(date +%s)000"
NONCE="$(openssl rand -hex 16)"
CONTENT_SHA="$(openssl dgst -sha256 "${BUNDLE_PATH}" | awk '{print $NF}')"
SIGNATURE="$(printf '%s\n%s\n%s' "${TIMESTAMP}" "${NONCE}" "${CONTENT_SHA}" \
  | openssl dgst -sha256 -hmac "${HOT_UPDATE_SHARED_SECRET}" \
  | awk '{print $NF}')"

curl --fail --show-error --silent \
  -X POST "${UPLOAD_URL}" \
  -H "Authorization: Bearer ${HOT_UPDATE_API_TOKEN}" \
  -H "x-nanostory-timestamp: ${TIMESTAMP}" \
  -H "x-nanostory-nonce: ${NONCE}" \
  -H "x-nanostory-content-sha256: ${CONTENT_SHA}" \
  -H "x-nanostory-signature: ${SIGNATURE}" \
  -F "bundle=@${BUNDLE_PATH};type=application/gzip"

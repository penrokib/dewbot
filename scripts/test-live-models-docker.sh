#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${DEWBOT_IMAGE:-${DEWBOT_IMAGE:-dewbot:local}}"
CONFIG_DIR="${DEWBOT_CONFIG_DIR:-${DEWBOT_CONFIG_DIR:-$HOME/.dewbot}}"
WORKSPACE_DIR="${DEWBOT_WORKSPACE_DIR:-${DEWBOT_WORKSPACE_DIR:-$HOME/.dewbot/workspace}}"
PROFILE_FILE="${DEWBOT_PROFILE_FILE:-${DEWBOT_PROFILE_FILE:-$HOME/.profile}}"

PROFILE_MOUNT=()
if [[ -f "$PROFILE_FILE" ]]; then
  PROFILE_MOUNT=(-v "$PROFILE_FILE":/home/node/.profile:ro)
fi

echo "==> Build image: $IMAGE_NAME"
docker build -t "$IMAGE_NAME" -f "$ROOT_DIR/Dockerfile" "$ROOT_DIR"

echo "==> Run live model tests (profile keys)"
docker run --rm -t \
  --entrypoint bash \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e HOME=/home/node \
  -e NODE_OPTIONS=--disable-warning=ExperimentalWarning \
  -e DEWBOT_LIVE_TEST=1 \
  -e DEWBOT_LIVE_MODELS="${DEWBOT_LIVE_MODELS:-${DEWBOT_LIVE_MODELS:-all}}" \
  -e DEWBOT_LIVE_PROVIDERS="${DEWBOT_LIVE_PROVIDERS:-${DEWBOT_LIVE_PROVIDERS:-}}" \
  -e DEWBOT_LIVE_MODEL_TIMEOUT_MS="${DEWBOT_LIVE_MODEL_TIMEOUT_MS:-${DEWBOT_LIVE_MODEL_TIMEOUT_MS:-}}" \
  -e DEWBOT_LIVE_REQUIRE_PROFILE_KEYS="${DEWBOT_LIVE_REQUIRE_PROFILE_KEYS:-${DEWBOT_LIVE_REQUIRE_PROFILE_KEYS:-}}" \
  -v "$CONFIG_DIR":/home/node/.dewbot \
  -v "$WORKSPACE_DIR":/home/node/.dewbot/workspace \
  "${PROFILE_MOUNT[@]}" \
  "$IMAGE_NAME" \
  -lc "set -euo pipefail; [ -f \"$HOME/.profile\" ] && source \"$HOME/.profile\" || true; cd /app && pnpm test:live"

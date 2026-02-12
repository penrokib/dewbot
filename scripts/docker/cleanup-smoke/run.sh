#!/usr/bin/env bash
set -euo pipefail

cd /repo

export DEWBOT_STATE_DIR="/tmp/dewbot-test"
export DEWBOT_CONFIG_PATH="${DEWBOT_STATE_DIR}/dewbot.json"

echo "==> Build"
pnpm build

echo "==> Seed state"
mkdir -p "${DEWBOT_STATE_DIR}/credentials"
mkdir -p "${DEWBOT_STATE_DIR}/agents/main/sessions"
echo '{}' >"${DEWBOT_CONFIG_PATH}"
echo 'creds' >"${DEWBOT_STATE_DIR}/credentials/marker.txt"
echo 'session' >"${DEWBOT_STATE_DIR}/agents/main/sessions/sessions.json"

echo "==> Reset (config+creds+sessions)"
pnpm dewbot reset --scope config+creds+sessions --yes --non-interactive

test ! -f "${DEWBOT_CONFIG_PATH}"
test ! -d "${DEWBOT_STATE_DIR}/credentials"
test ! -d "${DEWBOT_STATE_DIR}/agents/main/sessions"

echo "==> Recreate minimal config"
mkdir -p "${DEWBOT_STATE_DIR}/credentials"
echo '{}' >"${DEWBOT_CONFIG_PATH}"

echo "==> Uninstall (state only)"
pnpm dewbot uninstall --state --yes --non-interactive

test ! -d "${DEWBOT_STATE_DIR}"

echo "OK"

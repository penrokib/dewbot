#!/bin/bash
# =============================================================================
# DewBot OTA Update Script
# Pulls latest code, installs deps, builds, and restarts the service.
# =============================================================================
set -euo pipefail

INSTALL_DIR="/opt/dewbot"
REPO_BRANCH="dewbot/rebrand"
BACKUP_DIR="/opt/dewbot-backups"
SERVICE_NAME="dewbot"

echo "=== DewBot OTA Update ==="
echo "Date: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

# Ensure we are in the install directory
if [ ! -d "${INSTALL_DIR}" ]; then
  echo "ERROR: Install directory ${INSTALL_DIR} does not exist."
  echo "Run install.sh first."
  exit 1
fi

cd "${INSTALL_DIR}"

# --- Pre-update backup ---
echo "[1/5] Creating pre-update backup..."
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_PATH="${BACKUP_DIR}/${TIMESTAMP}"

mkdir -p "${BACKUP_DIR}"
mkdir -p "${BACKUP_PATH}"

# Back up dist, package.json, and pnpm-lock for rollback
if [ -d "${INSTALL_DIR}/dist" ]; then
  cp -r "${INSTALL_DIR}/dist" "${BACKUP_PATH}/dist"
fi
cp "${INSTALL_DIR}/package.json" "${BACKUP_PATH}/package.json" 2>/dev/null || true
cp "${INSTALL_DIR}/pnpm-lock.yaml" "${BACKUP_PATH}/pnpm-lock.yaml" 2>/dev/null || true

# Record the current commit for rollback reference
CURRENT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
echo "${CURRENT_COMMIT}" > "${BACKUP_PATH}/COMMIT_SHA"
echo "  Backup saved to ${BACKUP_PATH} (commit: ${CURRENT_COMMIT})"

# Clean up old backups (keep last 5)
BACKUP_COUNT=$(ls -1d "${BACKUP_DIR}"/*/ 2>/dev/null | wc -l)
if [ "${BACKUP_COUNT}" -gt 5 ]; then
  echo "  Cleaning old backups (keeping last 5)..."
  ls -1dt "${BACKUP_DIR}"/*/ | tail -n +6 | xargs rm -rf
fi

# --- Pull latest code ---
echo "[2/5] Pulling latest from ${REPO_BRANCH}..."
git fetch origin "${REPO_BRANCH}"
git checkout "${REPO_BRANCH}"
git reset --hard "origin/${REPO_BRANCH}"
NEW_COMMIT=$(git rev-parse HEAD)
echo "  Updated to commit: ${NEW_COMMIT}"

if [ "${CURRENT_COMMIT}" = "${NEW_COMMIT}" ]; then
  echo "  Already up to date. No changes to deploy."
  echo "=== Update Complete (no changes) ==="
  exit 0
fi

# Show what changed
echo "  Changes since last deploy:"
git log --oneline "${CURRENT_COMMIT}..${NEW_COMMIT}" 2>/dev/null | head -20 || true

# --- Install dependencies ---
echo "[3/5] Installing dependencies..."
pnpm install --frozen-lockfile

# --- Build ---
echo "[4/5] Building..."
pnpm run build || { echo "  Build failed! Rolling back..."; cp -r "${BACKUP_PATH}/dist" "${INSTALL_DIR}/dist"; exit 1; }

# Fix ownership
chown -R dewbot:dewbot "${INSTALL_DIR}" 2>/dev/null || true

# --- Restart service ---
echo "[5/5] Restarting ${SERVICE_NAME} service..."
systemctl restart "${SERVICE_NAME}"

# Wait briefly and check status
sleep 3
if systemctl is-active --quiet "${SERVICE_NAME}"; then
  echo "  Service is running."
else
  echo "  WARNING: Service failed to start. Check logs:"
  echo "    journalctl -u ${SERVICE_NAME} -n 50 --no-pager"
  echo ""
  echo "  To rollback:"
  echo "    cp -r ${BACKUP_PATH}/dist ${INSTALL_DIR}/dist"
  echo "    systemctl restart ${SERVICE_NAME}"
  exit 1
fi

echo ""
echo "=== DewBot Update Complete ==="
echo "Previous commit: ${CURRENT_COMMIT}"
echo "Current commit:  ${NEW_COMMIT}"
echo "Backup at:       ${BACKUP_PATH}"
echo "Service status:  $(systemctl is-active ${SERVICE_NAME})"

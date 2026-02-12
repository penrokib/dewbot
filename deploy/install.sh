#!/bin/bash
# =============================================================================
# DewBot VPS Bootstrap Script — Hetzner CX32
# Cloud-init / first-boot provisioning
# =============================================================================
set -euo pipefail

REPO_URL="https://github.com/penrokib/dewbot.git"
REPO_BRANCH="dewbot/rebrand"
INSTALL_DIR="/opt/dewbot"
WORKSPACE_DIR="/root/.dewbot"
SERVICE_USER="dewbot"

echo "=== DewBot VPS Bootstrap ==="
echo "Date: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

# --- System updates ---
echo "[1/8] Updating system packages..."
apt-get update -y
apt-get upgrade -y
apt-get install -y curl wget git build-essential ca-certificates gnupg

# --- Node.js 22 LTS via nodesource ---
echo "[2/8] Installing Node.js 22 LTS..."
if ! command -v node &>/dev/null || ! node -v | grep -q "v22"; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"

# --- pnpm ---
echo "[3/8] Installing pnpm..."
if ! command -v pnpm &>/dev/null; then
  npm install -g pnpm
fi
echo "pnpm version: $(pnpm -v)"

# --- Chromium for Playwright/Stagehand ---
echo "[4/8] Installing Chromium..."
apt-get install -y chromium-browser || apt-get install -y chromium || true
# Playwright may need its own browser binaries
if command -v npx &>/dev/null; then
  npx playwright install-deps chromium 2>/dev/null || true
fi

# --- Create service user ---
echo "[5/8] Creating service user '${SERVICE_USER}'..."
if ! id "${SERVICE_USER}" &>/dev/null; then
  useradd --system --shell /usr/sbin/nologin --home-dir "${INSTALL_DIR}" "${SERVICE_USER}"
fi

# --- Clone the repo ---
echo "[6/8] Cloning dewbot repository..."
if [ -d "${INSTALL_DIR}" ]; then
  echo "  Directory ${INSTALL_DIR} already exists, pulling latest..."
  cd "${INSTALL_DIR}"
  git fetch origin "${REPO_BRANCH}"
  git checkout "${REPO_BRANCH}"
  git reset --hard "origin/${REPO_BRANCH}"
else
  git clone --branch "${REPO_BRANCH}" "${REPO_URL}" "${INSTALL_DIR}"
fi

cd "${INSTALL_DIR}"
pnpm install --frozen-lockfile
pnpm run build || { echo "  Build failed! Check logs above."; exit 1; }

# Set ownership
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}"

# --- Workspace directory + config ---
echo "[7/8] Creating workspace directory..."
mkdir -p "${INSTALL_DIR}/.dewbot"
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}/.dewbot"

# Copy config template if no config exists
if [ ! -f "${INSTALL_DIR}/.dewbot/dewbot.json" ]; then
  if [ -f "${INSTALL_DIR}/deploy/dewbot.config.template.json" ]; then
    cp "${INSTALL_DIR}/deploy/dewbot.config.template.json" "${INSTALL_DIR}/.dewbot/dewbot.json"
    echo "  Config template copied — edit ${INSTALL_DIR}/.dewbot/dewbot.json with real values"
  fi
fi

# --- Systemd service ---
echo "[8/8] Installing systemd service..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/dewbot.service" ]; then
  cp "${SCRIPT_DIR}/dewbot.service" /etc/systemd/system/dewbot.service
elif [ -f "${INSTALL_DIR}/deploy/dewbot.service" ]; then
  cp "${INSTALL_DIR}/deploy/dewbot.service" /etc/systemd/system/dewbot.service
else
  echo "  WARNING: dewbot.service file not found, skipping service install"
fi

systemctl daemon-reload
systemctl enable dewbot.service
systemctl start dewbot.service || echo "  Service start deferred (config may be needed)"

# --- Firewall (UFW) ---
echo "Configuring firewall..."
apt-get install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment "SSH"
# Gateway binds to loopback only — no public port needed
# ufw allow 18789/tcp  # NOT exposed — Dewx services connect via localhost
ufw --force enable
ufw status verbose

echo ""
echo "=== DewBot Bootstrap Complete ==="
echo "Install dir:    ${INSTALL_DIR}"
echo "Workspace dir:  ${WORKSPACE_DIR}"
echo "Service user:   ${SERVICE_USER}"
echo "Service status: $(systemctl is-active dewbot.service 2>/dev/null || echo 'unknown')"
echo ""
echo "Next steps:"
echo "  1. Copy your config to ${WORKSPACE_DIR}/dewbot.json"
echo "  2. Restart the service: systemctl restart dewbot"
echo "  3. Check logs: journalctl -u dewbot -f"

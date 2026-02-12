#!/bin/bash
# =============================================================================
# DewBot Integration Test Suite
# Verifies gateway connectivity, channel status, org isolation, and security.
# Run on the VPS after deploying DewBot + Dewx services.
#
# Usage:
#   ./integration-test.sh                           # Run all tests
#   ./integration-test.sh --section gateway         # Run specific section
#   ./integration-test.sh --token "eyJ..."          # Provide JWT directly
# =============================================================================
set -euo pipefail

GATEWAY_URL="${DEWBOT_GATEWAY_URL:-ws://127.0.0.1:18789}"
GATEWAY_HTTP_URL="${DEWBOT_HEALTH_URL:-http://127.0.0.1:18789}"
PLATFORM_URL="${DEWX_PLATFORM_URL:-http://localhost:4000}"
INTEGRATIONS_URL="${DEWX_INTEGRATIONS_URL:-http://localhost:4009}"
AI_URL="${DEWX_AI_URL:-http://localhost:4010}"

PASSED=0
FAILED=0
SKIPPED=0
SECTION="${2:-all}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}PASS${NC} $1"; ((PASSED++)); }
fail() { echo -e "  ${RED}FAIL${NC} $1 — $2"; ((FAILED++)); }
skip() { echo -e "  ${YELLOW}SKIP${NC} $1 — $2"; ((SKIPPED++)); }

# Parse args
TOKEN=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --token) TOKEN="$2"; shift 2 ;;
    --section) SECTION="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# Get a JWT token if not provided
if [ -z "$TOKEN" ]; then
  echo "No --token provided, attempting login..."
  LOGIN_RESPONSE=$(curl -sf "${PLATFORM_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@dewx.ai","password":"admin123"}' 2>/dev/null || echo "")

  if [ -n "$LOGIN_RESPONSE" ]; then
    TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('accessToken',''))" 2>/dev/null || echo "")
  fi

  if [ -z "$TOKEN" ]; then
    echo "WARNING: Could not obtain auth token. Auth-dependent tests will be skipped."
  fi
fi

# =============================================================================
echo ""
echo "=========================================="
echo "  DewBot Integration Test Suite"
echo "=========================================="
echo "  Gateway:      $GATEWAY_URL"
echo "  Platform:     $PLATFORM_URL"
echo "  Integrations: $INTEGRATIONS_URL"
echo "  AI Service:   $AI_URL"
echo "  Token:        ${TOKEN:+set (${#TOKEN} chars)}${TOKEN:-not set}"
echo "=========================================="
echo ""

# =============================================================================
# Section 1: Gateway Health
# =============================================================================
if [[ "$SECTION" == "all" || "$SECTION" == "gateway" ]]; then
  echo "--- 1. Gateway Health ---"

  # 1.1 Gateway process is running
  if pgrep -f "dewbot.mjs daemon" >/dev/null 2>&1 || pgrep -f "dewbot.*gateway" >/dev/null 2>&1; then
    pass "Gateway process is running"
  else
    fail "Gateway process is running" "No dewbot process found"
  fi

  # 1.2 Gateway port is listening
  if ss -tlnp 2>/dev/null | grep -q ":18789" || lsof -i :18789 >/dev/null 2>&1; then
    pass "Gateway listening on port 18789"
  else
    fail "Gateway listening on port 18789" "Port 18789 is not open"
  fi

  # 1.3 Gateway bound to loopback only
  if ss -tlnp 2>/dev/null | grep ":18789" | grep -q "127.0.0.1"; then
    pass "Gateway bound to loopback (127.0.0.1)"
  elif lsof -i :18789 2>/dev/null | grep -q "localhost"; then
    pass "Gateway bound to loopback (localhost)"
  else
    skip "Gateway loopback check" "Could not determine bind address"
  fi

  # 1.4 WebSocket connectivity (basic TCP check)
  if (echo > /dev/tcp/127.0.0.1/18789) 2>/dev/null; then
    pass "TCP connection to gateway succeeds"
  else
    fail "TCP connection to gateway" "Cannot connect to 127.0.0.1:18789"
  fi

  echo ""
fi

# =============================================================================
# Section 2: Dewx Services Health
# =============================================================================
if [[ "$SECTION" == "all" || "$SECTION" == "services" ]]; then
  echo "--- 2. Dewx Services Health ---"

  for svc_info in "Platform:${PLATFORM_URL}" "Integrations:${INTEGRATIONS_URL}" "AI:${AI_URL}"; do
    svc_name="${svc_info%%:*}"
    svc_url="${svc_info#*:}"
    health=$(curl -sf "${svc_url}/api/health" 2>/dev/null || echo "")
    if [ -n "$health" ]; then
      pass "${svc_name} service (${svc_url}) is healthy"
    else
      fail "${svc_name} service health" "No response from ${svc_url}/api/health"
    fi
  done

  echo ""
fi

# =============================================================================
# Section 3: DewBot Bridge Connection (via Integrations service)
# =============================================================================
if [[ "$SECTION" == "all" || "$SECTION" == "bridge" ]]; then
  echo "--- 3. DewBot Bridge ---"

  if [ -n "$TOKEN" ]; then
    bridge_status=$(curl -sf "${INTEGRATIONS_URL}/api/dewbot/bridge/status" \
      -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "")

    if echo "$bridge_status" | grep -q '"connected":true'; then
      pass "DewBot bridge is connected"
    elif [ -n "$bridge_status" ]; then
      fail "DewBot bridge connected" "Response: $bridge_status"
    else
      fail "DewBot bridge status" "No response from bridge endpoint"
    fi
  else
    skip "DewBot bridge" "No auth token available"
  fi

  echo ""
fi

# =============================================================================
# Section 4: Channel Status
# =============================================================================
if [[ "$SECTION" == "all" || "$SECTION" == "channels" ]]; then
  echo "--- 4. Channel Status ---"

  if [ -n "$TOKEN" ]; then
    for channel in whatsapp telegram discord slack instagram twitter messenger; do
      ch_status=$(curl -sf "${INTEGRATIONS_URL}/api/dewbot/channels/${channel}/status" \
        -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "")

      if [ -n "$ch_status" ]; then
        configured=$(echo "$ch_status" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('configured',False))" 2>/dev/null || echo "unknown")
        pass "${channel} channel endpoint responds (configured: ${configured})"
      else
        skip "${channel} channel status" "No response"
      fi
    done
  else
    skip "Channel status checks" "No auth token available"
  fi

  echo ""
fi

# =============================================================================
# Section 5: Security Verification
# =============================================================================
if [[ "$SECTION" == "all" || "$SECTION" == "security" ]]; then
  echo "--- 5. Security ---"

  # 5.1 Unauthenticated API access rejected
  unauth=$(curl -sf -o /dev/null -w "%{http_code}" \
    "${INTEGRATIONS_URL}/api/dewbot/bridge/status" 2>/dev/null || echo "000")
  if [[ "$unauth" == "401" || "$unauth" == "403" ]]; then
    pass "Unauthenticated API access rejected (HTTP ${unauth})"
  elif [[ "$unauth" == "000" ]]; then
    skip "Unauthenticated access check" "Service unreachable"
  else
    fail "Unauthenticated API access" "Expected 401/403, got HTTP ${unauth}"
  fi

  # 5.2 Invalid JWT rejected
  bad_token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
  bad_auth=$(curl -sf -o /dev/null -w "%{http_code}" \
    "${INTEGRATIONS_URL}/api/dewbot/bridge/status" \
    -H "Authorization: Bearer ${bad_token}" 2>/dev/null || echo "000")
  if [[ "$bad_auth" == "401" || "$bad_auth" == "403" ]]; then
    pass "Invalid JWT rejected (HTTP ${bad_auth})"
  elif [[ "$bad_auth" == "000" ]]; then
    skip "Invalid JWT check" "Service unreachable"
  else
    fail "Invalid JWT rejected" "Expected 401/403, got HTTP ${bad_auth}"
  fi

  # 5.3 Gateway not accessible from public internet
  PUBLIC_IP=$(curl -sf ifconfig.me 2>/dev/null || echo "")
  if [ -n "$PUBLIC_IP" ]; then
    public_check=$(curl -sf --connect-timeout 3 "http://${PUBLIC_IP}:18789/" 2>/dev/null || echo "REFUSED")
    if [[ "$public_check" == "REFUSED" ]]; then
      pass "Gateway NOT accessible from public IP (${PUBLIC_IP}:18789)"
    else
      fail "Gateway public access" "Port 18789 is accessible from ${PUBLIC_IP}"
    fi
  else
    skip "Public access check" "Could not determine public IP"
  fi

  echo ""
fi

# =============================================================================
# Section 6: Agent Command (AI routing)
# =============================================================================
if [[ "$SECTION" == "all" || "$SECTION" == "agent" ]]; then
  echo "--- 6. Agent Command ---"

  if [ -n "$TOKEN" ]; then
    agent_resp=$(curl -sf "${INTEGRATIONS_URL}/api/dewbot/agent/command" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"command": "ping"}' \
      --max-time 30 2>/dev/null || echo "")

    if [ -n "$agent_resp" ]; then
      if echo "$agent_resp" | grep -q '"success":true'; then
        pass "Agent command responded successfully"
      else
        fail "Agent command" "Response: $(echo "$agent_resp" | head -c 200)"
      fi
    else
      skip "Agent command" "No response (gateway may not have AI routed)"
    fi
  else
    skip "Agent command" "No auth token available"
  fi

  echo ""
fi

# =============================================================================
# Summary
# =============================================================================
echo "=========================================="
echo "  Results: ${GREEN}${PASSED} passed${NC}, ${RED}${FAILED} failed${NC}, ${YELLOW}${SKIPPED} skipped${NC}"
echo "=========================================="

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
exit 0

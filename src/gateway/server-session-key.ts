import { loadConfig } from "../config/config.js";
import { loadSessionStore, resolveStorePath } from "../config/sessions.js";
import { getAgentRunContext, registerAgentRunContext } from "../infra/agent-events.js";
import { toAgentRequestSessionKey } from "../routing/session-key.js";

/**
 * Resolve a session key for a given run, with optional org-scoping.
 * When orgId is provided, the returned key will be prefixed with `org-{orgId}-`
 * to ensure session isolation between organizations.
 */
export function resolveSessionKeyForRun(runId: string, orgId?: string) {
  const cached = getAgentRunContext(runId)?.sessionKey;
  if (cached) {
    // If org-scoped and the cached key is already prefixed, return as-is.
    // If org-scoped but cached key lacks prefix, prepend it.
    if (orgId) {
      const orgPrefix = `org-${orgId}-`;
      return cached.startsWith(orgPrefix) ? cached : `${orgPrefix}${cached}`;
    }
    return cached;
  }
  const cfg = loadConfig();
  const storePath = resolveStorePath(cfg.session?.store);
  const store = loadSessionStore(storePath);
  const found = Object.entries(store).find(([, entry]) => entry?.sessionId === runId);
  const storeKey = found?.[0];
  if (storeKey) {
    let sessionKey = toAgentRequestSessionKey(storeKey) ?? storeKey;
    // Apply org prefix if orgId is provided and not already prefixed
    if (orgId) {
      const orgPrefix = `org-${orgId}-`;
      if (!sessionKey.startsWith(orgPrefix)) {
        sessionKey = `${orgPrefix}${sessionKey}`;
      }
    }
    registerAgentRunContext(runId, { sessionKey });
    return sessionKey;
  }
  return undefined;
}

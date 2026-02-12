/**
 * DewBot Gateway Rate Limiter
 *
 * Enforces per-organization rate limits to prevent abuse
 * and ensure fair resource allocation in multi-tenant mode.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  messagesPerMinute: number;
  toolCallsPerMinute: number;
  councilDebatesPerHour: number;
  spawnsPerMinute: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
  retryAfterMs?: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_LIMITS: RateLimitConfig = {
  messagesPerMinute: 100,
  toolCallsPerMinute: 500,
  councilDebatesPerHour: 10,
  spawnsPerMinute: 20,
};

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** orgId -> action -> sorted array of epoch-ms timestamps */
const counters = new Map<string, Map<string, number[]>>();

/** orgId -> partial overrides */
const orgOverrides = new Map<string, Partial<RateLimitConfig>>();

type Action = "message" | "tool_call" | "council" | "spawn";

function actionToKey(action: Action): keyof RateLimitConfig {
  switch (action) {
    case "message":
      return "messagesPerMinute";
    case "tool_call":
      return "toolCallsPerMinute";
    case "council":
      return "councilDebatesPerHour";
    case "spawn":
      return "spawnsPerMinute";
  }
}

function windowMsForAction(action: Action): number {
  return action === "council" ? 60 * 60 * 1000 : 60 * 1000;
}

function getLimitForOrg(orgId: string, action: Action): number {
  const key = actionToKey(action);
  const override = orgOverrides.get(orgId);
  if (override && override[key] !== undefined) {
    return override[key];
  }
  return DEFAULT_LIMITS[key];
}

/**
 * Prune timestamps older than the given window from the array *in place*
 * and return the pruned array.
 */
function pruneWindow(timestamps: number[], windowMs: number, now: number): number[] {
  const cutoff = now - windowMs;
  // Binary search for first index >= cutoff would be ideal, but for
  // typical cardinalities a simple shift loop is fast enough.
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }
  return timestamps;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether the given action is allowed for the organisation and, if so,
 * record the attempt. Returns the remaining quota and reset information.
 */
export function checkRateLimit(orgId: string, action: Action): RateLimitResult {
  const now = Date.now();
  const windowMs = windowMsForAction(action);
  const limit = getLimitForOrg(orgId, action);

  if (!counters.has(orgId)) {
    counters.set(orgId, new Map());
  }
  const orgMap = counters.get(orgId)!;

  if (!orgMap.has(action)) {
    orgMap.set(action, []);
  }
  const timestamps = orgMap.get(action)!;

  // Clean expired entries
  pruneWindow(timestamps, windowMs, now);

  const resetAtMs = timestamps.length > 0 ? timestamps[0] + windowMs : now + windowMs;

  if (timestamps.length >= limit) {
    const retryAfterMs = timestamps[0] + windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      resetAtMs,
      retryAfterMs: Math.max(retryAfterMs, 0),
    };
  }

  // Record this attempt
  timestamps.push(now);

  return {
    allowed: true,
    remaining: limit - timestamps.length,
    resetAtMs,
  };
}

/**
 * Override rate limits for a specific organisation. Partial overrides merge
 * on top of {@link DEFAULT_LIMITS}.
 */
export function setOrgLimits(orgId: string, limits: Partial<RateLimitConfig>): void {
  const existing = orgOverrides.get(orgId) ?? {};
  orgOverrides.set(orgId, { ...existing, ...limits });
}

/**
 * Return current usage stats for an organisation.
 */
export function getOrgUsage(
  orgId: string,
): Record<string, { count: number; limit: number; windowMs: number }> {
  const now = Date.now();
  const actions: Action[] = ["message", "tool_call", "council", "spawn"];
  const result: Record<string, { count: number; limit: number; windowMs: number }> = {};

  for (const action of actions) {
    const windowMs = windowMsForAction(action);
    const limit = getLimitForOrg(orgId, action);
    const orgMap = counters.get(orgId);
    const timestamps = orgMap?.get(action);
    const pruned = timestamps ? pruneWindow(timestamps, windowMs, now) : [];
    result[action] = { count: pruned.length, limit, windowMs };
  }

  return result;
}

/**
 * Clear all rate-limit counters for an organisation.
 */
export function resetOrgUsage(orgId: string): void {
  counters.delete(orgId);
}

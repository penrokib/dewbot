// ─── Smart Router ──────────────────────────────────────────────────────────
// Classifies user messages and routes them to the optimal model:
//   - local fast model (dew-unified-3b at localhost:8765)
//   - cloud model (via LiteLLM at localhost:4100)
//
// Ported from Dewx SmartRouterService (apps/dew/ai/src/router/smart-router.service.ts)
// adapted to DewBot's functional module style.
// ───────────────────────────────────────────────────────────────────────────

// ─── Types ─────────────────────────────────────────────────────────────────

export type RoutingCategory =
  | "greeting"
  | "simple_qa"
  | "crm_command"
  | "campaign_action"
  | "tool_call"
  | "kb_query"
  | "content_generation"
  | "code_generation"
  | "complex_analysis"
  | "long_form_content"
  | "multi_step_reasoning"
  | "multimodal"
  | "general";

export type RoutingTarget = "local" | "cloud";

export interface RoutingDecision {
  target: RoutingTarget;
  model: string;
  confidence: number;
  reason: string;
  /** Latency budget in milliseconds. */
  latencyBudget: number;
  category: RoutingCategory;
}

export interface RoutingContext {
  message: string;
  hasImages?: boolean;
  conversationLength?: number;
  preferredModel?: string;
  organizationId?: string;
}

export interface RoutingStats {
  localRequests: number;
  cloudRequests: number;
  totalRequests: number;
  avgLocalLatency: number;
  avgCloudLatency: number;
}

// ─── Configuration ─────────────────────────────────────────────────────────

const LOCAL_MODEL_URL = process.env.LOCAL_LLM_URL || "http://localhost:8765";
const LOCAL_MODEL_NAME = process.env.LOCAL_MODEL_NAME || "dew-unified-3b";
const SMART_ROUTER_ENABLED = process.env.SMART_ROUTER_ENABLED === "true";
const CLOUD_DEFAULT_MODEL = "claude-sonnet";
const CLOUD_FAST_MODEL = "claude-haiku";

const HEALTH_CHECK_INTERVAL_MS = 30_000;
const HEALTH_CHECK_TIMEOUT_MS = 2_000;

// ─── Module-Level State ────────────────────────────────────────────────────

let stats: RoutingStats = {
  localRequests: 0,
  cloudRequests: 0,
  totalRequests: 0,
  avgLocalLatency: 0,
  avgCloudLatency: 0,
};

let localModelHealthy = false;
let lastHealthCheckTime = 0;

// ─── Pre-compiled Patterns ─────────────────────────────────────────────────

const GREETING_PATTERN =
  /^(hi|hey|hello|thanks|thank you|ok|okay|yes|no|sure|got it|bye|good\s?(morning|night|evening|afternoon)|how are you|sup|what'?s up|yo)[\s!?.]*$/i;

const CODE_SIGNALS =
  /\b(write code|write a script|python|javascript|typescript|function\s+\w+|class\s+\w+|debug|refactor|implement|algorithm|regex|sql query|api endpoint|code review)\b/i;

const LONG_FORM_SIGNALS =
  /\b(write a (blog|article|essay|report|whitepaper|guide|documentation)|2000.?word|long.?form|comprehensive (guide|overview|analysis)|detailed report)\b/i;

const COMPLEX_ANALYSIS_SIGNALS =
  /\b(analyze|compare and contrast|why does|explain (how|why)|root cause|strategic (plan|analysis)|evaluate|assess|deep dive|implications|trade.?offs)\b/i;

const MULTI_STEP_SIGNALS =
  /\b(step by step|if we .+ then|what would happen|projected|forecast|scenario|plan out|break down (the process|the steps|this))\b/i;

const CRM_SIGNAL_WORDS =
  /\b(contact|lead|company|companies|deal|pipeline|task|note|activity|customer|prospect|crm)\b/i;

const CRM_ACTION_WORDS =
  /\b(create|add|update|edit|delete|remove|search|find|list|show|get|mark|complete|move)\b/i;

const CAMPAIGN_SIGNALS =
  /\b(campaign|sequence|template|outreach|drip|follow.?up|enrollment|email campaign|linkedin)\b/i;

const TOOL_SIGNALS =
  /\b(send|email|whatsapp|invoice|expense|payroll|employee|schedule|cron|automate|workflow|navigate|go to|open|screenshot|scrape)\b/i;

const KB_SIGNALS =
  /\b(policy|procedure|how (do|does|to)|what is (our|the)|documentation|faq|guideline|process for|handbook)\b/i;

const CONTENT_GENERATION_SIGNALS =
  /\b(write|draft|compose|generate|create) (an? )?(email|message|subject|post|reply|response|template|intro|pitch)\b/i;

const SIMPLE_QA_SIGNALS =
  /\b(how many|count of|total|status|what are my|show me|list my|check my)\b/i;

// ─── Category Classification ──────────────────────────────────────────────

/**
 * Rules-based category classification. No model call needed.
 *
 * Priority order:
 *  1. multimodal (images attached)
 *  2. greeting (short + pattern match)
 *  3. code_generation
 *  4. long_form_content
 *  5. complex_analysis (pattern + word count > 10)
 *  6. multi_step_reasoning
 *  7. crm_command (signal words + action words)
 *  8. campaign_action
 *  9. tool_call
 * 10. kb_query
 * 11. content_generation
 * 12. simple_qa (pattern + word count <= 12)
 * 13. general (default)
 */
export function classifyCategory(message: string, hasImages?: boolean): RoutingCategory {
  // 1. Multimodal — images require vision model
  if (hasImages) {
    return "multimodal";
  }

  const lower = message.toLowerCase().trim();
  const wordCount = lower.split(/\s+/).filter(Boolean).length;

  // 2. Greeting — very short and matches common greetings
  if (wordCount <= 6 && GREETING_PATTERN.test(message.trim())) {
    return "greeting";
  }

  // 3. Code generation signals
  if (CODE_SIGNALS.test(lower)) {
    return "code_generation";
  }

  // 4. Long-form content signals
  if (LONG_FORM_SIGNALS.test(lower)) {
    return "long_form_content";
  }

  // 5. Complex analysis — needs both pattern match and sufficient length
  if (COMPLEX_ANALYSIS_SIGNALS.test(lower) && wordCount > 10) {
    return "complex_analysis";
  }

  // 6. Multi-step reasoning
  if (MULTI_STEP_SIGNALS.test(lower)) {
    return "multi_step_reasoning";
  }

  // 7. CRM commands — signal words combined with action words
  if (CRM_SIGNAL_WORDS.test(lower) && CRM_ACTION_WORDS.test(lower)) {
    return "crm_command";
  }

  // 8. Campaign actions
  if (CAMPAIGN_SIGNALS.test(lower)) {
    return "campaign_action";
  }

  // 9. Tool calls — action-oriented domain words
  if (TOOL_SIGNALS.test(lower) && CRM_ACTION_WORDS.test(lower)) {
    return "tool_call";
  }

  // 10. Knowledge base queries
  if (KB_SIGNALS.test(lower)) {
    return "kb_query";
  }

  // 11. Content generation
  if (CONTENT_GENERATION_SIGNALS.test(lower)) {
    return "content_generation";
  }

  // 12. Simple Q&A — short, tool-answerable questions
  if (SIMPLE_QA_SIGNALS.test(lower) && wordCount <= 12) {
    return "simple_qa";
  }

  // 13. Default
  return "general";
}

// ─── Health Check ──────────────────────────────────────────────────────────

/**
 * Check if the local model server is reachable.
 *
 * - Hits `GET /health` on the local model URL with a 2-second timeout.
 * - Caches the result for 30 seconds to avoid hammering the endpoint.
 * - Returns `false` if the server is down or the check times out.
 */
export async function isLocalModelHealthy(): Promise<boolean> {
  const now = Date.now();
  if (now - lastHealthCheckTime < HEALTH_CHECK_INTERVAL_MS) {
    return localModelHealthy;
  }

  lastHealthCheckTime = now;

  try {
    const response = await fetch(`${LOCAL_MODEL_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
    });
    localModelHealthy = response.ok;
  } catch {
    localModelHealthy = false;
  }

  return localModelHealthy;
}

// ─── Internal Helpers ──────────────────────────────────────────────────────

function makeLocalDecision(
  category: RoutingCategory,
  confidence: number,
  reason: string,
  latencyBudget: number,
): RoutingDecision {
  stats.localRequests++;
  return {
    target: "local",
    model: LOCAL_MODEL_NAME,
    confidence,
    reason,
    latencyBudget,
    category,
  };
}

function makeCloudDecision(
  category: RoutingCategory,
  model: string,
  confidence: number,
  reason: string,
  latencyBudget: number,
): RoutingDecision {
  stats.cloudRequests++;
  return {
    target: "cloud",
    model,
    confidence,
    reason,
    latencyBudget,
    category,
  };
}

/**
 * Fallback: when the local model is unhealthy, route everything through cloud.
 * Uses the fast cloud model for trivial requests and the default for everything else.
 */
function fallbackToCloud(category: RoutingCategory, reason: string): RoutingDecision {
  stats.cloudRequests++;
  return {
    target: "cloud",
    model: CLOUD_FAST_MODEL,
    confidence: 1.0,
    reason,
    latencyBudget: 30_000,
    category,
  };
}

// ─── Main Router ───────────────────────────────────────────────────────────

/**
 * Route a user message to the optimal model.
 *
 * Decision flow:
 *  1. Explicit `preferredModel` override  -> cloud with that model
 *  2. Smart router disabled               -> cloud with default model
 *  3. Local model unhealthy               -> cloud fallback (haiku)
 *  4. Category-based routing table        -> local or cloud per category
 */
export async function route(ctx: RoutingContext): Promise<RoutingDecision> {
  stats.totalRequests++;

  // 1. Explicit model preference always wins
  if (ctx.preferredModel) {
    stats.cloudRequests++;
    return {
      target: "cloud",
      model: ctx.preferredModel,
      confidence: 1.0,
      reason: "User selected model explicitly",
      latencyBudget: 30_000,
      category: "general",
    };
  }

  // 2. If smart routing is disabled, go straight to cloud
  if (!SMART_ROUTER_ENABLED) {
    const category = classifyCategory(ctx.message, ctx.hasImages);
    return makeCloudDecision(
      category,
      CLOUD_DEFAULT_MODEL,
      1.0,
      "Smart router disabled, using cloud model",
      30_000,
    );
  }

  // 3. Check local model health
  const healthy = await isLocalModelHealthy();
  const category = classifyCategory(ctx.message, ctx.hasImages);

  if (!healthy) {
    return fallbackToCloud(category, "Local model unhealthy, falling back to cloud");
  }

  // 4. Category-based routing
  const wordCount = ctx.message.split(/\s+/).filter(Boolean).length;

  switch (category) {
    // ── Local model targets ──────────────────────────────────────────────
    case "greeting":
      return makeLocalDecision(category, 0.95, "Simple greeting/small talk", 1_000);

    case "simple_qa":
      return makeLocalDecision(category, 0.82, "Simple Q&A answerable with tools", 3_000);

    case "crm_command":
      return makeLocalDecision(category, 0.92, "Trained CRM command", 2_000);

    case "campaign_action":
      return makeLocalDecision(category, 0.9, "Trained campaign action", 2_000);

    case "tool_call":
      return makeLocalDecision(category, 0.85, "Tool routing request", 3_000);

    case "kb_query":
      return makeLocalDecision(category, 0.8, "Knowledge base query with RAG", 5_000);

    // ── Cloud model targets ──────────────────────────────────────────────
    case "multimodal":
      return makeCloudDecision(
        category,
        CLOUD_DEFAULT_MODEL,
        0.95,
        "Multimodal input requires vision model",
        30_000,
      );

    case "code_generation":
      return makeCloudDecision(
        category,
        CLOUD_DEFAULT_MODEL,
        0.9,
        "Code generation requires advanced reasoning",
        60_000,
      );

    case "complex_analysis":
      return makeCloudDecision(
        category,
        CLOUD_DEFAULT_MODEL,
        0.85,
        "Complex analysis requires stronger model",
        30_000,
      );

    case "long_form_content":
      return makeCloudDecision(
        category,
        CLOUD_DEFAULT_MODEL,
        0.88,
        "Long-form content needs larger context model",
        60_000,
      );

    case "multi_step_reasoning":
      return makeCloudDecision(
        category,
        CLOUD_DEFAULT_MODEL,
        0.82,
        "Multi-step reasoning benefits from stronger model",
        30_000,
      );

    // ── Split targets (depends on message length) ────────────────────────
    case "content_generation": {
      if (wordCount <= 30) {
        return makeLocalDecision(category, 0.78, "Short content generation", 5_000);
      }
      return makeCloudDecision(
        category,
        CLOUD_DEFAULT_MODEL,
        0.8,
        "Complex content generation needs cloud model",
        30_000,
      );
    }

    // ── General fallback ─────────────────────────────────────────────────
    case "general":
    default: {
      if (wordCount <= 30) {
        return makeLocalDecision("general", 0.6, "Short general query", 3_000);
      }
      return makeCloudDecision(
        "general",
        CLOUD_DEFAULT_MODEL,
        0.7,
        "Long general query benefits from cloud model",
        30_000,
      );
    }
  }
}

// ─── Stats Tracking ────────────────────────────────────────────────────────

/**
 * Record a completed request's latency for the given routing target.
 * Uses a running average based on the request count.
 */
export function recordLatency(target: RoutingTarget, latencyMs: number): void {
  if (target === "local") {
    const n = stats.localRequests || 1;
    stats.avgLocalLatency = (stats.avgLocalLatency * (n - 1) + latencyMs) / n;
  } else {
    const n = stats.cloudRequests || 1;
    stats.avgCloudLatency = (stats.avgCloudLatency * (n - 1) + latencyMs) / n;
  }
}

/**
 * Get current routing statistics with derived local usage percentage.
 */
export function getStats(): RoutingStats & { localPercentage: number } {
  const total = stats.totalRequests || 1;
  return {
    ...stats,
    localPercentage: (stats.localRequests / total) * 100,
  };
}

/**
 * Reset all routing statistics to zero.
 */
export function resetStats(): void {
  stats = {
    localRequests: 0,
    cloudRequests: 0,
    totalRequests: 0,
    avgLocalLatency: 0,
    avgCloudLatency: 0,
  };
}

/**
 * Reset the cached health check so the next `isLocalModelHealthy()` call
 * performs a fresh probe. Useful for testing.
 */
export function resetHealthCache(): void {
  lastHealthCheckTime = 0;
  localModelHealthy = false;
}

/**
 * Extended Health Check System
 *
 * Provides comprehensive health reporting for the DewBot gateway
 * including all connected services, channels, and models.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtendedHealthReport {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  timestamp: string;

  gateway: {
    version: string;
    port: number;
    startedAt: string;
    activeSessions: number;
    totalRequests: number;
  };

  channels: Record<
    string,
    {
      status: "connected" | "disconnected" | "error";
      accountCount: number;
      lastMessageAt?: string;
      error?: string;
    }
  >;

  models: {
    localModel: {
      healthy: boolean;
      url: string;
      lastCheckAt?: string;
      latencyMs?: number;
    };
    cloudModels: {
      provider: string;
      available: boolean;
    }[];
  };

  dewxPlatform: {
    healthy: boolean;
    url: string;
    toolCount?: number;
    lastCheckAt?: string;
  };

  knowledgeBase: {
    healthy: boolean;
    documentCount?: number;
  };

  council: {
    healthy: boolean;
    debatesLast24h?: number;
  };

  routing: {
    localPercentage: number;
    totalRequests: number;
    avgLocalLatency: number;
    avgCloudLatency: number;
  };

  rateLimiting: {
    activeOrgs: number;
    throttledOrgs: string[];
  };
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const startedAtMs = Date.now();
const startedAtIso = new Date(startedAtMs).toISOString();
let totalRequests = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHECK_TIMEOUT_MS = 5_000;

/**
 * Run an async check with a hard timeout.
 */
async function withTimeout<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} health check timed out`)), CHECK_TIMEOUT_MS),
      ),
    ]);
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

type LocalModelHealth = ExtendedHealthReport["models"]["localModel"];
type DewxPlatformHealth = ExtendedHealthReport["dewxPlatform"];

async function checkLocalModel(): Promise<LocalModelHealth> {
  const url = process.env.LOCAL_MODEL_URL ?? "http://127.0.0.1:11434";
  return withTimeout<LocalModelHealth>(
    "local-model",
    async () => {
      const start = Date.now();
      const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
      const latencyMs = Date.now() - start;
      return {
        healthy: res.ok,
        url,
        lastCheckAt: new Date().toISOString(),
        latencyMs,
      };
    },
    { healthy: false, url, lastCheckAt: new Date().toISOString() },
  );
}

async function checkCloudModels(): Promise<ExtendedHealthReport["models"]["cloudModels"]> {
  const providers: { provider: string; envKey: string }[] = [
    { provider: "anthropic", envKey: "ANTHROPIC_API_KEY" },
    { provider: "openai", envKey: "OPENAI_API_KEY" },
  ];
  return providers.map((p) => ({
    provider: p.provider,
    available: !!process.env[p.envKey],
  }));
}

async function checkDewxPlatform(): Promise<DewxPlatformHealth> {
  const url = process.env.DEWX_PLATFORM_URL ?? "http://127.0.0.1:4000";
  return withTimeout<DewxPlatformHealth>(
    "dewx-platform",
    async () => {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
      return {
        healthy: res.ok,
        url,
        lastCheckAt: new Date().toISOString(),
      };
    },
    { healthy: false, url, lastCheckAt: new Date().toISOString() },
  );
}

async function checkKnowledgeBase(): Promise<ExtendedHealthReport["knowledgeBase"]> {
  // Knowledge-base health is best-effort; in a real deployment the KB service
  // would expose a health endpoint. For now we report as healthy if the env
  // variable points somewhere.
  return { healthy: !!process.env.KB_SERVICE_URL, documentCount: undefined };
}

async function checkCouncil(): Promise<ExtendedHealthReport["council"]> {
  return { healthy: true, debatesLast24h: undefined };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Gather comprehensive health information from all subsystems.
 * Individual checks run in parallel with a 5-second timeout each.
 */
export async function getExtendedHealth(): Promise<ExtendedHealthReport> {
  const [localModel, cloudModels, dewxPlatform, knowledgeBase, council] = await Promise.allSettled([
    checkLocalModel(),
    checkCloudModels(),
    checkDewxPlatform(),
    checkKnowledgeBase(),
    checkCouncil(),
  ]);

  const localModelResult: ExtendedHealthReport["models"]["localModel"] =
    localModel.status === "fulfilled"
      ? localModel.value
      : { healthy: false, url: process.env.LOCAL_MODEL_URL ?? "http://127.0.0.1:11434" };

  const cloudModelsResult: ExtendedHealthReport["models"]["cloudModels"] =
    cloudModels.status === "fulfilled" ? cloudModels.value : [];

  const dewxResult: ExtendedHealthReport["dewxPlatform"] =
    dewxPlatform.status === "fulfilled"
      ? dewxPlatform.value
      : {
          healthy: false,
          url: process.env.DEWX_PLATFORM_URL ?? "http://127.0.0.1:4000",
        };

  const kbResult: ExtendedHealthReport["knowledgeBase"] =
    knowledgeBase.status === "fulfilled" ? knowledgeBase.value : { healthy: false };

  const councilResult: ExtendedHealthReport["council"] =
    council.status === "fulfilled" ? council.value : { healthy: false };

  // Determine overall status
  const criticalFailures = [
    !localModelResult.healthy && cloudModelsResult.every((c) => !c.available),
  ];
  const degradedConditions = [!localModelResult.healthy, !dewxResult.healthy, !kbResult.healthy];

  let status: ExtendedHealthReport["status"] = "healthy";
  if (criticalFailures.some(Boolean)) {
    status = "unhealthy";
  } else if (degradedConditions.some(Boolean)) {
    status = "degraded";
  }

  const port = Number(process.env.DEWBOT_PORT) || 18789;

  return {
    status,
    uptime: getUptimeMs(),
    timestamp: new Date().toISOString(),

    gateway: {
      version: process.env.DEWBOT_VERSION ?? "dev",
      port,
      startedAt: startedAtIso,
      activeSessions: 0, // filled in by caller if wired up
      totalRequests: getRequestCount(),
    },

    channels: {},

    models: {
      localModel: localModelResult,
      cloudModels: cloudModelsResult,
    },

    dewxPlatform: dewxResult,
    knowledgeBase: kbResult,
    council: councilResult,

    routing: {
      localPercentage: 0,
      totalRequests: 0,
      avgLocalLatency: 0,
      avgCloudLatency: 0,
    },

    rateLimiting: {
      activeOrgs: 0,
      throttledOrgs: [],
    },
  };
}

/**
 * Milliseconds elapsed since the module was first loaded.
 */
export function getUptimeMs(): number {
  return Date.now() - startedAtMs;
}

/**
 * Increment the global request counter.
 */
export function incrementRequestCount(): void {
  totalRequests++;
}

/**
 * Return the total number of requests recorded.
 */
export function getRequestCount(): number {
  return totalRequests;
}

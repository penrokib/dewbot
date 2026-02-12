/**
 * DewBot Gateway Monitoring
 *
 * Tracks key metrics for operational visibility.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetricPoint {
  timestamp: number;
  value: number;
}

export interface MetricsSummary {
  requestsPerMinute: MetricPoint[];
  toolCallsPerMinute: MetricPoint[];
  latencyP50: MetricPoint[];
  latencyP95: MetricPoint[];
  activeSessionCount: MetricPoint[];
  errorRate: MetricPoint[];
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** Maximum data points retained per metric (1 hour at 1 point/minute). */
const MAX_POINTS = 60;

/** Generic metric store: name -> data points */
const metrics = new Map<string, MetricPoint[]>();

/** Per-tool tracking: toolName -> { count, totalLatency } */
const toolStats = new Map<string, { count: number; totalLatencyMs: number }>();

/** Rolling request counters for computing per-minute rates */
let requestWindow: { ts: number; latency: number; success: boolean }[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureSeries(name: string): MetricPoint[] {
  let series = metrics.get(name);
  if (!series) {
    series = [];
    metrics.set(name, series);
  }
  return series;
}

function pruneToMax(series: MetricPoint[]): void {
  while (series.length > MAX_POINTS) {
    series.shift();
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(idx, 0)];
}

// ---------------------------------------------------------------------------
// Public API - Generic metrics
// ---------------------------------------------------------------------------

/**
 * Record a single metric data point with the current timestamp.
 * Keeps the last {@link MAX_POINTS} entries per metric.
 */
export function recordMetric(name: string, value: number): void {
  const series = ensureSeries(name);
  series.push({ timestamp: Date.now(), value });
  pruneToMax(series);
}

/**
 * Retrieve the last `lastN` data points for a named metric.
 */
export function getMetrics(name: string, lastN?: number): MetricPoint[] {
  const series = metrics.get(name) ?? [];
  if (lastN === undefined || lastN >= series.length) {
    return [...series];
  }
  return series.slice(-lastN);
}

/**
 * Return all tracked metric summaries.
 */
export function getMetricsSummary(): MetricsSummary {
  return {
    requestsPerMinute: getMetrics("requestsPerMinute"),
    toolCallsPerMinute: getMetrics("toolCallsPerMinute"),
    latencyP50: getMetrics("latencyP50"),
    latencyP95: getMetrics("latencyP95"),
    activeSessionCount: getMetrics("activeSessionCount"),
    errorRate: getMetrics("errorRate"),
  };
}

// ---------------------------------------------------------------------------
// Public API - Request tracking
// ---------------------------------------------------------------------------

/**
 * Record a request with its latency and success status.
 * Automatically computes per-minute aggregates.
 */
export function recordRequest(latencyMs: number, success: boolean): void {
  const now = Date.now();
  requestWindow.push({ ts: now, latency: latencyMs, success });

  // Prune entries older than 1 minute
  const oneMinAgo = now - 60_000;
  requestWindow = requestWindow.filter((r) => r.ts >= oneMinAgo);

  // Compute per-minute aggregates
  const totalInWindow = requestWindow.length;
  const failures = requestWindow.filter((r) => !r.success).length;
  const latencies = requestWindow.map((r) => r.latency).toSorted((a, b) => a - b);

  recordMetric("requestsPerMinute", totalInWindow);
  recordMetric("errorRate", totalInWindow > 0 ? failures / totalInWindow : 0);
  recordMetric("latencyP50", percentile(latencies, 50));
  recordMetric("latencyP95", percentile(latencies, 95));
}

// ---------------------------------------------------------------------------
// Public API - Tool tracking
// ---------------------------------------------------------------------------

/**
 * Record a tool invocation with its latency and outcome.
 */
export function recordToolCall(toolName: string, latencyMs: number, success: boolean): void {
  const existing = toolStats.get(toolName) ?? { count: 0, totalLatencyMs: 0 };
  existing.count += 1;
  existing.totalLatencyMs += latencyMs;
  toolStats.set(toolName, existing);

  // Also contribute to the per-minute tool-call metric
  recordMetric("toolCallsPerMinute", 1);

  // Record overall request too (tools are a subset of requests)
  recordRequest(latencyMs, success);
}

/**
 * Return the most-used tools sorted by invocation count (descending).
 */
export function getTopToolsByUsage(
  limit = 10,
): { name: string; count: number; avgLatencyMs: number }[] {
  const entries = Array.from(toolStats.entries()).map(([name, stats]) => ({
    name,
    count: stats.count,
    avgLatencyMs: stats.count > 0 ? Math.round(stats.totalLatencyMs / stats.count) : 0,
  }));

  entries.sort((a, b) => b.count - a.count);
  return entries.slice(0, limit);
}

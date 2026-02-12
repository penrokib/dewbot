/**
 * Business Health Cron Job Configuration
 *
 * Creates cron job definitions for periodic health monitoring.
 * These are used by the cron tool to schedule automated health checks.
 */

// ─── Types ────────────────────────────────────────────────────

export interface CronJobDefinition {
  name: string;
  description?: string;
  enabled: boolean;
  schedule: { kind: string; [key: string]: unknown };
  sessionTarget: "main" | "isolated";
  wakeMode: "now" | "next-heartbeat";
  payload: { kind: string; [key: string]: unknown };
  delivery?: { mode: string; channel?: string; to?: string };
}

// ─── Cron Job Factories ──────────────────────────────────────

/**
 * Create a cron job definition for periodic business health checks.
 *
 * Runs every Tuesday and Thursday at 10 AM UTC. The job triggers an
 * agent turn that performs a health check, reports the overall score,
 * and highlights any critical domains (score below 60).
 *
 * @param options.orgId - Organization ID for the health check
 * @param options.channel - Optional delivery channel (e.g., "slack", "discord")
 * @param options.to - Optional delivery target (e.g., channel ID or user ID)
 * @returns CronJobDefinition ready for use with the cron tool
 */
export function createHealthCheckCronJob(options: {
  orgId: string;
  channel?: string;
  to?: string;
}): CronJobDefinition {
  const delivery: CronJobDefinition["delivery"] = {
    mode: "announce",
  };
  if (options.channel) {
    delivery.channel = options.channel;
  }
  if (options.to) {
    delivery.to = options.to;
  }

  return {
    name: "business-health-check",
    description: "Periodic business health monitoring (Tue/Thu 10 AM UTC)",
    enabled: true,
    schedule: {
      kind: "cron",
      expr: "0 10 * * 2,4",
      tz: "UTC",
    },
    sessionTarget: "isolated",
    wakeMode: "now",
    payload: {
      kind: "agentTurn",
      message:
        "Run a business health check for the organization. Report the overall score and any " +
        "domains that need attention. If any domain scores below 60, highlight it as critical. " +
        "Format the report concisely for the channel.",
    },
    delivery,
  };
}

/**
 * Create a cron job definition for health alert threshold monitoring.
 *
 * Runs every 6 hours. Checks the overall health score and sends an
 * alert if it drops below the configured threshold. When healthy,
 * replies with a heartbeat confirmation.
 *
 * @param options.orgId - Organization ID for the health check
 * @param options.threshold - Score threshold for alerts (default: 60)
 * @param options.channel - Optional delivery channel
 * @param options.to - Optional delivery target
 * @returns CronJobDefinition ready for use with the cron tool
 */
export function createAlertThresholdJob(options: {
  orgId: string;
  threshold?: number;
  channel?: string;
  to?: string;
}): CronJobDefinition {
  const threshold = options.threshold ?? 60;

  const delivery: CronJobDefinition["delivery"] = {
    mode: "announce",
  };
  if (options.channel) {
    delivery.channel = options.channel;
  }
  if (options.to) {
    delivery.to = options.to;
  }

  return {
    name: "health-alert-monitor",
    description: `Health alert monitor - alerts when score drops below ${threshold}`,
    enabled: true,
    schedule: {
      kind: "every",
      everyMs: 21_600_000, // 6 hours
    },
    sessionTarget: "isolated",
    wakeMode: "now",
    payload: {
      kind: "agentTurn",
      message:
        `Check the business health score. If the overall score is below ${threshold}, ` +
        "send an alert with the problem domains and recommended actions. If the score is " +
        "healthy, reply with HEARTBEAT_OK.",
    },
    delivery,
  };
}

// ─── Report Formatting ───────────────────────────────────────

/**
 * Get an emoji indicator for a health score.
 *
 * - 80+: green (healthy)
 * - 60-79: yellow (needs attention)
 * - <60: red (critical)
 */
function scoreEmoji(score: number): string {
  if (score >= 80) {
    return "\u{1F7E2}";
  } // green circle
  if (score >= 60) {
    return "\u{1F7E1}";
  } // yellow circle
  return "\u{1F534}"; // red circle
}

/**
 * Get a text status label for a health score.
 */
function scoreLabel(score: number): string {
  if (score >= 80) {
    return "Healthy";
  }
  if (score >= 60) {
    return "Needs Attention";
  }
  return "Critical";
}

/**
 * Format a health score report for messaging channels.
 *
 * Produces a concise, readable report with emoji indicators
 * for quick scanning. Includes domain breakdowns and top
 * recommendations when provided.
 *
 * @param score - Overall health score (0-100)
 * @param domains - Map of domain names to their scores
 * @param recommendations - Optional list of actionable recommendations
 * @returns Formatted report string suitable for chat channels
 */
export function formatHealthReport(
  score: number,
  domains: Record<string, number>,
  recommendations?: string[],
): string {
  const lines: string[] = [];

  // Header with overall score
  lines.push(`${scoreEmoji(score)} **Business Health: ${score}/100** (${scoreLabel(score)})`);
  lines.push("");

  // Domain breakdown
  lines.push("**Domain Scores:**");
  const domainEntries = Object.entries(domains);
  for (const [name, domainScore] of domainEntries) {
    const displayName = name.charAt(0).toUpperCase() + name.slice(1);
    lines.push(`  ${scoreEmoji(domainScore)} ${displayName}: ${domainScore}/100`);
  }

  // Highlight critical domains
  const critical = domainEntries.filter(([, s]) => s < 60);
  if (critical.length > 0) {
    lines.push("");
    lines.push(
      `\u{26A0}\u{FE0F} **Attention needed:** ${critical.map(([name]) => name.charAt(0).toUpperCase() + name.slice(1)).join(", ")}`,
    );
  }

  // Top recommendations
  if (recommendations && recommendations.length > 0) {
    lines.push("");
    lines.push("**Recommendations:**");
    const topRecs = recommendations.slice(0, 3);
    for (const rec of topRecs) {
      lines.push(`  \u{2022} ${rec}`);
    }
    if (recommendations.length > 3) {
      lines.push(`  _...and ${recommendations.length - 3} more_`);
    }
  }

  return lines.join("\n");
}

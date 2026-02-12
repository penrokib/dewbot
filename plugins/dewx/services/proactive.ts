/**
 * Proactive monitoring service for DewBot.
 *
 * Runs periodic checks against the Dewx platform to detect stale deals,
 * underperforming campaigns, overdue invoices, and generates a daily
 * business health summary.
 */

import type {
  DewBotPluginService,
  DewBotPluginServiceContext,
} from "../../../src/plugin-sdk/index.js";
import type { DewxApiClient } from "../dewx-client.js";

export type ProactiveConfig = {
  staleDealDays: number;
  dailySummaryHour: number;
  alertChannel: string;
};

type Logger = DewBotPluginServiceContext["logger"];

// Interval durations
const STALE_DEALS_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const CAMPAIGN_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const OVERDUE_INVOICES_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const DAILY_SUMMARY_CHECK_INTERVAL_MS = 60 * 1000; // check every minute for the target hour

export function createProactiveService(
  client: DewxApiClient,
  config: ProactiveConfig,
): DewBotPluginService {
  const intervals: ReturnType<typeof setInterval>[] = [];
  const lastRunTimes: Record<string, number> = {};

  function shouldRun(key: string, minIntervalMs: number): boolean {
    const now = Date.now();
    const lastRun = lastRunTimes[key];
    if (lastRun && now - lastRun < minIntervalMs) {
      return false;
    }
    lastRunTimes[key] = now;
    return true;
  }

  // ---- Stale deals check (every 5 minutes) ----
  async function checkStaleDeals(logger: Logger): Promise<void> {
    if (!shouldRun("stale-deals", STALE_DEALS_INTERVAL_MS)) {
      return;
    }

    try {
      const deals = await client.get<{
        data?: Array<{ id: string; name: string; stage?: string; lastActivityAt?: string }>;
      }>("/api/crm/deals", { staleDays: config.staleDealDays });

      const staleDeals = deals?.data ?? [];
      if (staleDeals.length > 0) {
        logger.warn(
          `[proactive] ${staleDeals.length} stale deal(s) detected (no activity in ${config.staleDealDays}+ days): ${staleDeals.map((d) => d.name || d.id).join(", ")}`,
        );
      }
    } catch (err) {
      logger.error(
        `[proactive] Failed to check stale deals: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ---- Campaign monitoring (every 15 minutes) ----
  async function checkCampaigns(logger: Logger): Promise<void> {
    if (!shouldRun("campaigns", CAMPAIGN_INTERVAL_MS)) {
      return;
    }

    try {
      const campaigns = await client.get<{
        data?: Array<{
          id: string;
          name: string;
          status: string;
          openRate?: number;
          clickRate?: number;
          bounceRate?: number;
        }>;
      }>("/api/outreach/campaigns", { status: "active" });

      const activeCampaigns = campaigns?.data ?? [];
      for (const campaign of activeCampaigns) {
        const issues: string[] = [];

        if (campaign.openRate !== undefined && campaign.openRate < 0.1) {
          issues.push(`low open rate (${(campaign.openRate * 100).toFixed(1)}%)`);
        }
        if (campaign.bounceRate !== undefined && campaign.bounceRate > 0.05) {
          issues.push(`high bounce rate (${(campaign.bounceRate * 100).toFixed(1)}%)`);
        }
        if (campaign.clickRate !== undefined && campaign.clickRate < 0.01) {
          issues.push(`low click rate (${(campaign.clickRate * 100).toFixed(1)}%)`);
        }

        if (issues.length > 0) {
          logger.warn(
            `[proactive] Campaign "${campaign.name}" underperforming: ${issues.join(", ")}`,
          );
        }
      }
    } catch (err) {
      logger.error(
        `[proactive] Failed to check campaigns: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ---- Overdue invoices (every 1 hour) ----
  async function checkOverdueInvoices(logger: Logger): Promise<void> {
    if (!shouldRun("overdue-invoices", OVERDUE_INVOICES_INTERVAL_MS)) {
      return;
    }

    try {
      const invoices = await client.get<{
        data?: Array<{
          id: string;
          number?: string;
          clientName?: string;
          amount?: number;
          currency?: string;
          dueDate?: string;
        }>;
      }>("/api/finance/invoices", { status: "overdue" });

      const overdueInvoices = invoices?.data ?? [];
      if (overdueInvoices.length > 0) {
        const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + (inv.amount ?? 0), 0);
        const currency = overdueInvoices[0]?.currency ?? "USD";

        logger.warn(
          `[proactive] ${overdueInvoices.length} overdue invoice(s) totaling ${currency} ${totalOverdue.toFixed(2)}: ${overdueInvoices.map((inv) => inv.number || inv.id).join(", ")}`,
        );
      }
    } catch (err) {
      logger.error(
        `[proactive] Failed to check overdue invoices: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ---- Daily summary (runs once at configured hour) ----
  let dailySummaryRanToday = false;
  let lastDailySummaryDate = "";

  async function checkDailySummary(logger: Logger): Promise<void> {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const currentHour = now.getHours();

    // Reset the flag if the day has changed
    if (todayKey !== lastDailySummaryDate) {
      dailySummaryRanToday = false;
      lastDailySummaryDate = todayKey;
    }

    // Only run once at the configured hour
    if (dailySummaryRanToday || currentHour !== config.dailySummaryHour) {
      return;
    }

    dailySummaryRanToday = true;

    try {
      const health = await client.get<{
        score?: number;
        revenue?: { current?: number; target?: number };
        deals?: { open?: number; closedThisMonth?: number; stale?: number };
        tasks?: { overdue?: number; dueToday?: number };
        campaigns?: { active?: number; underperforming?: number };
        invoices?: { overdue?: number; overdueAmount?: number };
      }>("/api/analytics/health");

      const lines: string[] = [`[proactive] Daily business health summary (${todayKey}):`];

      if (health.score !== undefined) {
        lines.push(`  Health score: ${health.score}/100`);
      }
      if (health.revenue) {
        const pct = health.revenue.target
          ? (((health.revenue.current ?? 0) / health.revenue.target) * 100).toFixed(0)
          : "N/A";
        lines.push(
          `  Revenue: ${health.revenue.current ?? 0} / ${health.revenue.target ?? "N/A"} (${pct}%)`,
        );
      }
      if (health.deals) {
        lines.push(
          `  Deals: ${health.deals.open ?? 0} open, ${health.deals.closedThisMonth ?? 0} closed this month, ${health.deals.stale ?? 0} stale`,
        );
      }
      if (health.tasks) {
        lines.push(
          `  Tasks: ${health.tasks.overdue ?? 0} overdue, ${health.tasks.dueToday ?? 0} due today`,
        );
      }
      if (health.invoices) {
        lines.push(
          `  Invoices: ${health.invoices.overdue ?? 0} overdue ($${(health.invoices.overdueAmount ?? 0).toFixed(2)})`,
        );
      }

      logger.info(lines.join("\n"));
    } catch (err) {
      logger.error(
        `[proactive] Failed to generate daily summary: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    id: "dewx-proactive",

    start(ctx) {
      const { logger } = ctx;
      logger.info("[proactive] Starting proactive monitoring service");

      // Run initial checks immediately
      void checkStaleDeals(logger);
      void checkCampaigns(logger);
      void checkOverdueInvoices(logger);
      void checkDailySummary(logger);

      // Set up recurring intervals
      intervals.push(setInterval(() => void checkStaleDeals(logger), STALE_DEALS_INTERVAL_MS));
      intervals.push(setInterval(() => void checkCampaigns(logger), CAMPAIGN_INTERVAL_MS));
      intervals.push(
        setInterval(() => void checkOverdueInvoices(logger), OVERDUE_INVOICES_INTERVAL_MS),
      );
      intervals.push(
        setInterval(() => void checkDailySummary(logger), DAILY_SUMMARY_CHECK_INTERVAL_MS),
      );

      logger.info(
        `[proactive] Monitoring active — stale deals (5m), campaigns (15m), invoices (1h), daily summary (${config.dailySummaryHour}:00)`,
      );
    },

    stop(ctx) {
      const { logger } = ctx;
      for (const interval of intervals) {
        clearInterval(interval);
      }
      intervals.length = 0;
      logger.info("[proactive] Proactive monitoring service stopped");
    },
  };
}

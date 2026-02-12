/**
 * Business Health Monitor Tool
 *
 * Calls the Dewx Business Health API to check organizational health
 * scores across four domains: Revenue, Operations, Customer, and Growth.
 * Returns a composite 0-100 score with domain breakdowns, trends,
 * and actionable recommendations.
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../agents/tools/common.js";
import { jsonResult } from "../agents/tools/common.js";

// ─── Types ────────────────────────────────────────────────────

interface DomainScore {
  domain: string;
  score: number;
  trend: string;
  indicators: Array<{
    name: string;
    value: number;
    status: string;
  }>;
}

interface HealthScoreResponse {
  overallScore: number;
  status: string;
  domains: DomainScore[];
  recommendations?: string[];
  lastUpdated?: string;
}

interface DomainDetailResponse {
  domain: string;
  score: number;
  trend: string;
  indicators: Array<{
    name: string;
    value: number;
    status: string;
    description?: string;
  }>;
  recommendations?: string[];
  historicalScores?: Array<{
    date: string;
    score: number;
  }>;
}

// ─── Configuration ────────────────────────────────────────────

const DEWX_AI_URL = process.env.DEWBOT_DEWX_AI_URL || "http://localhost:4010";
const SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET || "";

// ─── Schema ───────────────────────────────────────────────────

const HealthMonitorSchema = Type.Object({
  domain: Type.Optional(
    Type.Union(
      [
        Type.Literal("revenue"),
        Type.Literal("operations"),
        Type.Literal("customer"),
        Type.Literal("growth"),
      ],
      {
        description:
          "Filter to a specific health domain. Omit to get the overall score with all domain breakdowns.",
      },
    ),
  ),
  includeRecommendations: Type.Optional(
    Type.Boolean({
      description: "Whether to include actionable recommendations in the response. Default: true.",
    }),
  ),
});

// ─── Helpers ──────────────────────────────────────────────────

function buildHeaders(orgId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (SERVICE_SECRET) {
    headers["x-service-secret"] = SERVICE_SECRET;
  }
  if (orgId) {
    headers["x-organization-id"] = orgId;
  }
  return headers;
}

function formatDomainSummary(domain: DomainScore): Record<string, unknown> {
  return {
    domain: domain.domain,
    score: domain.score,
    trend: domain.trend,
    indicatorCount: domain.indicators.length,
    indicators: domain.indicators.map((ind) => ({
      name: ind.name,
      value: ind.value,
      status: ind.status,
    })),
  };
}

// ─── Tool Factory ─────────────────────────────────────────────

/**
 * Create a business_health tool that calls the Dewx Health API.
 *
 * @param options.orgId - Organization ID for request context
 * @returns AnyAgentTool instance
 */
export function createHealthMonitorTool(options?: { orgId?: string }): AnyAgentTool {
  return {
    label: "Business Health",
    name: "business_health",
    description:
      "Check your organization's business health score (0-100) across Revenue, Operations, " +
      "Customer, and Growth domains. Use to identify areas needing attention, track " +
      "improvements, and generate health reports.",
    parameters: HealthMonitorSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const domain =
        typeof params.domain === "string" ? params.domain.trim().toLowerCase() : undefined;
      const includeRecommendations =
        typeof params.includeRecommendations === "boolean" ? params.includeRecommendations : true;

      const headers = buildHeaders(options?.orgId);

      try {
        // Fetch overall health score
        const overallResponse = await fetch(`${DEWX_AI_URL}/api/dew/health/score`, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(15_000),
        });

        if (!overallResponse.ok) {
          const errorText = await overallResponse.text().catch(() => "");
          return jsonResult({
            success: false,
            error: `Health API error: ${overallResponse.status} ${overallResponse.statusText}`,
            details: errorText || undefined,
          });
        }

        const overallData = (await overallResponse.json()) as HealthScoreResponse;

        // If a specific domain is requested, fetch domain detail as well
        let domainDetail: DomainDetailResponse | null = null;
        if (domain) {
          try {
            const domainResponse = await fetch(`${DEWX_AI_URL}/api/dew/health/score/${domain}`, {
              method: "GET",
              headers,
              signal: AbortSignal.timeout(15_000),
            });

            if (domainResponse.ok) {
              domainDetail = (await domainResponse.json()) as DomainDetailResponse;
            }
          } catch {
            // Non-blocking: domain detail is optional enhancement
          }
        }

        // Build response
        const result: Record<string, unknown> = {
          success: true,
          overallScore: overallData.overallScore,
          status: overallData.status,
          lastUpdated: overallData.lastUpdated,
        };

        // Domain breakdowns
        if (domain && domainDetail) {
          result.focusDomain = {
            domain: domainDetail.domain,
            score: domainDetail.score,
            trend: domainDetail.trend,
            indicators: domainDetail.indicators.map((ind) => ({
              name: ind.name,
              value: ind.value,
              status: ind.status,
              description: ind.description,
            })),
            historicalScores: domainDetail.historicalScores,
          };
          if (includeRecommendations && domainDetail.recommendations) {
            result.recommendations = domainDetail.recommendations;
          }
        } else {
          result.domains = overallData.domains.map(formatDomainSummary);
          if (includeRecommendations && overallData.recommendations) {
            result.recommendations = overallData.recommendations;
          }
        }

        // Highlight critical domains (score below 60)
        const criticalDomains = overallData.domains
          .filter((d) => d.score < 60)
          .map((d) => ({ domain: d.domain, score: d.score }));
        if (criticalDomains.length > 0) {
          result.criticalDomains = criticalDomains;
        }

        return jsonResult(result);
      } catch (err) {
        if (err instanceof DOMException && err.name === "TimeoutError") {
          return jsonResult({
            success: false,
            error:
              "Health check timed out after 15 seconds. The Dewx AI service may be slow or unreachable.",
          });
        }
        return jsonResult({
          success: false,
          error: `Health connection error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    },
  };
}

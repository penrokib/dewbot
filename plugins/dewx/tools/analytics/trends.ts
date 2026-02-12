import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import { jsonResult, errorResult, requireString, optionalString } from "../../tool-helpers.js";

export function createTrendsTool(client: DewxApiClient) {
  return {
    label: "Analytics",
    name: "dewx_analytics_trends",
    description:
      "Analyze trends for a given metric over time. Returns data points and trend direction (up, down, stable).",
    parameters: Type.Object({
      metric: Type.String({
        description: "Metric to analyze, e.g. revenue, deals_closed, new_leads",
      }),
      period: Type.Union([Type.Literal("daily"), Type.Literal("weekly"), Type.Literal("monthly")], {
        description: "Aggregation period for data points",
      }),
      startDate: Type.Optional(Type.String({ description: "Date range start (ISO format)" })),
      endDate: Type.Optional(Type.String({ description: "Date range end (ISO format)" })),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      try {
        const metric = requireString(params, "metric");
        const period = requireString(params, "period");
        const startDate = optionalString(params, "startDate");
        const endDate = optionalString(params, "endDate");

        const queryParams: Record<string, unknown> = { metric, period };
        if (startDate) {
          queryParams.startDate = startDate;
        }
        if (endDate) {
          queryParams.endDate = endDate;
        }

        const result = await client.get("/api/analytics/trends", queryParams);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

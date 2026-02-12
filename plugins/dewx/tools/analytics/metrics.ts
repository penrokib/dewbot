import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import { jsonResult, errorResult, optionalString } from "../../tool-helpers.js";

export function createMetricsTool(client: DewxApiClient) {
  return {
    label: "Analytics",
    name: "dewx_analytics_metrics",
    description:
      "Get KPI metrics by name or category. Returns current value, trend direction, and change percentage.",
    parameters: Type.Object({
      metric: Type.Optional(
        Type.String({ description: "Specific metric name, e.g. revenue, churn_rate, mrr, nps" }),
      ),
      category: Type.Optional(
        Type.String({ description: "Metric category, e.g. sales, marketing, finance, hr" }),
      ),
      startDate: Type.Optional(Type.String({ description: "Date range start (ISO format)" })),
      endDate: Type.Optional(Type.String({ description: "Date range end (ISO format)" })),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      try {
        const metric = optionalString(params, "metric");
        const category = optionalString(params, "category");
        const startDate = optionalString(params, "startDate");
        const endDate = optionalString(params, "endDate");

        const queryParams: Record<string, unknown> = {};
        if (metric) {
          queryParams.metric = metric;
        }
        if (category) {
          queryParams.category = category;
        }
        if (startDate) {
          queryParams.startDate = startDate;
        }
        if (endDate) {
          queryParams.endDate = endDate;
        }

        const result = await client.get("/api/analytics/metrics", queryParams);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

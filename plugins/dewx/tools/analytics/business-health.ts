import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import { jsonResult, errorResult } from "../../tool-helpers.js";

export function createBusinessHealthTool(client: DewxApiClient) {
  return {
    label: "Analytics",
    name: "dewx_analytics_health",
    description:
      "Get overall business health score and breakdown across revenue, pipeline, customer satisfaction, and team productivity. No parameters needed.",
    parameters: Type.Object({}),
    execute: async (_toolCallId: string, _params: Record<string, unknown>) => {
      try {
        const result = await client.get("/api/analytics/health");
        return jsonResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

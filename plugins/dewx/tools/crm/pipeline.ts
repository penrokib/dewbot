import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import { jsonResult, errorResult, requireString, optionalString } from "../../tool-helpers.js";

export function createPipelineTool(client: DewxApiClient) {
  return {
    label: "CRM",
    name: "dewx_crm_pipeline",
    description:
      "View pipeline analytics and stages. Actions: analytics (get pipeline summary with totalValue, dealCount, avgDealSize, conversionRate), stages (list all stages with deal counts).",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("analytics"), Type.Literal("stages")]),
      pipelineId: Type.Optional(
        Type.String({ description: "Pipeline ID (uses default pipeline if omitted)" }),
      ),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      const action = requireString(params, "action");

      try {
        switch (action) {
          case "analytics": {
            const pipelineId = optionalString(params, "pipelineId");
            const queryParams: Record<string, unknown> = {};
            if (pipelineId) {
              queryParams.pipelineId = pipelineId;
            }

            const result = await client.get("/api/crm/pipeline/analytics", queryParams);
            return jsonResult(result);
          }

          case "stages": {
            const pipelineId = optionalString(params, "pipelineId");
            const queryParams: Record<string, unknown> = {};
            if (pipelineId) {
              queryParams.pipelineId = pipelineId;
            }

            const result = await client.get("/api/crm/pipeline/stages", queryParams);
            return jsonResult(result);
          }

          default:
            return errorResult(`Unknown action: ${action}. Use analytics or stages.`);
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

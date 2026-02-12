import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import { jsonResult, errorResult, requireString } from "../../tool-helpers.js";

export function createDealRiskTool(client: DewxApiClient) {
  return {
    label: "CRM",
    name: "dewx_crm_deal_risk",
    description:
      "Analyze risk for a specific deal. Returns riskLevel (low/medium/high), an array of risk factors, and a recommendation for next steps.",
    parameters: Type.Object({
      dealId: Type.String({ description: "Deal ID to analyze" }),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      try {
        const dealId = requireString(params, "dealId");

        const result = await client.get(`/api/crm/deals/${dealId}/risk-analysis`);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

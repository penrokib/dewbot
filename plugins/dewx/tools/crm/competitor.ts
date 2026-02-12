import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import { jsonResult, errorResult, optionalString } from "../../tool-helpers.js";

export function createCompetitorTool(client: DewxApiClient) {
  return {
    label: "CRM",
    name: "dewx_crm_competitor_intel",
    description:
      "Look up competitor intelligence. Provide a companyName or dealId to retrieve known competitors and competitive intel.",
    parameters: Type.Object({
      companyName: Type.Optional(
        Type.String({ description: "Competitor company name to look up" }),
      ),
      dealId: Type.Optional(
        Type.String({ description: "Deal ID to find competitors associated with" }),
      ),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      try {
        const companyName = optionalString(params, "companyName");
        const dealId = optionalString(params, "dealId");

        if (!companyName && !dealId) {
          return errorResult("Either companyName or dealId is required");
        }

        const queryParams: Record<string, unknown> = {};
        if (companyName) {
          queryParams.companyName = companyName;
        }
        if (dealId) {
          queryParams.dealId = dealId;
        }

        const result = await client.get("/api/crm/companies/competitor-intel", queryParams);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

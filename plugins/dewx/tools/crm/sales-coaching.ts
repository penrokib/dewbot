import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import { jsonResult, errorResult, optionalString } from "../../tool-helpers.js";

export function createSalesCoachingTool(client: DewxApiClient) {
  return {
    label: "CRM",
    name: "dewx_crm_sales_coaching",
    description:
      "Get AI-powered sales coaching suggestions for a deal or contact. Returns an array of actionable suggestions to improve outcomes.",
    parameters: Type.Object({
      dealId: Type.Optional(Type.String({ description: "Deal ID to get coaching for" })),
      contactId: Type.Optional(Type.String({ description: "Contact ID to get coaching for" })),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      try {
        const dealId = optionalString(params, "dealId");
        const contactId = optionalString(params, "contactId");

        if (!dealId && !contactId) {
          return errorResult("Either dealId or contactId is required");
        }

        const queryParams: Record<string, unknown> = {};
        if (dealId) {
          queryParams.dealId = dealId;
        }
        if (contactId) {
          queryParams.contactId = contactId;
        }

        const result = await client.get("/api/crm/activities/sales-coaching", queryParams);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

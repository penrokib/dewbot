import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import { jsonResult, errorResult, requireString } from "../../tool-helpers.js";

export function createLeadScoringTool(client: DewxApiClient) {
  return {
    label: "CRM",
    name: "dewx_crm_lead_score",
    description:
      "Score a contact's lead quality. Returns a score from 0-100 with contributing factors explaining the rating.",
    parameters: Type.Object({
      contactId: Type.String({ description: "Contact ID to score" }),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      try {
        const contactId = requireString(params, "contactId");

        const result = await client.get(`/api/crm/contacts/${contactId}/lead-score`);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

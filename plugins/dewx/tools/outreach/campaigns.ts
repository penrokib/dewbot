/**
 * Outreach Campaigns tool — create, list, and get stats for campaigns.
 */

import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import {
  jsonResult,
  errorResult,
  requireString,
  optionalString,
  optionalNumber,
} from "../../tool-helpers.js";

export function createCampaignsTool(client: DewxApiClient) {
  return {
    label: "Outreach",
    name: "dewx_outreach_campaigns",
    description:
      "Manage outreach campaigns. Actions: create (new campaign), list (all campaigns), stats (performance metrics for a campaign).",
    parameters: Type.Object({
      action: Type.Unsafe<"create" | "list" | "stats">({
        type: "string",
        enum: ["create", "list", "stats"],
        description: "The action to perform",
      }),
      id: Type.Optional(Type.String({ description: "Campaign ID (for stats)" })),
      name: Type.Optional(Type.String({ description: "Campaign name (for create)" })),
      type: Type.Optional(
        Type.Unsafe<"drip" | "blast" | "ab-test">({
          type: "string",
          enum: ["drip", "blast", "ab-test"],
          description: "Campaign type (for create)",
        }),
      ),
      channelType: Type.Optional(
        Type.Unsafe<"email" | "sms" | "whatsapp" | "social">({
          type: "string",
          enum: ["email", "sms", "whatsapp", "social"],
          description: "Channel for the campaign (for create)",
        }),
      ),
      limit: Type.Optional(Type.Number({ description: "Max results to return (for list)" })),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      const action = requireString(params, "action");

      try {
        switch (action) {
          case "create": {
            const name = requireString(params, "name");
            const type = optionalString(params, "type") ?? "drip";
            const channelType = optionalString(params, "channelType") ?? "email";
            const result = await client.post("/api/outreach/campaigns", {
              name,
              type,
              channelType,
            });
            return jsonResult(result);
          }

          case "list": {
            const limit = optionalNumber(params, "limit");
            const result = await client.get("/api/outreach/campaigns", { limit });
            return jsonResult(result);
          }

          case "stats": {
            const id = requireString(params, "id");
            const result = await client.get(`/api/outreach/campaigns/${id}/stats`);
            return jsonResult(result);
          }

          default:
            return errorResult(`Unknown action: ${action}. Use create, list, or stats.`);
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

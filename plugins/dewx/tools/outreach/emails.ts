/**
 * Outreach Emails tool — send or draft emails.
 */

import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import { jsonResult, errorResult, requireString, optionalString } from "../../tool-helpers.js";

export function createEmailsTool(client: DewxApiClient) {
  return {
    label: "Outreach",
    name: "dewx_outreach_email",
    description:
      "Send or draft an outreach email. Actions: send (deliver immediately), draft (save as draft for review).",
    parameters: Type.Object({
      action: Type.Unsafe<"send" | "draft">({
        type: "string",
        enum: ["send", "draft"],
        description: "Whether to send immediately or save as draft",
      }),
      to: Type.String({ description: "Recipient email address" }),
      subject: Type.String({ description: "Email subject line" }),
      body: Type.String({ description: "Email body (HTML or plain text)" }),
      templateId: Type.Optional(
        Type.String({ description: "Template ID to use instead of raw body" }),
      ),
      contactId: Type.Optional(
        Type.String({ description: "CRM contact ID to link this email to" }),
      ),
      campaignId: Type.Optional(
        Type.String({ description: "Campaign ID to associate this email with" }),
      ),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      const action = requireString(params, "action");

      try {
        const to = requireString(params, "to");
        const subject = requireString(params, "subject");
        const body = requireString(params, "body");
        const templateId = optionalString(params, "templateId");
        const contactId = optionalString(params, "contactId");
        const campaignId = optionalString(params, "campaignId");

        const payload: Record<string, unknown> = {
          to,
          subject,
          body,
          status: action === "send" ? "send" : "draft",
        };
        if (templateId) {
          payload.templateId = templateId;
        }
        if (contactId) {
          payload.contactId = contactId;
        }
        if (campaignId) {
          payload.campaignId = campaignId;
        }

        switch (action) {
          case "send": {
            const result = await client.post("/api/outreach/emails", payload);
            return jsonResult(result);
          }

          case "draft": {
            const result = await client.post("/api/outreach/emails", payload);
            return jsonResult(result);
          }

          default:
            return errorResult(`Unknown action: ${action}. Use send or draft.`);
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

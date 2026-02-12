import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import { jsonResult, errorResult, requireString, optionalString } from "../../tool-helpers.js";

export function createNotificationsTool(client: DewxApiClient) {
  return {
    label: "Workflow",
    name: "dewx_workflow_notify",
    description:
      "Send a notification to a user or channel. Supports email, whatsapp, sms, and in-app channels.",
    parameters: Type.Object({
      channel: Type.Union(
        [
          Type.Literal("email"),
          Type.Literal("whatsapp"),
          Type.Literal("sms"),
          Type.Literal("in-app"),
        ],
        { description: "Notification channel" },
      ),
      to: Type.String({ description: "Recipient — email address, phone number, or user ID" }),
      message: Type.String({ description: "Notification message body" }),
      priority: Type.Optional(
        Type.Union(
          [
            Type.Literal("low"),
            Type.Literal("normal"),
            Type.Literal("high"),
            Type.Literal("urgent"),
          ],
          { description: "Notification priority (default normal)" },
        ),
      ),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      try {
        const channel = requireString(params, "channel");
        const to = requireString(params, "to");
        const message = requireString(params, "message");
        const priority = optionalString(params, "priority");

        const body: Record<string, unknown> = { channel, to, message };
        if (priority) {
          body.priority = priority;
        }

        const result = await client.post("/api/workflow/notifications", body);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

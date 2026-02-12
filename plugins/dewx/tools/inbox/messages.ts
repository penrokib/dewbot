/**
 * Inbox Messages tool — send a message within a conversation.
 */

import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import { jsonResult, errorResult, requireString, optionalString } from "../../tool-helpers.js";

export function createInboxMessagesTool(client: DewxApiClient) {
  return {
    label: "Inbox",
    name: "dewx_inbox_send",
    description:
      "Send a message in an existing inbox conversation. The message is routed through the conversation's original channel (email, WhatsApp, SMS, etc.).",
    parameters: Type.Object({
      conversationId: Type.String({ description: "The conversation to send the message in" }),
      body: Type.String({ description: "Message body text" }),
      channel: Type.Optional(
        Type.Unsafe<"email" | "whatsapp" | "sms" | "chat">({
          type: "string",
          enum: ["email", "whatsapp", "sms", "chat"],
          description: "Override the reply channel (defaults to conversation's channel)",
        }),
      ),
      attachmentUrl: Type.Optional(Type.String({ description: "URL of an attachment to include" })),
      isInternal: Type.Optional(
        Type.Boolean({
          description: "If true, send as an internal note (not visible to customer)",
        }),
      ),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      try {
        const conversationId = requireString(params, "conversationId");
        const body = requireString(params, "body");
        const channel = optionalString(params, "channel");
        const attachmentUrl = optionalString(params, "attachmentUrl");
        const isInternal = params.isInternal === true;

        const payload: Record<string, unknown> = {
          conversationId,
          body,
        };
        if (channel) {
          payload.channel = channel;
        }
        if (attachmentUrl) {
          payload.attachmentUrl = attachmentUrl;
        }
        if (isInternal) {
          payload.isInternal = true;
        }

        const result = await client.post("/api/inbox/messages", payload);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

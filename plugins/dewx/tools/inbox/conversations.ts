/**
 * Inbox Conversations tool — list and get conversations across all channels.
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

export function createInboxConversationsTool(client: DewxApiClient) {
  return {
    label: "Inbox",
    name: "dewx_inbox_conversations",
    description:
      "View unified inbox conversations across all channels. Actions: list (conversations with optional filters), get (single conversation by ID with its messages).",
    parameters: Type.Object({
      action: Type.Unsafe<"list" | "get">({
        type: "string",
        enum: ["list", "get"],
        description: "The action to perform",
      }),
      id: Type.Optional(Type.String({ description: "Conversation ID (for get)" })),
      channel: Type.Optional(
        Type.Unsafe<"email" | "whatsapp" | "sms" | "chat" | "social">({
          type: "string",
          enum: ["email", "whatsapp", "sms", "chat", "social"],
          description: "Filter by channel (for list)",
        }),
      ),
      status: Type.Optional(
        Type.Unsafe<"open" | "closed" | "pending" | "snoozed">({
          type: "string",
          enum: ["open", "closed", "pending", "snoozed"],
          description: "Filter by status (for list)",
        }),
      ),
      assignedTo: Type.Optional(
        Type.String({ description: "Filter by assigned user ID (for list)" }),
      ),
      contactId: Type.Optional(Type.String({ description: "Filter by CRM contact ID (for list)" })),
      limit: Type.Optional(
        Type.Number({ description: "Max results to return (for list), default 20" }),
      ),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      const action = requireString(params, "action");

      try {
        switch (action) {
          case "list": {
            const channel = optionalString(params, "channel");
            const status = optionalString(params, "status");
            const assignedTo = optionalString(params, "assignedTo");
            const contactId = optionalString(params, "contactId");
            const limit = optionalNumber(params, "limit");
            const queryParams: Record<string, unknown> = {};
            if (channel) {
              queryParams.channel = channel;
            }
            if (status) {
              queryParams.status = status;
            }
            if (assignedTo) {
              queryParams.assignedTo = assignedTo;
            }
            if (contactId) {
              queryParams.contactId = contactId;
            }
            if (limit) {
              queryParams.limit = limit;
            }
            const result = await client.get("/api/inbox/conversations", queryParams);
            return jsonResult(result);
          }

          case "get": {
            const id = requireString(params, "id");
            const result = await client.get(`/api/inbox/conversations/${id}`);
            return jsonResult(result);
          }

          default:
            return errorResult(`Unknown action: ${action}. Use list or get.`);
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

/**
 * Outreach Templates tool — list, get, and create message templates.
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

export function createTemplatesTool(client: DewxApiClient) {
  return {
    label: "Outreach",
    name: "dewx_outreach_templates",
    description:
      "Manage reusable message templates for outreach. Actions: list (all templates, filterable by category/channel), get (by ID), create (new template).",
    parameters: Type.Object({
      action: Type.Unsafe<"list" | "get" | "create">({
        type: "string",
        enum: ["list", "get", "create"],
        description: "The action to perform",
      }),
      id: Type.Optional(Type.String({ description: "Template ID (for get)" })),
      name: Type.Optional(Type.String({ description: "Template name (for create)" })),
      body: Type.Optional(
        Type.String({ description: "Template body with {{variable}} placeholders (for create)" }),
      ),
      category: Type.Optional(
        Type.Unsafe<"sales" | "follow-up" | "onboarding" | "support" | "marketing" | "general">({
          type: "string",
          enum: ["sales", "follow-up", "onboarding", "support", "marketing", "general"],
          description: "Template category (for create/list filter)",
        }),
      ),
      channel: Type.Optional(
        Type.Unsafe<"email" | "sms" | "whatsapp" | "social">({
          type: "string",
          enum: ["email", "sms", "whatsapp", "social"],
          description: "Channel this template is for (for create/list filter)",
        }),
      ),
      subject: Type.Optional(
        Type.String({ description: "Email subject line template (for email channel)" }),
      ),
      limit: Type.Optional(Type.Number({ description: "Max results to return (for list)" })),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      const action = requireString(params, "action");

      try {
        switch (action) {
          case "list": {
            const category = optionalString(params, "category");
            const channel = optionalString(params, "channel");
            const limit = optionalNumber(params, "limit");
            const queryParams: Record<string, unknown> = {};
            if (category) {
              queryParams.category = category;
            }
            if (channel) {
              queryParams.channel = channel;
            }
            if (limit) {
              queryParams.limit = limit;
            }
            const result = await client.get("/api/outreach/templates", queryParams);
            return jsonResult(result);
          }

          case "get": {
            const id = requireString(params, "id");
            const result = await client.get(`/api/outreach/templates/${id}`);
            return jsonResult(result);
          }

          case "create": {
            const name = requireString(params, "name");
            const body = requireString(params, "body");
            const category = optionalString(params, "category") ?? "general";
            const channel = optionalString(params, "channel") ?? "email";
            const subject = optionalString(params, "subject");
            const payload: Record<string, unknown> = { name, body, category, channel };
            if (subject) {
              payload.subject = subject;
            }
            const result = await client.post("/api/outreach/templates", payload);
            return jsonResult(result);
          }

          default:
            return errorResult(`Unknown action: ${action}. Use list, get, or create.`);
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

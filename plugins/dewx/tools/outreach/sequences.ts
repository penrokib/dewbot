/**
 * Outreach Sequences tool — create, list, get, start, and pause sequences.
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

export function createSequencesTool(client: DewxApiClient) {
  return {
    label: "Outreach",
    name: "dewx_outreach_sequences",
    description:
      "Manage outreach sequences. Actions: create (multi-step drip sequence), list (all sequences), get (by ID), start (activate for a contact), pause (deactivate for a contact).",
    parameters: Type.Object({
      action: Type.Unsafe<"create" | "list" | "get" | "start" | "pause">({
        type: "string",
        enum: ["create", "list", "get", "start", "pause"],
        description: "The action to perform",
      }),
      id: Type.Optional(Type.String({ description: "Sequence ID (for get/start/pause)" })),
      contactId: Type.Optional(Type.String({ description: "Contact ID (for start/pause)" })),
      name: Type.Optional(Type.String({ description: "Sequence name (for create)" })),
      steps: Type.Optional(
        Type.Array(
          Type.Object({
            type: Type.String({ description: "Step type: email, delay, task, sms" }),
            delayDays: Type.Optional(Type.Number({ description: "Days to wait before this step" })),
            subject: Type.Optional(Type.String()),
            body: Type.Optional(Type.String()),
            templateId: Type.Optional(Type.String()),
          }),
          { description: "Sequence steps (for create)" },
        ),
      ),
      limit: Type.Optional(Type.Number({ description: "Max results to return (for list)" })),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      const action = requireString(params, "action");

      try {
        switch (action) {
          case "create": {
            const name = requireString(params, "name");
            const steps = params.steps;
            if (!Array.isArray(steps) || steps.length === 0) {
              return errorResult("steps array is required for create action");
            }
            const result = await client.post("/api/outreach/sequences", { name, steps });
            return jsonResult(result);
          }

          case "list": {
            const limit = optionalNumber(params, "limit");
            const result = await client.get("/api/outreach/sequences", { limit });
            return jsonResult(result);
          }

          case "get": {
            const id = requireString(params, "id");
            const result = await client.get(`/api/outreach/sequences/${id}`);
            return jsonResult(result);
          }

          case "start": {
            const id = requireString(params, "id");
            const contactId = requireString(params, "contactId");
            const result = await client.post(`/api/outreach/sequences/${id}/start`, { contactId });
            return jsonResult(result);
          }

          case "pause": {
            const id = requireString(params, "id");
            const contactId = requireString(params, "contactId");
            const result = await client.post(`/api/outreach/sequences/${id}/pause`, { contactId });
            return jsonResult(result);
          }

          default:
            return errorResult(
              `Unknown action: ${action}. Use create, list, get, start, or pause.`,
            );
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

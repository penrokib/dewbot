import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import {
  jsonResult,
  errorResult,
  requireString,
  optionalString,
  optionalNumber,
} from "../../tool-helpers.js";

export function createActivitiesTool(client: DewxApiClient) {
  return {
    label: "CRM",
    name: "dewx_crm_activities",
    description:
      "Log and view CRM activities. Actions: log (record a call, email, meeting, or note), timeline (get activity timeline for a contact or deal).",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("log"), Type.Literal("timeline")]),
      // log fields
      type: Type.Optional(
        Type.Union(
          [
            Type.Literal("call"),
            Type.Literal("email"),
            Type.Literal("meeting"),
            Type.Literal("note"),
          ],
          { description: "Activity type" },
        ),
      ),
      description: Type.Optional(Type.String({ description: "Activity description / notes" })),
      contactId: Type.Optional(Type.String({ description: "Associated contact ID" })),
      dealId: Type.Optional(Type.String({ description: "Associated deal ID" })),
      // log — optional metadata
      duration: Type.Optional(
        Type.Number({ description: "Duration in minutes (for calls/meetings)" }),
      ),
      outcome: Type.Optional(
        Type.String({ description: "Activity outcome (e.g. connected, voicemail, no-answer)" }),
      ),
      // timeline
      limit: Type.Optional(
        Type.Number({ description: "Max timeline entries to return (default 20)" }),
      ),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      const action = requireString(params, "action");

      try {
        switch (action) {
          case "log": {
            const type = requireString(params, "type");
            const description = optionalString(params, "description");
            const contactId = optionalString(params, "contactId");
            const dealId = optionalString(params, "dealId");
            const duration = optionalNumber(params, "duration");
            const outcome = optionalString(params, "outcome");

            if (!contactId && !dealId) {
              return errorResult("Either contactId or dealId is required to log an activity");
            }

            const body: Record<string, unknown> = { type };
            if (description) {
              body.description = description;
            }
            if (contactId) {
              body.contactId = contactId;
            }
            if (dealId) {
              body.dealId = dealId;
            }
            if (duration !== undefined) {
              body.duration = duration;
            }
            if (outcome) {
              body.outcome = outcome;
            }

            const result = await client.post("/api/crm/activities", body);
            return jsonResult(result);
          }

          case "timeline": {
            const contactId = optionalString(params, "contactId");
            const dealId = optionalString(params, "dealId");
            const limit = optionalNumber(params, "limit") ?? 20;

            if (!contactId && !dealId) {
              return errorResult("Either contactId or dealId is required for timeline");
            }

            const queryParams: Record<string, unknown> = { limit };
            if (contactId) {
              queryParams.contactId = contactId;
            }
            if (dealId) {
              queryParams.dealId = dealId;
            }

            const result = await client.get("/api/crm/activities", queryParams);
            return jsonResult(result);
          }

          default:
            return errorResult(`Unknown action: ${action}. Use log or timeline.`);
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

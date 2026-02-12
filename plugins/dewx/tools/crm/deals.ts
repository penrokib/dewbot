import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import {
  jsonResult,
  errorResult,
  requireString,
  optionalString,
  optionalNumber,
} from "../../tool-helpers.js";

export function createDealsTool(client: DewxApiClient) {
  return {
    label: "CRM",
    name: "dewx_crm_deals",
    description:
      "Manage CRM deals. Actions: create (new deal), update (modify deal), list (filter deals), get (deal by ID), move (change pipeline stage).",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("create"),
        Type.Literal("update"),
        Type.Literal("list"),
        Type.Literal("get"),
        Type.Literal("move"),
      ]),
      // create fields
      title: Type.Optional(Type.String({ description: "Deal title" })),
      value: Type.Optional(Type.Number({ description: "Deal monetary value" })),
      contactId: Type.Optional(Type.String({ description: "Associated contact ID" })),
      stageId: Type.Optional(Type.String({ description: "Pipeline stage ID" })),
      // get / update / move
      dealId: Type.Optional(Type.String({ description: "Deal ID for get/update/move actions" })),
      // list filters
      status: Type.Optional(Type.String({ description: "Filter by status (open, won, lost)" })),
      pipelineId: Type.Optional(Type.String({ description: "Filter by pipeline ID" })),
      assigneeId: Type.Optional(Type.String({ description: "Filter by assignee user ID" })),
      limit: Type.Optional(Type.Number({ description: "Max results to return (default 20)" })),
      offset: Type.Optional(Type.Number({ description: "Pagination offset" })),
      // update — additional fields
      fields: Type.Optional(
        Type.Record(Type.String(), Type.Unknown(), {
          description: "Additional fields to update (key-value pairs)",
        }),
      ),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      const action = requireString(params, "action");

      try {
        switch (action) {
          case "create": {
            const title = requireString(params, "title");
            const value = optionalNumber(params, "value");
            const contactId = optionalString(params, "contactId");
            const stageId = optionalString(params, "stageId");

            const body: Record<string, unknown> = { title };
            if (value !== undefined) {
              body.value = value;
            }
            if (contactId) {
              body.contactId = contactId;
            }
            if (stageId) {
              body.stageId = stageId;
            }

            const result = await client.post("/api/crm/deals", body);
            return jsonResult(result);
          }

          case "update": {
            const dealId = requireString(params, "dealId");
            const body: Record<string, unknown> = {};

            const title = optionalString(params, "title");
            const value = optionalNumber(params, "value");
            const contactId = optionalString(params, "contactId");
            const stageId = optionalString(params, "stageId");
            const status = optionalString(params, "status");
            const fields = params.fields as Record<string, unknown> | undefined;

            if (title) {
              body.title = title;
            }
            if (value !== undefined) {
              body.value = value;
            }
            if (contactId) {
              body.contactId = contactId;
            }
            if (stageId) {
              body.stageId = stageId;
            }
            if (status) {
              body.status = status;
            }
            if (fields) {
              Object.assign(body, fields);
            }

            if (Object.keys(body).length === 0) {
              return errorResult("No fields provided for update");
            }

            const result = await client.patch(`/api/crm/deals/${dealId}`, body);
            return jsonResult(result);
          }

          case "list": {
            const queryParams: Record<string, unknown> = {};
            const status = optionalString(params, "status");
            const pipelineId = optionalString(params, "pipelineId");
            const assigneeId = optionalString(params, "assigneeId");
            const limit = optionalNumber(params, "limit") ?? 20;
            const offset = optionalNumber(params, "offset");

            if (status) {
              queryParams.status = status;
            }
            if (pipelineId) {
              queryParams.pipelineId = pipelineId;
            }
            if (assigneeId) {
              queryParams.assigneeId = assigneeId;
            }
            queryParams.limit = limit;
            if (offset !== undefined) {
              queryParams.offset = offset;
            }

            const result = await client.get("/api/crm/deals", queryParams);
            return jsonResult(result);
          }

          case "get": {
            const dealId = requireString(params, "dealId");
            const result = await client.get(`/api/crm/deals/${dealId}`);
            return jsonResult(result);
          }

          case "move": {
            const dealId = requireString(params, "dealId");
            const stageId = requireString(params, "stageId");

            const result = await client.patch(`/api/crm/deals/${dealId}`, { stageId });
            return jsonResult(result);
          }

          default:
            return errorResult(
              `Unknown action: ${action}. Use create, update, list, get, or move.`,
            );
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

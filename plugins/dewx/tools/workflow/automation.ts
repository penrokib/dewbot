import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import {
  jsonResult,
  errorResult,
  requireString,
  optionalString,
  optionalNumber,
} from "../../tool-helpers.js";

export function createAutomationTool(client: DewxApiClient) {
  return {
    label: "Workflow",
    name: "dewx_workflow_automation",
    description:
      "Manage workflow automations. Actions: create (new automation with trigger, conditions, and actions), list (all automations), toggle (enable or disable an automation).",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("create"), Type.Literal("list"), Type.Literal("toggle")]),
      // create
      name: Type.Optional(Type.String({ description: "Automation name (create)" })),
      trigger: Type.Optional(
        Type.String({
          description: "Trigger event, e.g. deal_stage_changed, invoice_overdue, new_lead (create)",
        }),
      ),
      conditions: Type.Optional(
        Type.Array(Type.Record(Type.String(), Type.Unknown()), {
          description:
            "Array of condition objects, e.g. [{field: 'amount', op: 'gt', value: 1000}] (create)",
        }),
      ),
      actions: Type.Optional(
        Type.Array(Type.Record(Type.String(), Type.Unknown()), {
          description:
            "Array of action objects, e.g. [{type: 'send_email', template: 'follow-up'}] (create)",
        }),
      ),
      // list
      limit: Type.Optional(Type.Number({ description: "Max results to return (default 20)" })),
      // toggle
      automationId: Type.Optional(
        Type.String({ description: "Automation ID (required for toggle)" }),
      ),
      enabled: Type.Optional(
        Type.Boolean({ description: "Set to true to enable, false to disable (toggle)" }),
      ),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      const action = requireString(params, "action");

      try {
        switch (action) {
          case "create": {
            const name = requireString(params, "name");
            const trigger = requireString(params, "trigger");
            const conditions = params.conditions as Record<string, unknown>[] | undefined;
            const actions = params.actions as Record<string, unknown>[] | undefined;

            const body: Record<string, unknown> = { name, trigger };
            if (conditions) {
              body.conditions = conditions;
            }
            if (actions) {
              body.actions = actions;
            }

            const result = await client.post("/api/workflow/automations", body);
            return jsonResult(result);
          }

          case "list": {
            const limit = optionalNumber(params, "limit") ?? 20;
            const result = await client.get("/api/workflow/automations", { limit });
            return jsonResult(result);
          }

          case "toggle": {
            const automationId = requireString(params, "automationId");
            const enabled = params.enabled;

            if (typeof enabled !== "boolean") {
              return errorResult("enabled (true/false) is required for toggle action");
            }

            const result = await client.patch(`/api/workflow/automations/${automationId}`, {
              enabled,
            });
            return jsonResult(result);
          }

          default:
            return errorResult(`Unknown action: ${action}. Use create, list, or toggle.`);
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

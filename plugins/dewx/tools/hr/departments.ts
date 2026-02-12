import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import { jsonResult, errorResult, requireString } from "../../tool-helpers.js";

export function createDepartmentsTool(client: DewxApiClient) {
  return {
    label: "HR",
    name: "dewx_hr_departments",
    description:
      "Manage departments. Actions: list (all departments), get (department by ID with its employees).",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("list"), Type.Literal("get")]),
      departmentId: Type.Optional(Type.String({ description: "Department ID for get action" })),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      const action = requireString(params, "action");

      try {
        switch (action) {
          case "list": {
            const result = await client.get("/api/hr/departments");
            return jsonResult(result);
          }

          case "get": {
            const departmentId = requireString(params, "departmentId");
            const result = await client.get(`/api/hr/departments/${departmentId}`);
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

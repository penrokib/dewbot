import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import {
  jsonResult,
  errorResult,
  requireString,
  optionalString,
  optionalNumber,
} from "../../tool-helpers.js";

export function createEmployeesTool(client: DewxApiClient) {
  return {
    label: "HR",
    name: "dewx_hr_employees",
    description:
      "Manage employees. Actions: list (all employees, optional filters), get (employee by ID).",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("list"), Type.Literal("get")]),
      employeeId: Type.Optional(Type.String({ description: "Employee ID for get action" })),
      departmentId: Type.Optional(Type.String({ description: "Filter by department ID (list)" })),
      status: Type.Optional(
        Type.String({
          description: "Filter by employment status, e.g. active, inactive, onboarding (list)",
        }),
      ),
      limit: Type.Optional(Type.Number({ description: "Max results to return (default 20)" })),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      const action = requireString(params, "action");

      try {
        switch (action) {
          case "list": {
            const departmentId = optionalString(params, "departmentId");
            const status = optionalString(params, "status");
            const limit = optionalNumber(params, "limit") ?? 20;

            const queryParams: Record<string, unknown> = { limit };
            if (departmentId) {
              queryParams.departmentId = departmentId;
            }
            if (status) {
              queryParams.status = status;
            }

            const result = await client.get("/api/hr/employees", queryParams);
            return jsonResult(result);
          }

          case "get": {
            const employeeId = requireString(params, "employeeId");
            const result = await client.get(`/api/hr/employees/${employeeId}`);
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

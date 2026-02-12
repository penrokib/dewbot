import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import { jsonResult, errorResult, requireString, optionalString } from "../../tool-helpers.js";

export function createAttendanceTool(client: DewxApiClient) {
  return {
    label: "HR",
    name: "dewx_hr_attendance",
    description:
      "Track employee attendance. Actions: get (attendance records for an employee in a date range), log (record attendance for an employee).",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("get"), Type.Literal("log")]),
      employeeId: Type.Optional(
        Type.String({ description: "Employee ID (required for both actions)" }),
      ),
      // get — date range
      startDate: Type.Optional(
        Type.String({ description: "Start date (ISO format, e.g. 2025-01-01) for get action" }),
      ),
      endDate: Type.Optional(
        Type.String({ description: "End date (ISO format, e.g. 2025-01-31) for get action" }),
      ),
      // log
      date: Type.Optional(
        Type.String({ description: "Date to log attendance for (ISO format, e.g. 2025-01-15)" }),
      ),
      status: Type.Optional(
        Type.Union(
          [
            Type.Literal("present"),
            Type.Literal("absent"),
            Type.Literal("late"),
            Type.Literal("leave"),
          ],
          { description: "Attendance status for log action" },
        ),
      ),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      const action = requireString(params, "action");

      try {
        switch (action) {
          case "get": {
            const employeeId = requireString(params, "employeeId");
            const startDate = optionalString(params, "startDate");
            const endDate = optionalString(params, "endDate");

            const queryParams: Record<string, unknown> = { employeeId };
            if (startDate) {
              queryParams.startDate = startDate;
            }
            if (endDate) {
              queryParams.endDate = endDate;
            }

            const result = await client.get("/api/hr/attendance", queryParams);
            return jsonResult(result);
          }

          case "log": {
            const employeeId = requireString(params, "employeeId");
            const date = requireString(params, "date");
            const status = requireString(params, "status");

            const body: Record<string, unknown> = { employeeId, date, status };
            const result = await client.post("/api/hr/attendance", body);
            return jsonResult(result);
          }

          default:
            return errorResult(`Unknown action: ${action}. Use get or log.`);
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

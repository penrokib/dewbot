import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import {
  jsonResult,
  errorResult,
  requireString,
  optionalString,
  optionalNumber,
} from "../../tool-helpers.js";

export function createLeaveTool(client: DewxApiClient) {
  return {
    label: "HR",
    name: "dewx_hr_leave",
    description:
      "Manage leave requests. Actions: request (submit a new leave request), list (view leave requests), approve (approve a request), reject (reject a request).",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("request"),
        Type.Literal("list"),
        Type.Literal("approve"),
        Type.Literal("reject"),
      ]),
      // request
      employeeId: Type.Optional(
        Type.String({ description: "Employee ID (required for request and list)" }),
      ),
      type: Type.Optional(
        Type.String({
          description: "Leave type, e.g. vacation, sick, personal, parental (request)",
        }),
      ),
      startDate: Type.Optional(Type.String({ description: "Leave start date (ISO format)" })),
      endDate: Type.Optional(Type.String({ description: "Leave end date (ISO format)" })),
      reason: Type.Optional(Type.String({ description: "Reason for the leave request" })),
      // list
      status: Type.Optional(
        Type.String({ description: "Filter by status: pending, approved, rejected (list)" }),
      ),
      limit: Type.Optional(Type.Number({ description: "Max results to return (default 20)" })),
      // approve / reject
      leaveId: Type.Optional(
        Type.String({ description: "Leave request ID (required for approve/reject)" }),
      ),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      const action = requireString(params, "action");

      try {
        switch (action) {
          case "request": {
            const employeeId = requireString(params, "employeeId");
            const type = requireString(params, "type");
            const startDate = requireString(params, "startDate");
            const endDate = requireString(params, "endDate");
            const reason = optionalString(params, "reason");

            const body: Record<string, unknown> = { employeeId, type, startDate, endDate };
            if (reason) {
              body.reason = reason;
            }

            const result = await client.post("/api/hr/leave", body);
            return jsonResult(result);
          }

          case "list": {
            const employeeId = optionalString(params, "employeeId");
            const status = optionalString(params, "status");
            const limit = optionalNumber(params, "limit") ?? 20;

            const queryParams: Record<string, unknown> = { limit };
            if (employeeId) {
              queryParams.employeeId = employeeId;
            }
            if (status) {
              queryParams.status = status;
            }

            const result = await client.get("/api/hr/leave", queryParams);
            return jsonResult(result);
          }

          case "approve": {
            const leaveId = requireString(params, "leaveId");
            const result = await client.post(`/api/hr/leave/${leaveId}/approve`);
            return jsonResult(result);
          }

          case "reject": {
            const leaveId = requireString(params, "leaveId");
            const reason = optionalString(params, "reason");

            const body: Record<string, unknown> = {};
            if (reason) {
              body.reason = reason;
            }

            const result = await client.post(`/api/hr/leave/${leaveId}/reject`, body);
            return jsonResult(result);
          }

          default:
            return errorResult(`Unknown action: ${action}. Use request, list, approve, or reject.`);
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import {
  jsonResult,
  errorResult,
  requireString,
  optionalString,
  optionalNumber,
} from "../../tool-helpers.js";

export function createCrmTasksTool(client: DewxApiClient) {
  return {
    label: "CRM",
    name: "dewx_crm_tasks",
    description:
      "Manage CRM tasks. Actions: create (new task), list (filter tasks), complete (mark a task as done).",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("create"), Type.Literal("list"), Type.Literal("complete")]),
      // create fields
      title: Type.Optional(Type.String({ description: "Task title" })),
      description: Type.Optional(Type.String({ description: "Task description" })),
      assigneeId: Type.Optional(Type.String({ description: "User ID to assign the task to" })),
      dueDate: Type.Optional(
        Type.String({ description: "Due date in ISO 8601 format (e.g. 2025-03-15)" }),
      ),
      priority: Type.Optional(
        Type.Union(
          [
            Type.Literal("low"),
            Type.Literal("medium"),
            Type.Literal("high"),
            Type.Literal("urgent"),
          ],
          { description: "Task priority level" },
        ),
      ),
      relatedContactId: Type.Optional(Type.String({ description: "Related contact ID" })),
      relatedDealId: Type.Optional(Type.String({ description: "Related deal ID" })),
      // list filters
      status: Type.Optional(
        Type.String({ description: "Filter by status (pending, completed, overdue)" }),
      ),
      limit: Type.Optional(Type.Number({ description: "Max results to return (default 20)" })),
      // complete
      taskId: Type.Optional(Type.String({ description: "Task ID for complete action" })),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      const action = requireString(params, "action");

      try {
        switch (action) {
          case "create": {
            const title = requireString(params, "title");
            const description = optionalString(params, "description");
            const assigneeId = optionalString(params, "assigneeId");
            const dueDate = optionalString(params, "dueDate");
            const priority = optionalString(params, "priority");
            const relatedContactId = optionalString(params, "relatedContactId");
            const relatedDealId = optionalString(params, "relatedDealId");

            const body: Record<string, unknown> = { title };
            if (description) {
              body.description = description;
            }
            if (assigneeId) {
              body.assigneeId = assigneeId;
            }
            if (dueDate) {
              body.dueDate = dueDate;
            }
            if (priority) {
              body.priority = priority;
            }
            if (relatedContactId) {
              body.relatedContactId = relatedContactId;
            }
            if (relatedDealId) {
              body.relatedDealId = relatedDealId;
            }

            const result = await client.post("/api/crm/tasks", body);
            return jsonResult(result);
          }

          case "list": {
            const queryParams: Record<string, unknown> = {};
            const status = optionalString(params, "status");
            const assigneeId = optionalString(params, "assigneeId");
            const priority = optionalString(params, "priority");
            const limit = optionalNumber(params, "limit") ?? 20;

            if (status) {
              queryParams.status = status;
            }
            if (assigneeId) {
              queryParams.assigneeId = assigneeId;
            }
            if (priority) {
              queryParams.priority = priority;
            }
            queryParams.limit = limit;

            const result = await client.get("/api/crm/tasks", queryParams);
            return jsonResult(result);
          }

          case "complete": {
            const taskId = requireString(params, "taskId");
            const result = await client.patch(`/api/crm/tasks/${taskId}`, {
              status: "completed",
              completedAt: new Date().toISOString(),
            });
            return jsonResult(result);
          }

          default:
            return errorResult(`Unknown action: ${action}. Use create, list, or complete.`);
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

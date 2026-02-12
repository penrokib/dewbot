import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import { jsonResult, errorResult, requireString, optionalString } from "../../tool-helpers.js";

export function createReportsTool(client: DewxApiClient) {
  return {
    label: "Analytics",
    name: "dewx_analytics_report",
    description:
      "Generate a business report. Types: sales, marketing, finance, hr, custom. Specify a date range and optional format.",
    parameters: Type.Object({
      type: Type.Union(
        [
          Type.Literal("sales"),
          Type.Literal("marketing"),
          Type.Literal("finance"),
          Type.Literal("hr"),
          Type.Literal("custom"),
        ],
        { description: "Report type to generate" },
      ),
      startDate: Type.Optional(
        Type.String({ description: "Report period start date (ISO format)" }),
      ),
      endDate: Type.Optional(Type.String({ description: "Report period end date (ISO format)" })),
      format: Type.Optional(
        Type.String({
          description: "Output format, e.g. summary, detailed, csv (default summary)",
        }),
      ),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      try {
        const type = requireString(params, "type");
        const startDate = optionalString(params, "startDate");
        const endDate = optionalString(params, "endDate");
        const format = optionalString(params, "format");

        const body: Record<string, unknown> = { type };
        if (startDate) {
          body.startDate = startDate;
        }
        if (endDate) {
          body.endDate = endDate;
        }
        if (format) {
          body.format = format;
        }

        const result = await client.post("/api/analytics/reports", body);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

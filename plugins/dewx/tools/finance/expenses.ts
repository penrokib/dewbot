/**
 * Finance Expenses tool — log and list business expenses.
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

export function createExpensesTool(client: DewxApiClient) {
  return {
    label: "Finance",
    name: "dewx_finance_expenses",
    description:
      "Track business expenses. Actions: log (record a new expense), list (view expenses with optional filters by category, date range).",
    parameters: Type.Object({
      action: Type.Unsafe<"log" | "list">({
        type: "string",
        enum: ["log", "list"],
        description: "The action to perform",
      }),
      amount: Type.Optional(Type.Number({ description: "Expense amount in cents (for log)" })),
      category: Type.Optional(
        Type.Unsafe<
          | "office"
          | "travel"
          | "software"
          | "marketing"
          | "payroll"
          | "utilities"
          | "equipment"
          | "other"
        >({
          type: "string",
          enum: [
            "office",
            "travel",
            "software",
            "marketing",
            "payroll",
            "utilities",
            "equipment",
            "other",
          ],
          description: "Expense category (for log/list filter)",
        }),
      ),
      description: Type.Optional(
        Type.String({ description: "Description of the expense (for log)" }),
      ),
      date: Type.Optional(
        Type.String({
          description: "Expense date in ISO format YYYY-MM-DD (for log, defaults to today)",
        }),
      ),
      currency: Type.Optional(
        Type.String({ description: "Currency code, e.g., USD (for log, default USD)" }),
      ),
      vendor: Type.Optional(Type.String({ description: "Vendor or payee name (for log)" })),
      receiptUrl: Type.Optional(
        Type.String({ description: "URL to a receipt image or document (for log)" }),
      ),
      fromDate: Type.Optional(
        Type.String({ description: "Start date filter YYYY-MM-DD (for list)" }),
      ),
      toDate: Type.Optional(Type.String({ description: "End date filter YYYY-MM-DD (for list)" })),
      limit: Type.Optional(Type.Number({ description: "Max results to return (for list)" })),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      const action = requireString(params, "action");

      try {
        switch (action) {
          case "log": {
            const amount = params.amount;
            if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
              return errorResult("amount is required and must be a positive number (in cents)");
            }
            const category = requireString(params, "category");
            const description = requireString(params, "description");
            const date = optionalString(params, "date");
            const currency = optionalString(params, "currency") ?? "USD";
            const vendor = optionalString(params, "vendor");
            const receiptUrl = optionalString(params, "receiptUrl");

            const payload: Record<string, unknown> = {
              amount,
              category,
              description,
              currency,
            };
            if (date) {
              payload.date = date;
            }
            if (vendor) {
              payload.vendor = vendor;
            }
            if (receiptUrl) {
              payload.receiptUrl = receiptUrl;
            }

            const result = await client.post("/api/finance/expenses", payload);
            return jsonResult(result);
          }

          case "list": {
            const category = optionalString(params, "category");
            const fromDate = optionalString(params, "fromDate");
            const toDate = optionalString(params, "toDate");
            const limit = optionalNumber(params, "limit");
            const queryParams: Record<string, unknown> = {};
            if (category) {
              queryParams.category = category;
            }
            if (fromDate) {
              queryParams.fromDate = fromDate;
            }
            if (toDate) {
              queryParams.toDate = toDate;
            }
            if (limit) {
              queryParams.limit = limit;
            }
            const result = await client.get("/api/finance/expenses", queryParams);
            return jsonResult(result);
          }

          default:
            return errorResult(`Unknown action: ${action}. Use log or list.`);
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

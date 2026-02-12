/**
 * Finance Payments tool — record and list payments against invoices.
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

export function createPaymentsTool(client: DewxApiClient) {
  return {
    label: "Finance",
    name: "dewx_finance_payments",
    description:
      "Track payments. Actions: record (log a payment received against an invoice), list (view payment history with optional filters).",
    parameters: Type.Object({
      action: Type.Unsafe<"record" | "list">({
        type: "string",
        enum: ["record", "list"],
        description: "The action to perform",
      }),
      invoiceId: Type.Optional(
        Type.String({ description: "Invoice ID this payment applies to (for record/list filter)" }),
      ),
      amount: Type.Optional(Type.Number({ description: "Payment amount in cents (for record)" })),
      method: Type.Optional(
        Type.Unsafe<
          "bank_transfer" | "credit_card" | "cash" | "check" | "paypal" | "stripe" | "other"
        >({
          type: "string",
          enum: ["bank_transfer", "credit_card", "cash", "check", "paypal", "stripe", "other"],
          description: "Payment method (for record)",
        }),
      ),
      reference: Type.Optional(
        Type.String({ description: "Payment reference or transaction ID (for record)" }),
      ),
      date: Type.Optional(
        Type.String({
          description: "Payment date in ISO format YYYY-MM-DD (for record, defaults to today)",
        }),
      ),
      notes: Type.Optional(
        Type.String({ description: "Additional notes about the payment (for record)" }),
      ),
      contactId: Type.Optional(Type.String({ description: "Filter by CRM contact ID (for list)" })),
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
          case "record": {
            const invoiceId = requireString(params, "invoiceId");
            const amount = params.amount;
            if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
              return errorResult("amount is required and must be a positive number (in cents)");
            }
            const method = requireString(params, "method");
            const reference = optionalString(params, "reference");
            const date = optionalString(params, "date");
            const notes = optionalString(params, "notes");

            const payload: Record<string, unknown> = {
              invoiceId,
              amount,
              method,
            };
            if (reference) {
              payload.reference = reference;
            }
            if (date) {
              payload.date = date;
            }
            if (notes) {
              payload.notes = notes;
            }

            const result = await client.post("/api/finance/payments", payload);
            return jsonResult(result);
          }

          case "list": {
            const invoiceId = optionalString(params, "invoiceId");
            const contactId = optionalString(params, "contactId");
            const fromDate = optionalString(params, "fromDate");
            const toDate = optionalString(params, "toDate");
            const limit = optionalNumber(params, "limit");
            const queryParams: Record<string, unknown> = {};
            if (invoiceId) {
              queryParams.invoiceId = invoiceId;
            }
            if (contactId) {
              queryParams.contactId = contactId;
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
            const result = await client.get("/api/finance/payments", queryParams);
            return jsonResult(result);
          }

          default:
            return errorResult(`Unknown action: ${action}. Use record or list.`);
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

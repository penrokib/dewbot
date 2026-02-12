/**
 * Finance Invoices tool — create, list, get, and send invoices.
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

export function createInvoicesTool(client: DewxApiClient) {
  return {
    label: "Finance",
    name: "dewx_finance_invoices",
    description:
      "Manage invoices. Actions: create (new invoice with line items), list (all invoices with filters), get (single invoice by ID), send (email invoice to client).",
    parameters: Type.Object({
      action: Type.Unsafe<"create" | "list" | "get" | "send">({
        type: "string",
        enum: ["create", "list", "get", "send"],
        description: "The action to perform",
      }),
      id: Type.Optional(Type.String({ description: "Invoice ID (for get/send)" })),
      contactId: Type.Optional(
        Type.String({ description: "CRM contact ID for the client (for create)" }),
      ),
      items: Type.Optional(
        Type.Array(
          Type.Object({
            description: Type.String({ description: "Line item description" }),
            quantity: Type.Number({ description: "Quantity" }),
            unitPrice: Type.Number({ description: "Unit price in cents" }),
            taxRate: Type.Optional(
              Type.Number({ description: "Tax rate as percentage (e.g., 10 for 10%)" }),
            ),
          }),
          { description: "Invoice line items (for create)" },
        ),
      ),
      dueDate: Type.Optional(
        Type.String({ description: "Due date in ISO format YYYY-MM-DD (for create)" }),
      ),
      currency: Type.Optional(
        Type.String({ description: "Currency code, e.g., USD (for create, default USD)" }),
      ),
      notes: Type.Optional(
        Type.String({ description: "Additional notes for the invoice (for create)" }),
      ),
      status: Type.Optional(
        Type.Unsafe<"draft" | "sent" | "paid" | "overdue" | "void">({
          type: "string",
          enum: ["draft", "sent", "paid", "overdue", "void"],
          description: "Filter by status (for list)",
        }),
      ),
      limit: Type.Optional(Type.Number({ description: "Max results to return (for list)" })),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      const action = requireString(params, "action");

      try {
        switch (action) {
          case "create": {
            const contactId = requireString(params, "contactId");
            const items = params.items;
            if (!Array.isArray(items) || items.length === 0) {
              return errorResult("items array with at least one line item is required for create");
            }
            const dueDate = requireString(params, "dueDate");
            const currency = optionalString(params, "currency") ?? "USD";
            const notes = optionalString(params, "notes");
            const payload: Record<string, unknown> = {
              contactId,
              items,
              dueDate,
              currency,
            };
            if (notes) {
              payload.notes = notes;
            }
            const result = await client.post("/api/finance/invoices", payload);
            return jsonResult(result);
          }

          case "list": {
            const status = optionalString(params, "status");
            const limit = optionalNumber(params, "limit");
            const queryParams: Record<string, unknown> = {};
            if (status) {
              queryParams.status = status;
            }
            if (limit) {
              queryParams.limit = limit;
            }
            const result = await client.get("/api/finance/invoices", queryParams);
            return jsonResult(result);
          }

          case "get": {
            const id = requireString(params, "id");
            const result = await client.get(`/api/finance/invoices/${id}`);
            return jsonResult(result);
          }

          case "send": {
            const id = requireString(params, "id");
            const result = await client.post(`/api/finance/invoices/${id}/send`);
            return jsonResult(result);
          }

          default:
            return errorResult(`Unknown action: ${action}. Use create, list, get, or send.`);
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import {
  jsonResult,
  errorResult,
  requireString,
  optionalString,
  optionalNumber,
} from "../../tool-helpers.js";

export function createContactsTool(client: DewxApiClient) {
  return {
    label: "CRM",
    name: "dewx_crm_contacts",
    description:
      "Manage CRM contacts. Actions: create (new contact), search (find contacts by query), get (contact by ID), update (modify contact fields).",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("create"),
        Type.Literal("search"),
        Type.Literal("get"),
        Type.Literal("update"),
      ]),
      // create / update fields
      firstName: Type.Optional(Type.String({ description: "Contact first name" })),
      lastName: Type.Optional(Type.String({ description: "Contact last name" })),
      email: Type.Optional(Type.String({ description: "Contact email address" })),
      phone: Type.Optional(Type.String({ description: "Contact phone number" })),
      company: Type.Optional(Type.String({ description: "Company name or ID to associate" })),
      // search
      query: Type.Optional(Type.String({ description: "Search query string" })),
      limit: Type.Optional(Type.Number({ description: "Max results to return (default 20)" })),
      // get / update
      contactId: Type.Optional(Type.String({ description: "Contact ID for get/update actions" })),
      // update — additional fields as a generic object
      fields: Type.Optional(
        Type.Record(Type.String(), Type.Unknown(), {
          description: "Additional fields to update (key-value pairs)",
        }),
      ),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      const action = requireString(params, "action");

      try {
        switch (action) {
          case "create": {
            const firstName = requireString(params, "firstName");
            const lastName = optionalString(params, "lastName");
            const email = optionalString(params, "email");
            const phone = optionalString(params, "phone");
            const company = optionalString(params, "company");

            const body: Record<string, unknown> = { firstName };
            if (lastName) {
              body.lastName = lastName;
            }
            if (email) {
              body.email = email;
            }
            if (phone) {
              body.phone = phone;
            }
            if (company) {
              body.company = company;
            }

            const result = await client.post("/api/crm/contacts", body);
            return jsonResult(result);
          }

          case "search": {
            const query = optionalString(params, "query") ?? "";
            const limit = optionalNumber(params, "limit") ?? 20;

            const result = await client.get("/api/crm/contacts", { q: query, limit });
            return jsonResult(result);
          }

          case "get": {
            const contactId = requireString(params, "contactId");
            const result = await client.get(`/api/crm/contacts/${contactId}`);
            return jsonResult(result);
          }

          case "update": {
            const contactId = requireString(params, "contactId");
            const body: Record<string, unknown> = {};

            const firstName = optionalString(params, "firstName");
            const lastName = optionalString(params, "lastName");
            const email = optionalString(params, "email");
            const phone = optionalString(params, "phone");
            const company = optionalString(params, "company");
            const fields = params.fields as Record<string, unknown> | undefined;

            if (firstName) {
              body.firstName = firstName;
            }
            if (lastName) {
              body.lastName = lastName;
            }
            if (email) {
              body.email = email;
            }
            if (phone) {
              body.phone = phone;
            }
            if (company) {
              body.company = company;
            }
            if (fields) {
              Object.assign(body, fields);
            }

            if (Object.keys(body).length === 0) {
              return errorResult("No fields provided for update");
            }

            const result = await client.patch(`/api/crm/contacts/${contactId}`, body);
            return jsonResult(result);
          }

          default:
            return errorResult(`Unknown action: ${action}. Use create, search, get, or update.`);
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

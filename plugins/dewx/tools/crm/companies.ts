import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import {
  jsonResult,
  errorResult,
  requireString,
  optionalString,
  optionalNumber,
} from "../../tool-helpers.js";

export function createCompaniesTool(client: DewxApiClient) {
  return {
    label: "CRM",
    name: "dewx_crm_companies",
    description:
      "Manage CRM companies. Actions: create (new company), search (find companies), get (company by ID), update (modify company fields).",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("create"),
        Type.Literal("search"),
        Type.Literal("get"),
        Type.Literal("update"),
      ]),
      // create / update fields
      name: Type.Optional(Type.String({ description: "Company name" })),
      domain: Type.Optional(Type.String({ description: "Company website domain" })),
      industry: Type.Optional(Type.String({ description: "Industry sector" })),
      size: Type.Optional(
        Type.String({ description: "Company size (e.g. 1-10, 11-50, 51-200, 201-500, 500+)" }),
      ),
      // search
      query: Type.Optional(Type.String({ description: "Search query string" })),
      limit: Type.Optional(Type.Number({ description: "Max results to return (default 20)" })),
      // get / update
      companyId: Type.Optional(Type.String({ description: "Company ID for get/update actions" })),
      // update — additional fields
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
            const name = requireString(params, "name");
            const domain = optionalString(params, "domain");
            const industry = optionalString(params, "industry");
            const size = optionalString(params, "size");

            const body: Record<string, unknown> = { name };
            if (domain) {
              body.domain = domain;
            }
            if (industry) {
              body.industry = industry;
            }
            if (size) {
              body.size = size;
            }

            const result = await client.post("/api/crm/companies", body);
            return jsonResult(result);
          }

          case "search": {
            const query = optionalString(params, "query") ?? "";
            const limit = optionalNumber(params, "limit") ?? 20;

            const result = await client.get("/api/crm/companies", { q: query, limit });
            return jsonResult(result);
          }

          case "get": {
            const companyId = requireString(params, "companyId");
            const result = await client.get(`/api/crm/companies/${companyId}`);
            return jsonResult(result);
          }

          case "update": {
            const companyId = requireString(params, "companyId");
            const body: Record<string, unknown> = {};

            const name = optionalString(params, "name");
            const domain = optionalString(params, "domain");
            const industry = optionalString(params, "industry");
            const size = optionalString(params, "size");
            const fields = params.fields as Record<string, unknown> | undefined;

            if (name) {
              body.name = name;
            }
            if (domain) {
              body.domain = domain;
            }
            if (industry) {
              body.industry = industry;
            }
            if (size) {
              body.size = size;
            }
            if (fields) {
              Object.assign(body, fields);
            }

            if (Object.keys(body).length === 0) {
              return errorResult("No fields provided for update");
            }

            const result = await client.patch(`/api/crm/companies/${companyId}`, body);
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

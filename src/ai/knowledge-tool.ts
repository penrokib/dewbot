/**
 * Knowledge Search Tool
 *
 * Calls the Dewx Knowledge Base API to search the expert knowledge
 * base for business information, policies, procedures, best practices,
 * and domain expertise.
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../agents/tools/common.js";
import { jsonResult } from "../agents/tools/common.js";

// ─── Types ────────────────────────────────────────────────────

interface KnowledgeDocument {
  title: string;
  content: string;
  summary: string;
  tags: string[];
  domain: string;
}

interface KnowledgeResult {
  document: KnowledgeDocument;
  score: number;
  highlights: string[];
}

interface KnowledgeSearchResponse {
  results: KnowledgeResult[];
  query: string;
}

// ─── Configuration ────────────────────────────────────────────

const DEWX_AI_URL = process.env.DEWBOT_DEWX_AI_URL || "http://localhost:4010";
const SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET || "";

// ─── Schema ───────────────────────────────────────────────────

const KnowledgeSearchSchema = Type.Object({
  query: Type.String({
    description: "The search query. Use natural language to describe what you are looking for.",
  }),
  domain: Type.Optional(
    Type.String({
      description:
        "Filter results by domain (e.g., 'sales', 'finance', 'hr', 'marketing', 'operations').",
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: "Maximum number of results to return. Default 5.",
      minimum: 1,
      maximum: 20,
    }),
  ),
});

// ─── Tool Factory ─────────────────────────────────────────────

/**
 * Create a knowledge_search tool that calls the Dewx Knowledge Base API.
 *
 * @param options.orgId - Organization ID for request context
 * @returns AnyAgentTool instance
 */
export function createKnowledgeTool(options?: { orgId?: string }): AnyAgentTool {
  return {
    label: "Knowledge Search",
    name: "knowledge_search",
    description:
      "Search the expert knowledge base for business information, policies, procedures, " +
      "best practices, and domain expertise. Contains 710+ documents across 32+ domains " +
      "including sales, finance, HR, marketing, operations, and more.",
    parameters: KnowledgeSearchSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const query = params.query as string;

      if (!query || typeof query !== "string" || !query.trim()) {
        return jsonResult({
          success: false,
          error: "A search query is required.",
        });
      }

      const limit =
        typeof params.limit === "number" ? Math.min(20, Math.max(1, Math.trunc(params.limit))) : 5;
      const domain = typeof params.domain === "string" ? params.domain.trim() : undefined;

      try {
        const body: Record<string, unknown> = {
          query: query.trim(),
          limit,
        };

        // Map domain filter to baseIds if provided
        if (domain) {
          body.baseIds = [domain];
        }

        const response = await fetch(`${DEWX_AI_URL}/api/knowledge/search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(SERVICE_SECRET ? { "x-service-secret": SERVICE_SECRET } : {}),
            ...(options?.orgId ? { "x-organization-id": options.orgId } : {}),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          return jsonResult({
            success: false,
            error: `Knowledge API error: ${response.status} ${response.statusText}`,
            details: errorText || undefined,
          });
        }

        const data = (await response.json()) as KnowledgeSearchResponse;

        if (!data.results || data.results.length === 0) {
          return jsonResult({
            success: true,
            message: "No relevant knowledge found for this query.",
            query: data.query,
            results: [],
          });
        }

        const formattedResults = data.results.map((r) => ({
          title: r.document.title,
          domain: r.document.domain,
          summary: r.document.summary,
          tags: r.document.tags,
          highlights: r.highlights,
          relevanceScore: r.score,
        }));

        return jsonResult({
          success: true,
          query: data.query,
          resultCount: formattedResults.length,
          results: formattedResults,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "TimeoutError") {
          return jsonResult({
            success: false,
            error: "Knowledge search timed out after 10 seconds.",
          });
        }
        return jsonResult({
          success: false,
          error: `Knowledge connection error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    },
  };
}

/**
 * Council Debate Tool
 *
 * Calls the Dewx LLM Council API to convene multi-persona debates
 * for strategic decisions. The council uses 3-5 AI personas that
 * debate and synthesize a recommendation.
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../agents/tools/common.js";
import { jsonResult } from "../agents/tools/common.js";

// ─── Types ────────────────────────────────────────────────────

interface CouncilConsensus {
  agreementScore: number;
  convergencePoints: string[];
  divergencePoints: string[];
}

interface CouncilDebateResponse {
  debateId: string;
  finalAnswer: string;
  synthesisReasoning: string;
  consensus: CouncilConsensus;
  totalDurationMs: number;
  totalTokens: number;
}

// ─── Configuration ────────────────────────────────────────────

const DEWX_AI_URL = process.env.DEWBOT_DEWX_AI_URL || "http://localhost:4010";
const SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET || "";

// ─── Schema ───────────────────────────────────────────────────

const CouncilDebateSchema = Type.Object({
  query: Type.String({
    description:
      "The strategic question or decision to debate. Be specific and include relevant context for better results.",
  }),
  councilSize: Type.Optional(
    Type.Number({
      description:
        "Number of council personas (2-5). Default 3. Use 4-5 for complex multi-domain decisions.",
      minimum: 2,
      maximum: 5,
    }),
  ),
  context: Type.Optional(
    Type.String({
      description:
        "Additional business context to inform the debate (e.g., current metrics, constraints, goals).",
    }),
  ),
});

// ─── Tool Factory ─────────────────────────────────────────────

/**
 * Create a council_debate tool that calls the Dewx Council API.
 *
 * @param options.orgId - Organization ID for request context
 * @returns AnyAgentTool instance
 */
export function createCouncilTool(options?: { orgId?: string }): AnyAgentTool {
  return {
    label: "Council Debate",
    name: "council_debate",
    description:
      "Convene an LLM Council for strategic decisions. Uses 3-5 AI personas " +
      "(Strategist, Operator, Innovator, Analyst, Customer Advocate) that debate " +
      "and synthesize a recommendation. Use for: strategic planning, multi-domain " +
      "decisions, pricing/expansion questions, anything requiring diverse perspectives.",
    parameters: CouncilDebateSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const query = params.query as string;

      if (!query || typeof query !== "string" || !query.trim()) {
        return jsonResult({
          success: false,
          error: "A query is required to start a council debate.",
        });
      }

      const councilSize =
        typeof params.councilSize === "number"
          ? Math.min(5, Math.max(2, Math.trunc(params.councilSize)))
          : 3;
      const context = typeof params.context === "string" ? params.context.trim() : undefined;

      try {
        const response = await fetch(`${DEWX_AI_URL}/api/dew/council/debate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(SERVICE_SECRET ? { "x-service-secret": SERVICE_SECRET } : {}),
            ...(options?.orgId ? { "x-organization-id": options.orgId } : {}),
          },
          body: JSON.stringify({
            query: query.trim(),
            councilSize,
            ...(context ? { context } : {}),
            stream: false,
          }),
          signal: AbortSignal.timeout(60_000),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          return jsonResult({
            success: false,
            error: `Council API error: ${response.status} ${response.statusText}`,
            details: errorText || undefined,
          });
        }

        const data = (await response.json()) as CouncilDebateResponse;

        return jsonResult({
          success: true,
          debateId: data.debateId,
          finalAnswer: data.finalAnswer,
          synthesisReasoning: data.synthesisReasoning,
          consensus: {
            agreementScore: data.consensus.agreementScore,
            convergencePoints: data.consensus.convergencePoints,
            divergencePoints: data.consensus.divergencePoints,
          },
          durationMs: data.totalDurationMs,
          totalTokens: data.totalTokens,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "TimeoutError") {
          return jsonResult({
            success: false,
            error:
              "Council debate timed out after 60 seconds. The query may be too complex. Try reducing councilSize or simplifying the question.",
          });
        }
        return jsonResult({
          success: false,
          error: `Council connection error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    },
  };
}

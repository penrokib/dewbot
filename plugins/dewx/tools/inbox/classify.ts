/**
 * Inbox Classify tool — auto-classify a conversation's category, priority, and sentiment.
 */

import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import { jsonResult, errorResult, requireString } from "../../tool-helpers.js";

export function createClassifyTool(client: DewxApiClient) {
  return {
    label: "Inbox",
    name: "dewx_inbox_classify",
    description:
      "Auto-classify an inbox conversation using AI. Returns the detected category (sales, support, billing, spam, etc.), priority level (low/medium/high/urgent), and sentiment (positive/neutral/negative).",
    parameters: Type.Object({
      conversationId: Type.String({ description: "The conversation to classify" }),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      try {
        const conversationId = requireString(params, "conversationId");

        const result = await client.post("/api/inbox/classify", { conversationId });
        return jsonResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

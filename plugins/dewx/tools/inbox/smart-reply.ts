/**
 * Inbox Smart Reply tool — generate an AI-powered reply suggestion for a conversation.
 */

import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import { jsonResult, errorResult, requireString, optionalString } from "../../tool-helpers.js";

export function createSmartReplyTool(client: DewxApiClient) {
  return {
    label: "Inbox",
    name: "dewx_inbox_smart_reply",
    description:
      "Generate an AI-powered smart reply suggestion for a conversation. Analyzes conversation history and context to produce an appropriate response draft.",
    parameters: Type.Object({
      conversationId: Type.String({ description: "The conversation to generate a reply for" }),
      tone: Type.Optional(
        Type.Unsafe<"professional" | "friendly" | "concise" | "empathetic" | "formal">({
          type: "string",
          enum: ["professional", "friendly", "concise", "empathetic", "formal"],
          description: "Desired tone for the reply (default: professional)",
        }),
      ),
      instructions: Type.Optional(
        Type.String({ description: "Additional instructions for the AI reply generation" }),
      ),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      try {
        const conversationId = requireString(params, "conversationId");
        const tone = optionalString(params, "tone") ?? "professional";
        const instructions = optionalString(params, "instructions");

        const payload: Record<string, unknown> = {
          conversationId,
          tone,
        };
        if (instructions) {
          payload.instructions = instructions;
        }

        const result = await client.post("/api/inbox/smart-reply", payload);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

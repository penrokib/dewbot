/**
 * Outreach Social Actions tool — perform social media engagement actions.
 */

import { Type } from "@sinclair/typebox";
import type { DewxApiClient } from "../../dewx-client.js";
import { jsonResult, errorResult, requireString, optionalString } from "../../tool-helpers.js";

export function createSocialActionsTool(client: DewxApiClient) {
  return {
    label: "Outreach",
    name: "dewx_outreach_social",
    description:
      "Perform social media actions on behalf of the business. Actions: follow (follow a user), like (like a post), retweet (repost/retweet), comment (leave a comment).",
    parameters: Type.Object({
      action: Type.Unsafe<"follow" | "like" | "retweet" | "comment">({
        type: "string",
        enum: ["follow", "like", "retweet", "comment"],
        description: "Social action to perform",
      }),
      platform: Type.Unsafe<"twitter" | "linkedin" | "instagram" | "facebook">({
        type: "string",
        enum: ["twitter", "linkedin", "instagram", "facebook"],
        description: "Social media platform",
      }),
      targetId: Type.Optional(
        Type.String({ description: "Platform-specific target ID (user ID or post ID)" }),
      ),
      url: Type.Optional(Type.String({ description: "URL of the post or profile to act on" })),
      content: Type.Optional(
        Type.String({ description: "Comment or reply text (for comment action)" }),
      ),
      contactId: Type.Optional(
        Type.String({ description: "CRM contact ID to link this activity to" }),
      ),
    }),
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      const action = requireString(params, "action");

      try {
        const platform = requireString(params, "platform");
        const targetId = optionalString(params, "targetId");
        const url = optionalString(params, "url");
        const content = optionalString(params, "content");
        const contactId = optionalString(params, "contactId");

        if (!targetId && !url) {
          return errorResult("Either targetId or url is required");
        }

        if (action === "comment" && !content) {
          return errorResult("content is required for comment action");
        }

        const payload: Record<string, unknown> = {
          action,
          platform,
        };
        if (targetId) {
          payload.targetId = targetId;
        }
        if (url) {
          payload.url = url;
        }
        if (content) {
          payload.content = content;
        }
        if (contactId) {
          payload.contactId = contactId;
        }

        const result = await client.post("/api/outreach/social", payload);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

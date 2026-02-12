/**
 * Auto-Delegation Module
 *
 * Determines when an incoming message should be routed to a domain-specific
 * specialist agent, and builds the spawn parameters for `sessions_spawn`.
 */

import type { SpecialistConfig } from "./registry.js";
import { findSpecialistByKeywords, getSpecialist } from "./registry.js";

export type DelegationDecision = {
  delegate: boolean;
  specialistId?: string;
  confidence: number;
  reason: string;
};

export type SpawnParams = {
  task: string;
  agentId: string;
  label: string;
  runTimeoutSeconds: number;
};

/**
 * Analyze a message to decide whether it should be delegated to a specialist.
 *
 * The decision is based on keyword matching against the specialist registry.
 * A minimum of 2 keyword matches and a confidence score above 0.5 are required
 * for delegation to be recommended.
 *
 * Confidence is calculated as: matchCount / totalKeywords for the best-matching
 * specialist, capped at 1.0.
 */
export function shouldDelegate(message: string): DelegationDecision {
  if (!message || typeof message !== "string" || !message.trim()) {
    return {
      delegate: false,
      confidence: 0,
      reason: "Empty or invalid message",
    };
  }

  const specialist = findSpecialistByKeywords(message);

  if (!specialist) {
    return {
      delegate: false,
      confidence: 0,
      reason: "No specialist matched with sufficient keyword overlap",
    };
  }

  const confidence = computeConfidence(message, specialist);

  if (confidence <= 0.5) {
    return {
      delegate: false,
      specialistId: specialist.id,
      confidence,
      reason: `Matched ${specialist.name} but confidence ${confidence.toFixed(2)} is below threshold (>0.5 required)`,
    };
  }

  return {
    delegate: true,
    specialistId: specialist.id,
    confidence,
    reason: `Delegating to ${specialist.name} (confidence: ${confidence.toFixed(2)})`,
  };
}

/**
 * Build the parameters for a `sessions_spawn` tool call targeting a specialist.
 *
 * The task description is augmented with the specialist's system prompt guidance
 * so the spawned sub-agent has full context about its role and capabilities.
 *
 * @throws Error if the specialistId is not found in the registry.
 */
export function buildSpecialistSpawnParams(specialistId: string, task: string): SpawnParams {
  const specialist = getSpecialist(specialistId);

  if (!specialist) {
    throw new Error(`Unknown specialist ID: "${specialistId}". Check the specialist registry.`);
  }

  const augmentedTask = [
    `[${specialist.name}]`,
    "",
    specialist.systemPromptAddition,
    "",
    "---",
    "",
    "Task:",
    task,
  ].join("\n");

  return {
    task: augmentedTask,
    agentId: specialist.id,
    label: specialist.name,
    runTimeoutSeconds: 300,
  };
}

/**
 * Compute a confidence score for how well a message matches a specialist.
 *
 * The score is the ratio of matched keywords to total keywords for the specialist,
 * capped at 1.0. Multi-word keywords are matched as substrings; single-word
 * keywords are matched with word boundaries.
 */
function computeConfidence(message: string, specialist: SpecialistConfig): number {
  const lower = message.toLowerCase();
  const total = specialist.keywords.length;

  if (total === 0) {
    return 0;
  }

  let matches = 0;

  for (const keyword of specialist.keywords) {
    if (keyword.includes(" ")) {
      if (lower.includes(keyword)) {
        matches++;
      }
    } else {
      const pattern = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i");
      if (pattern.test(lower)) {
        matches++;
      }
    }
  }

  return Math.min(matches / total, 1.0);
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

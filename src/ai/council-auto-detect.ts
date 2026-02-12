/**
 * Council Auto-Detection
 *
 * Port of Dewx's shouldUseCouncil() logic for detecting when a user
 * query warrants convening an LLM Council debate instead of a single
 * LLM response.
 */

// ─── Signal Dictionaries ──────────────────────────────────────

const STRATEGIC_SIGNALS = [
  "strategy",
  "strategic",
  "roadmap",
  "plan",
  "direction",
  "should we",
  "evaluate",
  "assess",
  "compare",
  "analyze",
  "recommend",
  "suggest",
  "advice",
  "guidance",
  "pros and cons",
  "trade-offs",
  "alternatives",
  "market",
  "competitive",
  "position",
];

const COMPLEXITY_SIGNALS = [
  "why",
  "how does",
  "explain",
  "justify",
  "multiple",
  "various",
  "different perspectives",
  "implications",
  "consequences",
  "impact",
];

const HIGH_STAKES_SIGNALS = [
  "critical",
  "important",
  "urgent",
  "priority",
  "decision",
  "choose",
  "invest",
  "budget",
  "hire",
  "fire",
  "pivot",
  "expand",
];

// ─── Detection ────────────────────────────────────────────────

/**
 * Determine whether a query should trigger a council debate.
 *
 * Returns true if:
 * - Two or more signal matches are found across all categories, OR
 * - Any high-stakes signal is present, OR
 * - The query is long (>50 words) and has at least one signal match
 */
export function shouldUseCouncil(query: string): boolean {
  const lower = query.toLowerCase();
  const wordCount = query.split(/\s+/).filter(Boolean).length;

  let matches = 0;
  let hasHighStakes = false;

  for (const signal of STRATEGIC_SIGNALS) {
    if (lower.includes(signal)) {
      matches++;
    }
  }

  for (const signal of COMPLEXITY_SIGNALS) {
    if (lower.includes(signal)) {
      matches++;
    }
  }

  for (const signal of HIGH_STAKES_SIGNALS) {
    if (lower.includes(signal)) {
      matches++;
      hasHighStakes = true;
    }
  }

  // Any high-stakes signal is sufficient
  if (hasHighStakes) {
    return true;
  }

  // Two or more signal matches across any category
  if (matches >= 2) {
    return true;
  }

  // Long queries with at least one signal match
  if (wordCount > 50 && matches >= 1) {
    return true;
  }

  return false;
}

// ─── Council Size Selection ───────────────────────────────────

/**
 * Select the appropriate council size based on query complexity.
 *
 * - 3: Simple strategic questions (1-2 signal matches)
 * - 4: Moderate complexity (3-4 matches or multi-domain)
 * - 5: Comprehensive analysis (5+ matches or high-stakes + strategic)
 */
export function selectCouncilSize(query: string): number {
  const lower = query.toLowerCase();

  let strategicMatches = 0;
  let complexityMatches = 0;
  let highStakesMatches = 0;

  for (const signal of STRATEGIC_SIGNALS) {
    if (lower.includes(signal)) {
      strategicMatches++;
    }
  }

  for (const signal of COMPLEXITY_SIGNALS) {
    if (lower.includes(signal)) {
      complexityMatches++;
    }
  }

  for (const signal of HIGH_STAKES_SIGNALS) {
    if (lower.includes(signal)) {
      highStakesMatches++;
    }
  }

  const totalMatches = strategicMatches + complexityMatches + highStakesMatches;

  // Comprehensive: many signals or high-stakes combined with strategic depth
  if (totalMatches >= 5 || (highStakesMatches > 0 && strategicMatches >= 2)) {
    return 5;
  }

  // Moderate: multi-domain or several signals
  if (totalMatches >= 3 || (complexityMatches >= 1 && strategicMatches >= 1)) {
    return 4;
  }

  // Simple strategic question
  return 3;
}

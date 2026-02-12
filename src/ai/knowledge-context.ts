/**
 * Knowledge Context Enrichment
 *
 * Pre-chat RAG module that searches the Dewx Knowledge Base and
 * returns formatted background context to inject into the system
 * prompt or conversation context.
 */

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

/** Minimum relevance score to include a result */
const RELEVANCE_THRESHOLD = 0.1;

/** Maximum number of chunks to include in context */
const MAX_CONTEXT_CHUNKS = 3;

// ─── Knowledge-Seeking Detection ──────────────────────────────

const KNOWLEDGE_PATTERNS = [
  "policy",
  "procedure",
  "how do",
  "documentation",
  "faq",
  "guideline",
  "handbook",
  "best practice",
  "what is our",
  "company",
  "process",
];

/**
 * Determine whether a message should trigger knowledge enrichment.
 *
 * Returns true if the message contains patterns that suggest the user
 * is looking for organizational knowledge or documentation.
 */
export function shouldEnrichWithKnowledge(message: string): boolean {
  const lower = message.toLowerCase();
  return KNOWLEDGE_PATTERNS.some((pattern) => lower.includes(pattern));
}

// ─── Context Enrichment ───────────────────────────────────────

/**
 * Search the knowledge base and return formatted background context.
 *
 * Calls the Dewx Knowledge Search API with the user's message,
 * filters results by relevance threshold, and formats the top 2-3
 * chunks as background knowledge context.
 *
 * @param message - The user's message to search for relevant knowledge
 * @param orgId - Organization ID for request context
 * @returns Formatted background context string, or null if no relevant results
 */
export async function enrichWithKnowledge(message: string, orgId: string): Promise<string | null> {
  try {
    const response = await fetch(`${DEWX_AI_URL}/api/knowledge/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SERVICE_SECRET ? { "x-service-secret": SERVICE_SECRET } : {}),
        ...(orgId ? { "x-organization-id": orgId } : {}),
      },
      body: JSON.stringify({
        query: message,
        limit: MAX_CONTEXT_CHUNKS + 2, // Fetch a few extra in case some are below threshold
      }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as KnowledgeSearchResponse;

    if (!data.results || data.results.length === 0) {
      return null;
    }

    // Filter by relevance threshold
    const relevant = data.results.filter((r) => r.score > RELEVANCE_THRESHOLD);

    if (relevant.length === 0) {
      return null;
    }

    // Take top chunks up to the maximum
    const topChunks = relevant.slice(0, MAX_CONTEXT_CHUNKS);

    // Format as background knowledge
    const chunks = topChunks.map((r) => {
      const parts: string[] = [];
      parts.push(`### ${r.document.title}`);
      if (r.document.domain) {
        parts.push(`*Domain: ${r.document.domain}*`);
      }
      // Prefer summary for context brevity, fall back to highlights or content
      if (r.document.summary) {
        parts.push(r.document.summary);
      } else if (r.highlights && r.highlights.length > 0) {
        parts.push(r.highlights.join("\n"));
      } else if (r.document.content) {
        // Truncate long content to keep context manageable
        const maxLen = 500;
        const content =
          r.document.content.length > maxLen
            ? r.document.content.slice(0, maxLen) + "..."
            : r.document.content;
        parts.push(content);
      }
      return parts.join("\n");
    });

    return `## Background Knowledge\n\n${chunks.join("\n\n")}`;
  } catch {
    // Non-blocking: silently return null on any error (timeout, network, etc.)
    return null;
  }
}

/**
 * DewBot Model Evaluation Script
 *
 * Tests the fine-tuned dew-unified-3b model against a held-out test set.
 * Measures: tool-call accuracy, routing accuracy, latency.
 *
 * Usage:
 *   npx ts-node scripts/eval-dewbot-model.ts
 *   npx ts-node scripts/eval-dewbot-model.ts --model-url http://localhost:8765
 *   npx ts-node scripts/eval-dewbot-model.ts --test-file data/training/test.jsonl
 *   npx ts-node scripts/eval-dewbot-model.ts --concurrency 4 --max-examples 200
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface TestExample {
  messages: ChatMessage[];
}

interface CompletionResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface EvalResult {
  index: number;
  toolCallCorrect: boolean;
  routingCorrect: boolean;
  latencyMs: number;
  expectedAction: string | null;
  predictedAction: string | null;
  expectedRouting: string | null;
  predictedRouting: string | null;
  error: string | null;
}

interface EvalSummary {
  totalExamples: number;
  successfulInferences: number;
  failedInferences: number;
  toolCallAccuracy: number;
  routingAccuracy: number;
  latency: {
    p50: number;
    p95: number;
    p99: number;
    mean: number;
    min: number;
    max: number;
  };
  passFailThresholds: {
    toolAccuracy: { value: number; threshold: number; pass: boolean };
    routingAccuracy: { value: number; threshold: number; pass: boolean };
    p95Latency: { value: number; threshold: number; pass: boolean };
  };
  overallPass: boolean;
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) {
    return undefined;
  }
  return process.argv[idx + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

const MODEL_URL = parseArg("--model-url") || "http://localhost:8765";
const MODEL_NAME = parseArg("--model-name") || "dew-unified-3b";
const TEST_FILE =
  parseArg("--test-file") || path.join(__dirname, "..", "data", "training", "test.jsonl");
const CONCURRENCY = parseInt(parseArg("--concurrency") || "1", 10);
const MAX_EXAMPLES = parseInt(parseArg("--max-examples") || "0", 10);
const VERBOSE = hasFlag("--verbose");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the action/tool name from an assistant response.
 * Supports JSON responses like {"action": "contact.create", ...}
 * and tool-call style responses with router/action fields.
 */
function extractAction(content: string): string | null {
  if (!content) {
    return null;
  }

  const trimmed = content.trim();

  // Try parsing as JSON
  try {
    const parsed = JSON.parse(trimmed);

    // Format: {"action": "contact.create", "params": {...}}
    if (parsed.action) {
      return String(parsed.action);
    }

    // Format: {"tool": "crm_contacts", "action": "create", ...}
    if (parsed.tool && parsed.action) {
      return `${parsed.tool}.${parsed.action}`;
    }

    // Format: {"router": "crm_contacts", "action": "create", ...}
    if (parsed.router && parsed.action) {
      return `${parsed.router}.${parsed.action}`;
    }

    // Format: {"name": "crm_contacts", ...}
    if (parsed.name) {
      return String(parsed.name);
    }

    return null;
  } catch {
    // Not JSON -- try to find action patterns in free text
  }

  // Pattern: action: "something" or action: something
  const actionMatch = trimmed.match(/["']?action["']?\s*[:=]\s*["']([^"']+)["']/i);
  if (actionMatch) {
    return actionMatch[1];
  }

  return null;
}

/**
 * Extract routing decision from an assistant response.
 * Looks for SELF/ESCALATE/DELEGATE patterns in the response.
 */
function extractRouting(content: string): string | null {
  if (!content) {
    return null;
  }

  const upper = content.toUpperCase();

  // Direct routing keywords
  if (upper.includes("ESCALATE")) {
    return "ESCALATE";
  }
  if (upper.includes("DELEGATE")) {
    return "DELEGATE";
  }

  // JSON-based routing
  try {
    const parsed = JSON.parse(content.trim());
    if (parsed.routing) {
      return String(parsed.routing).toUpperCase();
    }
    if (parsed.route) {
      return String(parsed.route).toUpperCase();
    }
    if (parsed.decision) {
      return String(parsed.decision).toUpperCase();
    }

    // If it has an action, it is handling it (SELF)
    if (parsed.action || parsed.tool || parsed.router) {
      return "SELF";
    }
  } catch {
    // Not JSON
  }

  // If it produced a structured action, treat as SELF
  if (extractAction(content)) {
    return "SELF";
  }

  return null;
}

/**
 * Calculate a percentile from a sorted array of numbers.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

/**
 * Send a chat completion request to the model server.
 */
async function chatCompletion(
  messages: ChatMessage[],
): Promise<{ response: string; latencyMs: number }> {
  const start = performance.now();

  const res = await fetch(`${MODEL_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages,
      temperature: 0,
      max_tokens: 512,
    }),
  });

  const latencyMs = performance.now() - start;

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as CompletionResponse;

  if (!data.choices || data.choices.length === 0) {
    throw new Error("No choices returned from model");
  }

  return {
    response: data.choices[0].message.content,
    latencyMs,
  };
}

/**
 * Load test examples from a JSONL file.
 */
function loadTestData(filepath: string): TestExample[] {
  if (!fs.existsSync(filepath)) {
    console.error(`Test file not found: ${filepath}`);
    console.error("Run the training pipeline first: ./scripts/train-dewbot-model.sh");
    process.exit(1);
  }

  const lines = fs.readFileSync(filepath, "utf-8").split("\n").filter(Boolean);
  const examples: TestExample[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.messages && Array.isArray(parsed.messages) && parsed.messages.length >= 2) {
        examples.push(parsed as TestExample);
      }
    } catch {
      // Skip malformed lines
    }
  }

  return examples;
}

/**
 * Evaluate a single test example against the model.
 */
async function evaluateExample(example: TestExample, index: number): Promise<EvalResult> {
  // Split messages: everything except the last assistant message is input,
  // the last assistant message is the expected output.
  const lastAssistantIdx = findLastAssistantIndex(example.messages);

  if (lastAssistantIdx === -1) {
    return {
      index,
      toolCallCorrect: false,
      routingCorrect: false,
      latencyMs: 0,
      expectedAction: null,
      predictedAction: null,
      expectedRouting: null,
      predictedRouting: null,
      error: "No assistant message in example",
    };
  }

  const inputMessages = example.messages.slice(0, lastAssistantIdx);
  const expectedContent = example.messages[lastAssistantIdx].content;

  const expectedAction = extractAction(expectedContent);
  const expectedRouting = extractRouting(expectedContent);

  try {
    const { response, latencyMs } = await chatCompletion(inputMessages);

    const predictedAction = extractAction(response);
    const predictedRouting = extractRouting(response);

    // Tool-call accuracy: both must be non-null and match
    const toolCallCorrect =
      expectedAction !== null &&
      predictedAction !== null &&
      normalizeAction(expectedAction) === normalizeAction(predictedAction);

    // Routing accuracy: both must be non-null and match
    const routingCorrect =
      expectedRouting !== null && predictedRouting !== null && expectedRouting === predictedRouting;

    if (VERBOSE) {
      const toolIcon = toolCallCorrect ? "[OK]" : "[FAIL]";
      const routeIcon = routingCorrect ? "[OK]" : "[FAIL]";
      console.log(
        `  #${index + 1} ${toolIcon} tool: ${predictedAction || "(none)"} vs ${expectedAction || "(none)"} | ${routeIcon} route: ${predictedRouting || "(none)"} vs ${expectedRouting || "(none)"} | ${latencyMs.toFixed(0)}ms`,
      );
    }

    return {
      index,
      toolCallCorrect,
      routingCorrect,
      latencyMs,
      expectedAction,
      predictedAction,
      expectedRouting,
      predictedRouting,
      error: null,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (VERBOSE) {
      console.log(`  #${index + 1} [ERROR] ${message}`);
    }
    return {
      index,
      toolCallCorrect: false,
      routingCorrect: false,
      latencyMs: 0,
      expectedAction: expectedAction,
      predictedAction: null,
      expectedRouting: expectedRouting,
      predictedRouting: null,
      error: message,
    };
  }
}

/**
 * Normalize an action string for comparison.
 * Lowercases and strips whitespace so "Contact.Create" matches "contact.create".
 */
function normalizeAction(action: string): string {
  return action.toLowerCase().replace(/\s+/g, "").trim();
}

/**
 * Find the index of the last assistant message in the conversation.
 */
function findLastAssistantIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      return i;
    }
  }
  return -1;
}

/**
 * Run evaluation in batches with controlled concurrency.
 */
async function runEvaluation(examples: TestExample[]): Promise<EvalResult[]> {
  const results: EvalResult[] = [];
  const total = examples.length;

  for (let i = 0; i < total; i += CONCURRENCY) {
    const batch = examples.slice(i, i + CONCURRENCY);
    const batchPromises = batch.map((example, batchIdx) => evaluateExample(example, i + batchIdx));
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Progress indicator (every 10 examples or at the end)
    const done = Math.min(i + CONCURRENCY, total);
    if (done % 10 === 0 || done === total) {
      const pct = ((done / total) * 100).toFixed(0);
      process.stdout.write(`\r  Progress: ${done}/${total} (${pct}%)`);
    }
  }
  process.stdout.write("\n");

  return results;
}

/**
 * Compute the summary report from evaluation results.
 */
function computeSummary(results: EvalResult[]): EvalSummary {
  const successful = results.filter((r) => r.error === null);
  const failed = results.filter((r) => r.error !== null);

  // Tool-call accuracy: only count examples that have an expected action
  const toolCallExamples = successful.filter((r) => r.expectedAction !== null);
  const toolCallCorrect = toolCallExamples.filter((r) => r.toolCallCorrect).length;
  const toolCallAccuracy =
    toolCallExamples.length > 0 ? (toolCallCorrect / toolCallExamples.length) * 100 : 0;

  // Routing accuracy: only count examples that have an expected routing
  const routingExamples = successful.filter((r) => r.expectedRouting !== null);
  const routingCorrect = routingExamples.filter((r) => r.routingCorrect).length;
  const routingAccuracy =
    routingExamples.length > 0 ? (routingCorrect / routingExamples.length) * 100 : 0;

  // Latency stats from successful inferences
  const latencies = successful.map((r) => r.latencyMs).toSorted((a, b) => a - b);

  const latencyStats = {
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    mean: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
    min: latencies.length > 0 ? latencies[0] : 0,
    max: latencies.length > 0 ? latencies[latencies.length - 1] : 0,
  };

  // Pass/fail thresholds
  const toolPass = toolCallAccuracy > 85;
  const routePass = routingAccuracy > 90;
  const latencyPass = latencyStats.p95 < 500;

  return {
    totalExamples: results.length,
    successfulInferences: successful.length,
    failedInferences: failed.length,
    toolCallAccuracy,
    routingAccuracy,
    latency: latencyStats,
    passFailThresholds: {
      toolAccuracy: {
        value: toolCallAccuracy,
        threshold: 85,
        pass: toolPass,
      },
      routingAccuracy: {
        value: routingAccuracy,
        threshold: 90,
        pass: routePass,
      },
      p95Latency: {
        value: latencyStats.p95,
        threshold: 500,
        pass: latencyPass,
      },
    },
    overallPass: toolPass && routePass && latencyPass,
  };
}

/**
 * Print the evaluation report to stdout.
 */
function printReport(summary: EvalSummary): void {
  const pass = (v: boolean) => (v ? "PASS" : "FAIL");
  const bar = "=".repeat(55);

  console.log("");
  console.log(bar);
  console.log("  DewBot Model Evaluation Report");
  console.log(bar);
  console.log("");
  console.log(`  Model:    ${MODEL_NAME}`);
  console.log(`  Endpoint: ${MODEL_URL}`);
  console.log(`  Test set: ${TEST_FILE}`);
  console.log("");
  console.log("  Inference Results");
  console.log("  -----------------");
  console.log(`  Total examples:       ${summary.totalExamples}`);
  console.log(`  Successful:           ${summary.successfulInferences}`);
  console.log(`  Failed (errors):      ${summary.failedInferences}`);
  console.log("");
  console.log("  Accuracy Metrics");
  console.log("  ----------------");
  console.log(
    `  Tool-call accuracy:   ${summary.toolCallAccuracy.toFixed(1)}%  (threshold: >85%)  [${pass(summary.passFailThresholds.toolAccuracy.pass)}]`,
  );
  console.log(
    `  Routing accuracy:     ${summary.routingAccuracy.toFixed(1)}%  (threshold: >90%)  [${pass(summary.passFailThresholds.routingAccuracy.pass)}]`,
  );
  console.log("");
  console.log("  Latency (ms)");
  console.log("  ------------");
  console.log(`  p50:   ${summary.latency.p50.toFixed(0)}ms`);
  console.log(
    `  p95:   ${summary.latency.p95.toFixed(0)}ms  (threshold: <500ms)  [${pass(summary.passFailThresholds.p95Latency.pass)}]`,
  );
  console.log(`  p99:   ${summary.latency.p99.toFixed(0)}ms`);
  console.log(`  mean:  ${summary.latency.mean.toFixed(0)}ms`);
  console.log(`  range: ${summary.latency.min.toFixed(0)}ms - ${summary.latency.max.toFixed(0)}ms`);
  console.log("");
  console.log(bar);
  console.log(`  Overall: ${summary.overallPass ? "PASS" : "FAIL"}`);
  console.log(bar);
  console.log("");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("===============================================");
  console.log("  DewBot Model Evaluation");
  console.log("===============================================");
  console.log("");
  console.log(`Model URL:   ${MODEL_URL}`);
  console.log(`Model name:  ${MODEL_NAME}`);
  console.log(`Test file:   ${TEST_FILE}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log("");

  // Step 1: Load test data
  console.log("[1/3] Loading test data...");
  let examples = loadTestData(TEST_FILE);
  console.log(`  Loaded ${examples.length} test examples`);

  if (MAX_EXAMPLES > 0 && examples.length > MAX_EXAMPLES) {
    examples = examples.slice(0, MAX_EXAMPLES);
    console.log(`  Capped to ${MAX_EXAMPLES} examples (--max-examples)`);
  }

  if (examples.length === 0) {
    console.error("No valid test examples found. Exiting.");
    process.exit(1);
  }

  // Step 2: Check model server connectivity
  console.log("");
  console.log("[2/3] Checking model server...");
  try {
    const healthRes = await fetch(`${MODEL_URL}/v1/models`);
    if (healthRes.ok) {
      const models = (await healthRes.json()) as { data?: Array<{ id: string }> };
      const availableModels = models.data?.map((m) => m.id) || [];
      console.log(
        `  Server OK. Available models: ${availableModels.join(", ") || "(none listed)"}`,
      );
    } else {
      console.log(`  Server returned ${healthRes.status}. Proceeding anyway...`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  Cannot connect to model server at ${MODEL_URL}`);
    console.error(`  Error: ${message}`);
    console.error("");
    console.error("  Make sure the model is running:");
    console.error("    python -m vllm.entrypoints.openai.api_server \\");
    console.error("      --model models/dew-unified-3b/final --port 8765");
    process.exit(1);
  }

  // Step 3: Run evaluation
  console.log("");
  console.log("[3/3] Running evaluation...");
  const startTime = performance.now();
  const results = await runEvaluation(examples);
  const totalTime = performance.now() - startTime;

  // Compute and print summary
  const summary = computeSummary(results);
  printReport(summary);

  console.log(`Total evaluation time: ${(totalTime / 1000).toFixed(1)}s`);

  // Write detailed results to file
  const resultsDir = path.dirname(TEST_FILE);
  const resultsPath = path.join(resultsDir, "eval-results.json");
  try {
    fs.writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          summary,
          config: {
            modelUrl: MODEL_URL,
            modelName: MODEL_NAME,
            testFile: TEST_FILE,
            concurrency: CONCURRENCY,
            totalTime: totalTime,
            timestamp: new Date().toISOString(),
          },
          results: results.map((r) => ({
            index: r.index,
            toolCallCorrect: r.toolCallCorrect,
            routingCorrect: r.routingCorrect,
            latencyMs: Math.round(r.latencyMs),
            expectedAction: r.expectedAction,
            predictedAction: r.predictedAction,
            expectedRouting: r.expectedRouting,
            predictedRouting: r.predictedRouting,
            error: r.error,
          })),
        },
        null,
        2,
      ),
    );
    console.log(`Detailed results written to: ${resultsPath}`);
  } catch {
    console.log("  Could not write results file (non-fatal).");
  }

  // Exit with non-zero code if evaluation failed thresholds
  if (!summary.overallPass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

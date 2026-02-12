/**
 * DewBot Workflow Engine
 *
 * Defines and executes multi-step automated workflows.
 * Workflows are triggered by cron, events, or webhooks and
 * consist of sequential steps with conditional branching.
 */

import { executeDewxTool } from "../ai/dewx-tool-adapter.js";

// ---- Types ----------------------------------------------------------------

export interface WorkflowStep {
  id: string;
  name: string;
  tool: string;
  params: Record<string, unknown>;
  condition?: {
    field: string;
    operator: "eq" | "ne" | "gt" | "lt" | "contains" | "exists";
    value: unknown;
  };
  onError?: "skip" | "abort" | "retry";
  retryCount?: number;
  retryDelayMs?: number;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  trigger: {
    type: "cron" | "event" | "manual";
    config?: Record<string, unknown>;
  };
  steps: WorkflowStep[];
  variables?: Record<string, unknown>;
}

export interface WorkflowExecution {
  workflowId: string;
  startedAt: number;
  completedAt?: number;
  status: "running" | "completed" | "failed" | "aborted";
  stepResults: Record<
    string,
    { success: boolean; data?: unknown; error?: string; durationMs: number }
  >;
  error?: string;
}

// ---- Variable interpolation -----------------------------------------------

/**
 * Replace `{{variable}}` patterns in string values with values from context.
 *
 * Supports:
 * - `{{variableName}}` - looks up in `context.variables`
 * - `{{steps.stepId.data.field}}` - looks up in previous step results
 *
 * Performs deep interpolation across nested objects and arrays.
 */
export function interpolateParams(
  params: Record<string, unknown>,
  context: { variables: Record<string, unknown>; stepResults: Record<string, any> },
): Record<string, unknown> {
  return deepInterpolate(params, context) as Record<string, unknown>;
}

function deepInterpolate(
  value: unknown,
  context: { variables: Record<string, unknown>; stepResults: Record<string, any> },
): unknown {
  if (typeof value === "string") {
    return interpolateString(value, context);
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepInterpolate(item, context));
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = deepInterpolate(v, context);
    }
    return result;
  }
  return value;
}

function interpolateString(
  str: string,
  context: { variables: Record<string, unknown>; stepResults: Record<string, any> },
): unknown {
  // If the entire string is a single placeholder, return the raw value
  // (preserves non-string types like numbers, objects, etc.)
  const fullMatch = /^\{\{(.+?)\}\}$/.exec(str);
  if (fullMatch) {
    const resolved = resolveReference(fullMatch[1].trim(), context);
    if (resolved !== undefined) {
      return resolved;
    }
  }

  // Otherwise replace all placeholders inline (always produces a string)
  return str.replace(/\{\{(.+?)\}\}/g, (_match, ref: string) => {
    const resolved = resolveReference(ref.trim(), context);
    if (resolved === undefined || resolved === null) {
      return "";
    }
    return typeof resolved === "object" ? JSON.stringify(resolved) : String(resolved);
  });
}

function resolveReference(
  ref: string,
  context: { variables: Record<string, unknown>; stepResults: Record<string, any> },
): unknown {
  // Step results: {{steps.stepId.data.field}}
  if (ref.startsWith("steps.")) {
    const path = ref.slice("steps.".length).split(".");
    let current: unknown = context.stepResults;
    for (const segment of path) {
      if (current === null || current === undefined || typeof current !== "object") {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }

  // Simple variable: {{variableName}} or {{some.nested.path}}
  const path = ref.split(".");
  let current: unknown = context.variables;
  for (const segment of path) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

// ---- Condition evaluation -------------------------------------------------

/**
 * Evaluate a step condition against a previous step's result.
 *
 * The `condition.field` is a dot-separated path into `previousResult`.
 * Supports operators: eq, ne, gt, lt, contains, exists.
 */
export function evaluateCondition(
  condition: WorkflowStep["condition"],
  previousResult: unknown,
): boolean {
  if (!condition) {
    return true;
  }

  const fieldValue = getNestedValue(previousResult, condition.field);

  switch (condition.operator) {
    case "eq":
      return fieldValue === condition.value;

    case "ne":
      return fieldValue !== condition.value;

    case "gt":
      return (
        typeof fieldValue === "number" &&
        typeof condition.value === "number" &&
        fieldValue > condition.value
      );

    case "lt":
      return (
        typeof fieldValue === "number" &&
        typeof condition.value === "number" &&
        fieldValue < condition.value
      );

    case "contains": {
      if (typeof fieldValue === "string" && typeof condition.value === "string") {
        return fieldValue.includes(condition.value);
      }
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(condition.value);
      }
      return false;
    }

    case "exists":
      return fieldValue !== undefined && fieldValue !== null;

    default:
      return false;
  }
}

function getNestedValue(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) {
    return undefined;
  }
  const segments = path.split(".");
  let current: unknown = obj;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

// ---- Step execution -------------------------------------------------------

async function executeStep(
  step: WorkflowStep,
  context: {
    orgId: string;
    userId?: string;
    variables: Record<string, unknown>;
    stepResults: Record<string, any>;
  },
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const interpolatedParams = interpolateParams(step.params, {
    variables: context.variables,
    stepResults: context.stepResults,
  });

  const router = (interpolatedParams.router as string) || step.tool;
  const action = (interpolatedParams.action as string) || "";
  const { router: _r, action: _a, ...restParams } = interpolatedParams;

  const result = await executeDewxTool(router, action, restParams, context.orgId, context.userId);

  return {
    success: result.success,
    data: result.data,
    error: result.error,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- Workflow execution ---------------------------------------------------

/**
 * Execute a workflow definition step by step.
 *
 * Steps run sequentially. Each step's condition is evaluated against the
 * previous step's result before execution. Retries and error handling are
 * configured per-step via `onError`, `retryCount`, and `retryDelayMs`.
 *
 * Variable interpolation is applied to step params before execution,
 * allowing steps to reference results from earlier steps.
 */
export async function executeWorkflow(
  workflow: WorkflowDefinition,
  context: { orgId: string; userId?: string; variables?: Record<string, unknown> },
): Promise<WorkflowExecution> {
  const execution: WorkflowExecution = {
    workflowId: workflow.id,
    startedAt: Date.now(),
    status: "running",
    stepResults: {},
  };

  const mergedVariables: Record<string, unknown> = {
    ...workflow.variables,
    ...context.variables,
  };

  const stepResults: Record<string, any> = {};
  let previousResult: unknown = null;

  for (const step of workflow.steps) {
    // Evaluate condition against the previous step's result
    if (step.condition && !evaluateCondition(step.condition, previousResult)) {
      execution.stepResults[step.id] = {
        success: true,
        data: { skipped: true, reason: "condition_not_met" },
        durationMs: 0,
      };
      continue;
    }

    const stepStart = Date.now();
    const maxAttempts = step.onError === "retry" ? (step.retryCount ?? 3) + 1 : 1;
    const retryDelay = step.retryDelayMs ?? 1_000;
    let lastError: string | undefined;
    let stepSuccess = false;
    let stepData: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await sleep(retryDelay * attempt);
      }

      try {
        const result = await executeStep(step, {
          orgId: context.orgId,
          userId: context.userId,
          variables: mergedVariables,
          stepResults,
        });

        if (result.success) {
          stepSuccess = true;
          stepData = result.data;
          break;
        }

        lastError = result.error || "Step returned unsuccessful result";
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    const stepDuration = Date.now() - stepStart;

    if (stepSuccess) {
      const stepResult = { success: true, data: stepData, durationMs: stepDuration };
      execution.stepResults[step.id] = stepResult;
      stepResults[step.id] = stepResult;
      previousResult = stepData;
    } else {
      const stepResult = {
        success: false,
        error: lastError,
        durationMs: stepDuration,
      };
      execution.stepResults[step.id] = stepResult;
      stepResults[step.id] = stepResult;
      previousResult = null;

      const errorPolicy = step.onError || "abort";

      if (errorPolicy === "abort") {
        execution.status = "aborted";
        execution.error = `Step "${step.name}" (${step.id}) failed: ${lastError}`;
        execution.completedAt = Date.now();
        return execution;
      }
      // "skip" continues to the next step
    }
  }

  execution.status = "completed";
  execution.completedAt = Date.now();
  return execution;
}

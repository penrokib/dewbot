/**
 * DewBot Gateway Error Recovery
 *
 * Provides resilient error handling with automatic recovery strategies:
 * - LLM timeout -> retry with faster model
 * - Tool call failure -> retry once, then report
 * - Channel disconnect -> auto-reconnect with backoff
 * - Local model down -> transparent cloud fallback
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecoveryStrategy {
  action: "retry" | "fallback" | "report" | "ignore";
  retryCount?: number;
  retryDelayMs?: number;
  fallbackModel?: string;
  fallbackTarget?: "cloud" | "local";
  message?: string;
}

export interface RecoveryContext {
  error: Error | string;
  errorType:
    | "llm_timeout"
    | "tool_failure"
    | "channel_disconnect"
    | "model_unavailable"
    | "rate_limited"
    | "unknown";
  orgId?: string;
  sessionKey?: string;
  attempt: number;
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/**
 * Classify an error into one of the known recovery categories.
 */
export function classifyError(error: Error | string): RecoveryContext["errorType"] {
  const msg = typeof error === "string" ? error : (error.message ?? "");
  const lower = msg.toLowerCase();

  // Timeout / abort errors
  if (
    lower.includes("timeout") ||
    lower.includes("abort") ||
    lower.includes("timed out") ||
    lower.includes("deadline exceeded")
  ) {
    return "llm_timeout";
  }

  // Connection-level errors -> model unavailable
  if (
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("econnreset") ||
    lower.includes("fetch failed")
  ) {
    return "model_unavailable";
  }

  // HTTP 429 rate limiting
  if (
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests")
  ) {
    return "rate_limited";
  }

  // Tool-specific errors
  if (lower.includes("tool") || lower.includes("function_call") || lower.includes("invoke")) {
    return "tool_failure";
  }

  // Channel / WebSocket errors
  if (
    lower.includes("channel") ||
    lower.includes("websocket") ||
    lower.includes("ws closed") ||
    lower.includes("disconnected")
  ) {
    return "channel_disconnect";
  }

  return "unknown";
}

// ---------------------------------------------------------------------------
// Recovery strategies
// ---------------------------------------------------------------------------

/**
 * Determine the appropriate recovery strategy for a given error context.
 */
export function getRecoveryStrategy(ctx: RecoveryContext): RecoveryStrategy {
  switch (ctx.errorType) {
    case "llm_timeout": {
      if (ctx.attempt <= 1) {
        return {
          action: "retry",
          retryCount: 1,
          retryDelayMs: 1000,
          fallbackModel: "claude-haiku",
          message: "The AI model timed out. Retrying with a faster model...",
        };
      }
      return {
        action: "report",
        message:
          "The AI model timed out after multiple attempts. Please try again with a shorter message or simpler request.",
      };
    }

    case "tool_failure": {
      if (ctx.attempt <= 1) {
        return {
          action: "retry",
          retryCount: 1,
          retryDelayMs: 500,
          message: "A tool call failed. Retrying...",
        };
      }
      return {
        action: "report",
        message:
          "The tool call failed after retrying. Try rephrasing your request or using a different approach.",
      };
    }

    case "channel_disconnect": {
      if (ctx.attempt <= 3) {
        const delayMs = 1000 * Math.pow(2, ctx.attempt - 1); // 1s, 2s, 4s
        return {
          action: "retry",
          retryCount: 1,
          retryDelayMs: delayMs,
          message: `Channel disconnected. Reconnecting in ${Math.round(delayMs / 1000)}s...`,
        };
      }
      return {
        action: "report",
        message:
          "Unable to reconnect to the channel after several attempts. Please check your connection and try reconnecting manually.",
      };
    }

    case "model_unavailable": {
      return {
        action: "fallback",
        fallbackModel: "claude-haiku",
        fallbackTarget: "cloud",
        message: "Local model is unavailable. Switching to cloud model...",
      };
    }

    case "rate_limited": {
      return {
        action: "report",
        message: "You have been rate limited. Please wait a moment before trying again.",
      };
    }

    case "unknown":
    default: {
      return {
        action: "report",
        message: "An unexpected error occurred. Please try again.",
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Execution wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap an async operation with automatic error classification and recovery.
 *
 * On failure the function classifies the error, selects a recovery strategy,
 * and retries with appropriate delays / fallbacks until `maxRetries` is
 * exhausted.
 */
export async function executeWithRecovery<T>(
  fn: () => Promise<T>,
  ctx: Partial<RecoveryContext>,
  maxRetries = 3,
): Promise<T> {
  let attempt = ctx.attempt ?? 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const errorType = ctx.errorType ?? classifyError(error);

      const recoveryCtx: RecoveryContext = {
        error,
        errorType,
        orgId: ctx.orgId,
        sessionKey: ctx.sessionKey,
        attempt,
      };

      const strategy = getRecoveryStrategy(recoveryCtx);

      if (strategy.action === "report" || strategy.action === "ignore" || attempt >= maxRetries) {
        // Attach recovery message to the error for upstream consumers
        const wrapped = new Error(strategy.message ?? error.message);
        (wrapped as unknown as { cause: unknown }).cause = error;
        (wrapped as unknown as { recoveryStrategy: RecoveryStrategy }).recoveryStrategy = strategy;
        throw wrapped;
      }

      // Wait before retrying
      if (strategy.retryDelayMs && strategy.retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, strategy.retryDelayMs));
      }

      attempt++;
    }
  }
}

// ---------------------------------------------------------------------------
// Message formatting
// ---------------------------------------------------------------------------

/**
 * Produce a human-readable message explaining what happened and what action
 * was taken.
 */
export function formatRecoveryMessage(ctx: RecoveryContext, strategy: RecoveryStrategy): string {
  const parts: string[] = [];

  switch (ctx.errorType) {
    case "llm_timeout":
      parts.push("The AI model timed out.");
      break;
    case "tool_failure":
      parts.push("A tool call failed.");
      break;
    case "channel_disconnect":
      parts.push("The channel connection was lost.");
      break;
    case "model_unavailable":
      parts.push("The local model is not reachable.");
      break;
    case "rate_limited":
      parts.push("Rate limit exceeded.");
      break;
    default:
      parts.push("An unexpected error occurred.");
  }

  switch (strategy.action) {
    case "retry":
      if (strategy.fallbackModel) {
        parts.push(`Retrying with ${strategy.fallbackModel}...`);
      } else if (strategy.retryDelayMs) {
        parts.push(`Retrying in ${Math.round(strategy.retryDelayMs / 1000)}s...`);
      } else {
        parts.push("Retrying...");
      }
      break;
    case "fallback":
      parts.push(
        `Falling back to ${strategy.fallbackTarget ?? "cloud"} (${strategy.fallbackModel ?? "default"}).`,
      );
      break;
    case "report":
      if (strategy.message) {
        parts.push(strategy.message);
      }
      break;
    case "ignore":
      parts.push("This error has been suppressed.");
      break;
  }

  return parts.join(" ");
}

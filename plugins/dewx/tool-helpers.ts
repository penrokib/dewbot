/**
 * Shared helpers for Dewx tools.
 */

import type { DewxApiClient } from "./dewx-client.js";

/** Shared tool context containing the Dewx API client */
export type DewxToolContext = {
  client: DewxApiClient;
};

/** Result type that tools return */
export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details: unknown;
};

/** Wrap any payload as a JSON tool result */
export function jsonResult(payload: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

/** Wrap an error as a tool result */
export function errorResult(message: string): ToolResult {
  return jsonResult({ error: message });
}

/** Read a required string param */
export function requireString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

/** Read an optional string param */
export function optionalString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

/** Read an optional number param */
export function optionalNumber(params: Record<string, unknown>, key: string): number | undefined {
  const value = params[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

/**
 * Dewx Tool Router Bridge
 *
 * Fetches tool definitions from Dewx AI service and converts them
 * to DewBot's AnyAgentTool format for use in the agent loop.
 *
 * This module handles:
 * - Fetching tool definitions from the Dewx internal API
 * - Caching definitions with a configurable TTL
 * - Converting Dewx tool definitions to pi-agent-core AgentTool format
 * - Executing tool actions via the Dewx internal API
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../agents/tools/common.js";
import { jsonResult } from "../agents/tools/common.js";

// ─── Types ────────────────────────────────────────────────────

interface DewxToolParameter {
  name: string;
  type: string;
  description: string;
  required?: boolean;
  enum?: string[];
}

interface DewxToolDefinition {
  name: string;
  description: string;
  category: string;
  parameters: DewxToolParameter[];
  requiresApproval: boolean;
}

interface DewxToolsResponse {
  count: number;
  tools: DewxToolDefinition[];
}

interface DewxExecuteResult {
  success: boolean;
  data?: unknown;
  error?: string;
  message?: string;
  errorType?: string;
}

// ─── Configuration ────────────────────────────────────────────

const DEWX_AI_URL = process.env.DEWBOT_DEWX_AI_URL || "http://localhost:4010";
const SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET || "";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ─── Cache ────────────────────────────────────────────────────

let cachedTools: DewxToolDefinition[] | null = null;
let cacheTimestamp = 0;

/**
 * Fetch tool definitions from the Dewx AI service.
 * Results are cached for CACHE_TTL milliseconds.
 */
export async function fetchDewxToolDefinitions(): Promise<DewxToolDefinition[]> {
  if (cachedTools && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedTools;
  }

  try {
    const response = await fetch(`${DEWX_AI_URL}/internal/tools/definitions`, {
      headers: SERVICE_SECRET ? { "x-service-secret": SERVICE_SECRET } : {},
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error(`[dewx-tool-adapter] Failed to fetch Dewx tools: ${response.status}`);
      return cachedTools || [];
    }

    const data = (await response.json()) as DewxToolsResponse;
    cachedTools = data.tools;
    cacheTimestamp = Date.now();
    return cachedTools;
  } catch (err) {
    console.error(`[dewx-tool-adapter] Failed to connect to Dewx AI service: ${err}`);
    return cachedTools || [];
  }
}

/**
 * Invalidate the cached tool definitions.
 * Useful when tools may have changed on the Dewx side.
 */
export function invalidateDewxToolCache(): void {
  cachedTools = null;
  cacheTimestamp = 0;
}

/**
 * Execute a tool action via the Dewx AI service internal API.
 */
export async function executeDewxTool(
  routerName: string,
  action: string,
  params: Record<string, unknown>,
  orgId: string,
  userId?: string,
  workspaceId?: string,
): Promise<DewxExecuteResult> {
  try {
    const response = await fetch(`${DEWX_AI_URL}/internal/tools/${routerName}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SERVICE_SECRET ? { "x-service-secret": SERVICE_SECRET } : {}),
      },
      body: JSON.stringify({
        orgId,
        userId,
        workspaceId,
        action,
        params,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Dewx API error: ${response.status} ${response.statusText}`,
      };
    }

    return (await response.json()) as DewxExecuteResult;
  } catch (err) {
    return {
      success: false,
      error: `Dewx connection error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── TypeBox schema helpers ───────────────────────────────────

function dewxParamToTypeBox(param: DewxToolParameter): ReturnType<typeof Type.String> {
  const desc = param.description || param.name;
  if (param.enum && param.enum.length > 0) {
    // Use Type.Union of Type.Literal for enums
    return Type.Union(
      param.enum.map((v) => Type.Literal(v)),
      { description: desc },
    ) as any;
  }
  switch (param.type) {
    case "number":
      return Type.Number({ description: desc }) as any;
    case "boolean":
      return Type.Boolean({ description: desc }) as any;
    case "array":
      return Type.Array(Type.String(), { description: desc }) as any;
    case "object":
      return Type.Record(Type.String(), Type.Unknown(), {
        description: desc,
      }) as any;
    default:
      return Type.String({ description: desc }) as any;
  }
}

/**
 * Build a TypeBox schema from Dewx tool parameters.
 */
function buildDewxToolSchema(params: DewxToolParameter[]) {
  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const p of params) {
    properties[p.name] = dewxParamToTypeBox(p);
    if (p.required) {
      required.push(p.name);
    }
  }

  return Type.Object(properties);
}

// ─── Tool creation ────────────────────────────────────────────

/**
 * Convert a single Dewx tool definition to a DewBot AgentTool.
 */
function createDewxAgentTool(
  def: DewxToolDefinition,
  orgId: string,
  userId?: string,
): AnyAgentTool {
  const schema = buildDewxToolSchema(def.parameters);

  return {
    label: `Dewx: ${def.name}`,
    name: `dewx_${def.name}`,
    description: `[Dewx ${def.category}] ${def.description}`,
    parameters: schema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = (params.action as string) || "";
      const { action: _, ...restParams } = params;

      if (!orgId) {
        return jsonResult({
          success: false,
          error: "No organization context. Dewx tools require an authenticated org.",
        });
      }

      const result = await executeDewxTool(def.name, action, restParams, orgId, userId);
      return jsonResult(result);
    },
  };
}

/**
 * Create DewBot AgentTool instances for all available Dewx tool routers.
 *
 * This is async because it fetches definitions from the Dewx AI service.
 * Results are cached, so subsequent calls within the TTL are fast.
 *
 * @param options.orgId - Organization ID for tool execution context
 * @param options.userId - Optional user ID for tool execution context
 * @param options.categories - Optional filter: only include tools from these categories
 * @returns Array of AnyAgentTool instances
 */
export async function createDewxRouterTools(options: {
  orgId?: string;
  userId?: string;
  categories?: string[];
}): Promise<AnyAgentTool[]> {
  const definitions = await fetchDewxToolDefinitions();

  if (definitions.length === 0) {
    return [];
  }

  let filtered = definitions;
  if (options.categories && options.categories.length > 0) {
    const cats = new Set(options.categories);
    filtered = definitions.filter((d) => cats.has(d.category));
  }

  return filtered.map((def) => createDewxAgentTool(def, options.orgId || "", options.userId));
}

/**
 * Create a single "bridge" tool that can route to any Dewx tool router.
 *
 * This is a synchronous alternative to createDewxRouterTools().
 * Instead of registering 250+ individual tools, it registers ONE tool
 * that accepts the router name as a parameter. This avoids the need
 * to fetch definitions upfront and works in synchronous contexts.
 *
 * Usage: The LLM calls `dewx_platform` with { router, action, params }.
 */
export function createDewxBridgeTool(options?: { orgId?: string; userId?: string }): AnyAgentTool {
  const schema = Type.Object({
    router: Type.String({
      description:
        "The Dewx tool router name (e.g., 'crm_contacts', 'finance_invoices', 'hr_employees'). Use dewx_platform with action 'list_tools' to discover available routers.",
    }),
    action: Type.String({
      description:
        "The action to perform on the router (e.g., 'list', 'create', 'update', 'delete').",
    }),
    params: Type.Optional(
      Type.Record(Type.String(), Type.Unknown(), {
        description: "Additional parameters for the action (varies by router and action).",
      }),
    ),
  });

  return {
    label: "Dewx Platform",
    name: "dewx_platform",
    description:
      "Execute actions on the Dewx platform (CRM, Finance, HR, Marketing, etc.). " +
      "Use router='_list' action='list_tools' to discover available tools. " +
      "Then call specific routers with their actions.",
    parameters: schema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const router = (params.router as string) || "";
      const action = (params.action as string) || "";
      const actionParams = (params.params as Record<string, unknown>) || {};
      const orgId = options?.orgId || "";

      // Special: list available tools
      if (router === "_list" || action === "list_tools") {
        try {
          const definitions = await fetchDewxToolDefinitions();
          return jsonResult({
            success: true,
            data: {
              count: definitions.length,
              tools: definitions.map((d) => ({
                name: d.name,
                category: d.category,
                description: d.description,
                actions: d.parameters.find((p) => p.name === "action")?.enum?.join(", "),
              })),
            },
          });
        } catch (err) {
          return jsonResult({
            success: false,
            error: `Failed to list tools: ${err}`,
          });
        }
      }

      if (!orgId) {
        return jsonResult({
          success: false,
          error: "No organization context. Dewx tools require an authenticated org.",
        });
      }

      if (!router || !action) {
        return jsonResult({
          success: false,
          error:
            "Both 'router' and 'action' are required. Use router='_list' to discover available tools.",
        });
      }

      const result = await executeDewxTool(router, action, actionParams, orgId, options?.userId);
      return jsonResult(result);
    },
  };
}

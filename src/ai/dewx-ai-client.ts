/**
 * Dew AI Client
 *
 * Routes AI requests to Dew AI service (port 4010) instead of
 * OpenClaw's built-in direct LLM calls. This is the bridge between
 * DewBot gateway and the Dewx AI brain.
 */

export interface DewxAiChatOptions {
  message: string;
  sessionKey: string;
  orgId: string;
  source?: string;
  model?: string;
  systemPrompt?: string;
}

export interface DewxAiResponse {
  content: string;
  toolCalls?: Array<{
    name: string;
    arguments: Record<string, unknown>;
    result?: unknown;
  }>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export class DewxAiClient {
  private readonly baseUrl: string;
  private readonly serviceSecret: string;

  constructor(baseUrl?: string, serviceSecret?: string) {
    this.baseUrl = baseUrl || process.env.DEWBOT_DEWX_AI_URL || "http://localhost:4010";
    this.serviceSecret = serviceSecret || process.env.INTERNAL_SERVICE_SECRET || "";
  }

  /**
   * Send a chat message through Dew AI and get a streaming response.
   */
  async chat(options: DewxAiChatOptions): Promise<ReadableStream<Uint8Array>> {
    const response = await fetch(`${this.baseUrl}/api/dew/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-organization-id": options.orgId,
        "x-service-secret": this.serviceSecret,
      },
      body: JSON.stringify({
        message: options.message,
        sessionKey: options.sessionKey,
        source: options.source || "dewbot-gateway",
        model: options.model,
        systemPrompt: options.systemPrompt,
      }),
    });

    if (!response.ok) {
      throw new Error(`Dew AI error: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("Dew AI returned no body");
    }

    return response.body;
  }

  /**
   * Send a chat message and wait for the complete response.
   */
  async chatSync(options: DewxAiChatOptions): Promise<DewxAiResponse> {
    const response = await fetch(`${this.baseUrl}/api/dew/chat/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-organization-id": options.orgId,
        "x-service-secret": this.serviceSecret,
      },
      body: JSON.stringify({
        message: options.message,
        sessionKey: options.sessionKey,
        source: options.source || "dewbot-gateway",
        model: options.model,
        systemPrompt: options.systemPrompt,
      }),
    });

    if (!response.ok) {
      throw new Error(`Dew AI error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<DewxAiResponse>;
  }

  /**
   * Health check for Dew AI service.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

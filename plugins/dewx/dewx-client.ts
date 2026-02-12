/**
 * DewxApiClient — HTTP client for calling Dewx platform services.
 * Used by all 32 business tools to interact with CRM, outreach, finance, HR, etc.
 */

export type DewxClientConfig = {
  baseUrl: string;
  orgId: string;
  jwt?: string;
};

export class DewxApiClient {
  private baseUrl: string;
  private orgId: string;
  private jwt: string;

  constructor(config: DewxClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.orgId = config.orgId;
    this.jwt = config.jwt ?? "";
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    // Always inject organizationId
    url.searchParams.set("organizationId", this.orgId);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-organization-id": this.orgId,
    };

    if (this.jwt) {
      headers["Authorization"] = `Bearer ${this.jwt}`;
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Dewx API ${method} ${path} failed (${response.status}): ${text}`);
    }

    return response.json() as Promise<T>;
  }

  async get<T = unknown>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>("GET", path, undefined, params);
  }

  async post<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async put<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  async patch<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  async delete<T = unknown>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>("DELETE", path, undefined, params);
  }
}

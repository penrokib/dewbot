/**
 * Per-Org Channel Credentials
 *
 * Loads channel credentials from the dewbot_channel_configs table
 * for multi-tenant channel isolation.
 */

export interface ChannelCredentials {
  organizationId: string;
  channel: string;
  credentials: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrgCredentialsProvider {
  getCredentials(orgId: string, channel: string): Promise<ChannelCredentials | null>;
  listCredentials(orgId: string): Promise<ChannelCredentials[]>;
}

/**
 * HTTP-based credentials provider that fetches from Dewx Platform API.
 */
export class DewxCredentialsProvider implements OrgCredentialsProvider {
  private readonly baseUrl: string;
  private readonly serviceSecret: string;
  private cache = new Map<string, { data: ChannelCredentials; expiresAt: number }>();
  private readonly cacheTtlMs: number;

  constructor(baseUrl?: string, serviceSecret?: string, cacheTtlMs = 5 * 60 * 1000) {
    this.baseUrl = baseUrl || process.env.DEWBOT_DEWX_PLATFORM_URL || "http://localhost:4000";
    this.serviceSecret = serviceSecret || process.env.INTERNAL_SERVICE_SECRET || "";
    this.cacheTtlMs = cacheTtlMs;
  }

  async getCredentials(orgId: string, channel: string): Promise<ChannelCredentials | null> {
    const cacheKey = `${orgId}:${channel}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/internal/dewbot/channel-config/${orgId}/${channel}`,
        {
          headers: {
            "x-service-secret": this.serviceSecret,
          },
          signal: AbortSignal.timeout(5000),
        },
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Failed to fetch credentials: ${response.status}`);
      }

      const result = (await response.json()) as { success: boolean; data: ChannelCredentials };
      if (!result.success || !result.data) {
        return null;
      }

      this.cache.set(cacheKey, {
        data: result.data,
        expiresAt: Date.now() + this.cacheTtlMs,
      });

      return result.data;
    } catch {
      return null;
    }
  }

  async listCredentials(orgId: string): Promise<ChannelCredentials[]> {
    try {
      const response = await fetch(`${this.baseUrl}/internal/dewbot/channel-configs/${orgId}`, {
        headers: {
          "x-service-secret": this.serviceSecret,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return [];
      }

      const result = (await response.json()) as { success: boolean; data: ChannelCredentials[] };
      return result.success ? result.data : [];
    } catch {
      return [];
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
}

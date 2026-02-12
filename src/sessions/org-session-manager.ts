/**
 * Org-Scoped Session Manager
 *
 * Manages sessions with organization isolation.
 * Each session key is scoped to an org, preventing cross-org access.
 */

export interface OrgSession {
  orgId: string;
  channel: string;
  key: string;
  userId?: string;
  createdAt: number;
  lastActiveAt: number;
  metadata: Record<string, unknown>;
}

export class OrgSessionManager {
  private sessions = new Map<string, OrgSession>();
  private readonly maxIdleMs: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(maxIdleMs = 24 * 60 * 60 * 1000) {
    this.maxIdleMs = maxIdleMs;
    this.cleanupTimer = setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }

  /**
   * Build an org-scoped session key.
   */
  static buildKey(orgId: string, channel: string, suffix?: string): string {
    const base = `org-${orgId}-${channel}`;
    return suffix ? `${base}-${suffix}` : base;
  }

  /**
   * Get or create a session for an org + channel combination.
   */
  getOrCreate(orgId: string, channel: string, userId?: string): OrgSession {
    const key = OrgSessionManager.buildKey(orgId, channel);
    let session = this.sessions.get(key);

    if (!session) {
      session = {
        orgId,
        channel,
        key,
        userId,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        metadata: {},
      };
      this.sessions.set(key, session);
    } else {
      session.lastActiveAt = Date.now();
      if (userId) {
        session.userId = userId;
      }
    }

    return session;
  }

  /**
   * Get a session by key, with org validation.
   */
  get(key: string, orgId: string): OrgSession | null {
    const session = this.sessions.get(key);
    if (!session || session.orgId !== orgId) {
      return null;
    }
    return session;
  }

  /**
   * List all sessions for an org.
   */
  listByOrg(orgId: string): OrgSession[] {
    return [...this.sessions.values()].filter((s) => s.orgId === orgId);
  }

  /**
   * Remove a session, with org validation.
   */
  remove(key: string, orgId: string): boolean {
    const session = this.sessions.get(key);
    if (!session || session.orgId !== orgId) {
      return false;
    }
    return this.sessions.delete(key);
  }

  /**
   * Remove all sessions for an org.
   */
  removeByOrg(orgId: string): number {
    let count = 0;
    for (const [key, session] of this.sessions) {
      if (session.orgId === orgId) {
        this.sessions.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clean up expired sessions.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, session] of this.sessions) {
      if (now - session.lastActiveAt > this.maxIdleMs) {
        this.sessions.delete(key);
      }
    }
  }

  /**
   * Get session count.
   */
  get size(): number {
    return this.sessions.size;
  }

  /**
   * Destroy the session manager.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.sessions.clear();
  }
}

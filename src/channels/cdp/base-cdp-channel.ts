/**
 * Base CDP Channel Adapter
 *
 * Provides browser automation via Playwright for messaging platforms
 * that don't have official APIs (Instagram, Twitter DMs, Messenger).
 *
 * Each channel extends this base and implements platform-specific
 * selectors and interaction patterns.
 */

import type { Browser, BrowserContext, Page } from "playwright-core";

export interface CdpChannelConfig {
  enabled: boolean;
  headless?: boolean;
  dataDir?: string;
  sessionCookies?: string;
  pollIntervalMs?: number;
}

export interface CdpMessage {
  id: string;
  senderId: string;
  senderName?: string;
  text: string;
  timestamp: number;
  isFromMe: boolean;
}

export interface CdpConversation {
  id: string;
  participantName: string;
  lastMessage?: string;
  lastMessageAt?: number;
  unreadCount?: number;
}

export type CdpChannelStatus = "disconnected" | "connecting" | "connected" | "error";

export abstract class BaseCdpChannel {
  readonly name: string;
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected status: CdpChannelStatus = "disconnected";
  protected error: string | null = null;
  protected config: CdpChannelConfig;
  protected pollTimer: ReturnType<typeof setInterval> | null = null;
  protected onMessage?: (msg: CdpMessage) => void;

  constructor(name: string, config: CdpChannelConfig) {
    this.name = name;
    this.config = config;
  }

  abstract get loginUrl(): string;
  abstract isLoggedIn(): Promise<boolean>;
  abstract sendMessage(to: string, text: string): Promise<boolean>;
  abstract getConversations(): Promise<CdpConversation[]>;
  abstract getMessages(conversationId: string, limit?: number): Promise<CdpMessage[]>;
  abstract pollForNewMessages(): Promise<CdpMessage[]>;

  async connect(launchBrowser: () => Promise<Browser>): Promise<void> {
    this.status = "connecting";
    try {
      this.browser = await launchBrowser();
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      });

      // Restore cookies if available
      if (this.config.sessionCookies) {
        try {
          const cookies = JSON.parse(this.config.sessionCookies);
          await this.context.addCookies(cookies);
        } catch {
          // Invalid cookies, will need fresh login
        }
      }

      this.page = await this.context.newPage();
      await this.page.goto(this.loginUrl, { waitUntil: "networkidle" });

      const loggedIn = await this.isLoggedIn();
      if (!loggedIn) {
        this.status = "error";
        this.error = "Not logged in — session cookies required";
        return;
      }

      this.status = "connected";
      this.error = null;

      // Start polling for new messages
      if (this.config.pollIntervalMs && this.config.pollIntervalMs > 0) {
        this.startPolling();
      }
    } catch (err) {
      this.status = "error";
      this.error = String(err);
    }
  }

  async disconnect(): Promise<void> {
    this.stopPolling();
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
    this.status = "disconnected";
  }

  getStatus(): { status: CdpChannelStatus; error: string | null } {
    return { status: this.status, error: this.error };
  }

  setOnMessage(handler: (msg: CdpMessage) => void): void {
    this.onMessage = handler;
  }

  protected startPolling(): void {
    const interval = this.config.pollIntervalMs || 10000;
    this.pollTimer = setInterval(async () => {
      try {
        const messages = await this.pollForNewMessages();
        for (const msg of messages) {
          this.onMessage?.(msg);
        }
      } catch {
        // Polling error, will retry next interval
      }
    }, interval);
  }

  protected stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Export current session cookies for persistence.
   */
  async exportCookies(): Promise<string> {
    if (!this.context) {
      return "[]";
    }
    const cookies = await this.context.cookies();
    return JSON.stringify(cookies);
  }
}

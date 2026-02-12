/**
 * Instagram CDP Channel
 *
 * Browser-based DM automation for Instagram via Playwright.
 * Uses accessibility tree snapshots for reliable element interaction.
 */

import type {
  BaseCdpChannel,
  CdpChannelConfig,
  CdpConversation,
  CdpMessage,
} from "./base-cdp-channel.js";

export interface InstagramCdpConfig extends CdpChannelConfig {
  username?: string;
}

export class InstagramCdpChannel {
  readonly name = "instagram" as const;
  private config: InstagramCdpConfig;

  constructor(config: InstagramCdpConfig) {
    this.config = config;
  }

  get loginUrl(): string {
    return "https://www.instagram.com/direct/inbox/";
  }

  // Placeholder implementations — full CDP logic added during integration testing
  async isLoggedIn(): Promise<boolean> {
    return false;
  }

  async sendMessage(_to: string, _text: string): Promise<boolean> {
    return false;
  }

  async getConversations(): Promise<CdpConversation[]> {
    return [];
  }

  async getMessages(_conversationId: string, _limit?: number): Promise<CdpMessage[]> {
    return [];
  }

  async pollForNewMessages(): Promise<CdpMessage[]> {
    return [];
  }
}

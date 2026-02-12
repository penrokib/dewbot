/**
 * Twitter/X CDP Channel
 *
 * Browser-based DM automation for Twitter/X via Playwright.
 */

import type { CdpChannelConfig, CdpConversation, CdpMessage } from "./base-cdp-channel.js";

export interface TwitterCdpConfig extends CdpChannelConfig {
  username?: string;
}

export class TwitterCdpChannel {
  readonly name = "twitter" as const;
  private config: TwitterCdpConfig;

  constructor(config: TwitterCdpConfig) {
    this.config = config;
  }

  get loginUrl(): string {
    return "https://x.com/messages";
  }

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

/**
 * Facebook Messenger CDP Channel
 *
 * Browser-based DM automation for Facebook Messenger via Playwright.
 */

import type { CdpChannelConfig, CdpConversation, CdpMessage } from "./base-cdp-channel.js";

export interface MessengerCdpConfig extends CdpChannelConfig {
  username?: string;
}

export class MessengerCdpChannel {
  readonly name = "messenger" as const;
  private config: MessengerCdpConfig;

  constructor(config: MessengerCdpConfig) {
    this.config = config;
  }

  get loginUrl(): string {
    return "https://www.messenger.com/";
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

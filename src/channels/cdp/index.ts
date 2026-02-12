/**
 * CDP Channel Adapters
 *
 * Browser-based messaging channel adapters using Playwright CDP.
 * These handle platforms without official APIs: Instagram, Twitter/X, Messenger.
 */

export { BaseCdpChannel } from "./base-cdp-channel.js";
export type {
  CdpChannelConfig,
  CdpConversation,
  CdpMessage,
  CdpChannelStatus,
} from "./base-cdp-channel.js";
export { InstagramCdpChannel } from "./instagram.js";
export type { InstagramCdpConfig } from "./instagram.js";
export { TwitterCdpChannel } from "./twitter.js";
export type { TwitterCdpConfig } from "./twitter.js";
export { MessengerCdpChannel } from "./messenger.js";
export type { MessengerCdpConfig } from "./messenger.js";

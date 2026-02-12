/**
 * Facebook Messenger CDP Channel
 *
 * Browser-based DM automation for Messenger.com via Playwright.
 * Messenger uses aria-labels extensively, making selector targeting
 * relatively reliable compared to other platforms.
 */

import {
  BaseCdpChannel,
  type CdpChannelConfig,
  type CdpConversation,
  type CdpMessage,
} from "./base-cdp-channel.js";

export interface MessengerCdpConfig extends CdpChannelConfig {
  username?: string;
}

export class MessengerCdpChannel extends BaseCdpChannel {
  private seenMessageIds = new Set<string>();
  private username: string | undefined;

  constructor(config: MessengerCdpConfig) {
    super("messenger", config);
    this.username = config.username;
  }

  get loginUrl(): string {
    return "https://www.messenger.com/";
  }

  /**
   * Check if the user is logged into Messenger by looking for chat list elements.
   * Messenger.com has relatively stable aria-labels for its main UI components.
   */
  async isLoggedIn(): Promise<boolean> {
    if (!this.page) {
      return false;
    }

    try {
      const indicator = await this.page
        .waitForSelector(
          [
            '[aria-label="Chats"]',
            '[aria-label="Chat list"]',
            '[aria-label="Conversations"]',
            '[role="navigation"] [aria-label="Messenger"]',
            'div[data-testid="mwthreadlist-item"]',
            'a[href*="/t/"]',
          ].join(", "),
          { timeout: 5000 },
        )
        .catch(() => null);

      const loggedIn = indicator !== null;
      console.log(`[cdp:messenger] isLoggedIn: ${loggedIn}`);
      return loggedIn;
    } catch (err) {
      console.log(`[cdp:messenger] isLoggedIn check failed: ${err}`);
      return false;
    }
  }

  /**
   * Send a message to a user on Messenger.
   *
   * Flow:
   * 1. Click compose/new message button
   * 2. Type recipient name in the "To:" field
   * 3. Select matching contact from search results
   * 4. Type the message
   * 5. Press Enter to send
   */
  async sendMessage(to: string, text: string): Promise<boolean> {
    if (!this.page) {
      return false;
    }

    try {
      console.log(`[cdp:messenger] sendMessage to="${to}" text="${text.slice(0, 50)}..."`);

      // Step 1: Ensure we're on Messenger
      const currentUrl = this.page.url();
      if (!currentUrl.includes("messenger.com")) {
        await this.page.goto("https://www.messenger.com/", { waitUntil: "networkidle" });
        await this.page.waitForTimeout(1000);
      }

      // Step 2: Click "New message" compose button
      const composeBtn = await this.page
        .waitForSelector(
          [
            '[aria-label="New message"]',
            '[aria-label="New Message"]',
            '[aria-label="Compose"]',
            '[data-testid="mw-new-message-button"]',
            'a[href="/new/"]',
            'div[role="button"][aria-label*="New"]',
          ].join(", "),
          { timeout: 5000 },
        )
        .catch(() => null);

      if (!composeBtn) {
        console.log("[cdp:messenger] sendMessage: compose button not found");
        return false;
      }

      await composeBtn.click();
      await this.page.waitForTimeout(800);

      // Step 3: Type recipient in the "To:" search field
      const toField = await this.page
        .waitForSelector(
          [
            'input[aria-label="To:"]',
            'input[aria-label="Search for people"]',
            'input[placeholder="Search for people"]',
            'input[placeholder="To:"]',
            '[data-testid="mw-recipient-input"] input',
            'input[type="text"]',
          ].join(", "),
          { timeout: 5000 },
        )
        .catch(() => null);

      if (!toField) {
        console.log("[cdp:messenger] sendMessage: To field not found");
        return false;
      }

      await toField.fill("");
      await toField.type(to, { delay: 80 });
      await this.page.waitForTimeout(1500);

      // Step 4: Click the matching contact from search results
      const contactResult = await this.page
        .waitForSelector(
          [
            `ul[role="listbox"] li:has-text("${to}")`,
            `div[role="listbox"] div[role="option"]:has-text("${to}")`,
            `[data-testid="mw-search-result"]:has-text("${to}")`,
            `div[aria-label*="suggested"] li:has-text("${to}")`,
            `ul li:has-text("${to}")`,
          ].join(", "),
          { timeout: 5000 },
        )
        .catch(() => null);

      if (!contactResult) {
        console.log(`[cdp:messenger] sendMessage: no contact result for "${to}"`);
        return false;
      }

      await contactResult.click();
      await this.page.waitForTimeout(1000);

      // Step 5: Type the message in the message input
      const messageInput = await this.page
        .waitForSelector(
          [
            '[aria-label="Message"]',
            '[aria-label="Type a message..."]',
            '[aria-label="Type a message"]',
            'div[role="textbox"][contenteditable="true"]',
            'p[data-text="true"]',
            '[data-testid="message-input"] div[contenteditable="true"]',
          ].join(", "),
          { timeout: 5000 },
        )
        .catch(() => null);

      if (!messageInput) {
        console.log("[cdp:messenger] sendMessage: message input not found");
        return false;
      }

      await messageInput.click();
      await this.page.waitForTimeout(200);
      await messageInput.type(text, { delay: 30 });
      await this.page.waitForTimeout(300);

      // Step 6: Press Enter to send
      await this.page.keyboard.press("Enter");
      await this.page.waitForTimeout(500);

      console.log(`[cdp:messenger] sendMessage: sent successfully to "${to}"`);
      return true;
    } catch (err) {
      console.log(`[cdp:messenger] sendMessage failed: ${err}`);
      return false;
    }
  }

  /**
   * Get the list of conversations from the Messenger sidebar.
   */
  async getConversations(): Promise<CdpConversation[]> {
    if (!this.page) {
      return [];
    }

    try {
      console.log("[cdp:messenger] getConversations");

      // Ensure we're on Messenger
      const currentUrl = this.page.url();
      if (!currentUrl.includes("messenger.com")) {
        await this.page.goto("https://www.messenger.com/", { waitUntil: "networkidle" });
        await this.page.waitForTimeout(1000);
      }

      // Wait for chat list to load
      await this.page
        .waitForSelector(
          '[aria-label="Chats"], [aria-label="Chat list"], [data-testid="mwthreadlist-item"], a[href*="/t/"]',
          { timeout: 5000 },
        )
        .catch(() => null);

      // Extract conversations from the sidebar
      const conversations = await this.page.evaluate(() => {
        const results: Array<{
          id: string;
          participantName: string;
          lastMessage: string;
          lastMessageAt: number;
          unreadCount: number;
        }> = [];

        // Messenger conversation items are typically links to /t/{threadId}
        const conversationElements = document.querySelectorAll(
          '[data-testid="mwthreadlist-item"], a[href*="/t/"]',
        );

        conversationElements.forEach((el, index) => {
          // Extract thread ID from the link
          const link = el.closest("a") || (el as HTMLAnchorElement);
          const href = link?.getAttribute?.("href") || "";
          const threadMatch = href.match(/\/t\/(\d+)/);
          const threadId = threadMatch ? threadMatch[1] : `msg-conv-${index}`;

          // Extract participant name and last message
          const spans = el.querySelectorAll("span");
          let participantName = "";
          let lastMessage = "";
          let lastMessageAt = 0;

          for (const span of spans) {
            const text = span.textContent?.trim() || "";
            if (!text || text.length > 200) {
              continue;
            }

            // Skip time indicators like "1h", "2d", "Just now"
            if (text.match(/^\d+[hmdw]$/) || text === "Just now" || text === "Active now") {
              // Parse relative time as approximate timestamp
              if (text.match(/^\d+[hmdw]$/)) {
                const num = parseInt(text);
                const unit = text.slice(-1);
                const multipliers: Record<string, number> = {
                  m: 60000,
                  h: 3600000,
                  d: 86400000,
                  w: 604800000,
                };
                lastMessageAt = Date.now() - num * (multipliers[unit] || 0);
              }
              continue;
            }

            if (!participantName && text.length > 0 && text.length < 60) {
              participantName = text;
            } else if (participantName && !lastMessage && text.length > 0) {
              lastMessage = text;
              break;
            }
          }

          // Check for unread indicators
          const hasUnreadBadge =
            el.querySelector('[aria-label*="unread"]') !== null ||
            el.querySelector('[data-testid*="badge"]') !== null;
          const hasBoldText =
            el.querySelector('span[style*="font-weight: bold"]') !== null ||
            el.querySelector('span[style*="font-weight: 700"]') !== null;
          const hasBlueDot =
            el.querySelector(
              'div[style*="background-color: rgb(0, 132, 255)"][style*="border-radius"]',
            ) !== null;
          const unreadCount = hasUnreadBadge || hasBoldText || hasBlueDot ? 1 : 0;

          if (participantName) {
            results.push({
              id: threadId,
              participantName,
              lastMessage,
              lastMessageAt,
              unreadCount,
            });
          }
        });

        return results;
      });

      console.log(`[cdp:messenger] getConversations: found ${conversations.length}`);

      return conversations.map((c) => ({
        id: c.id,
        participantName: c.participantName,
        lastMessage: c.lastMessage || undefined,
        lastMessageAt: c.lastMessageAt || undefined,
        unreadCount: c.unreadCount,
      }));
    } catch (err) {
      console.log(`[cdp:messenger] getConversations failed: ${err}`);
      return [];
    }
  }

  /**
   * Get messages from a specific Messenger conversation.
   *
   * @param conversationId - The thread ID from the Messenger URL
   * @param limit - Maximum number of messages to return (default 20)
   */
  async getMessages(conversationId: string, limit: number = 20): Promise<CdpMessage[]> {
    if (!this.page) {
      return [];
    }

    try {
      console.log(`[cdp:messenger] getMessages: conversationId="${conversationId}" limit=${limit}`);

      // Navigate to the conversation
      if (conversationId.match(/^\d+$/)) {
        const currentUrl = this.page.url();
        if (!currentUrl.includes(`/t/${conversationId}`)) {
          await this.page.goto(`https://www.messenger.com/t/${conversationId}`, {
            waitUntil: "networkidle",
          });
          await this.page.waitForTimeout(1000);
        }
      } else {
        // Try clicking the conversation in the sidebar
        const convItem = await this.page
          .waitForSelector(
            [
              `a[href*="/t/${conversationId}"]`,
              `[data-testid="mwthreadlist-item"]:has-text("${conversationId}")`,
            ].join(", "),
            { timeout: 3000 },
          )
          .catch(() => null);

        if (convItem) {
          await convItem.click();
          await this.page.waitForTimeout(1000);
        }
      }

      // Wait for messages to load
      await this.page
        .waitForSelector(
          'div[role="row"], div[class*="message"], [data-testid*="message"], div[dir="auto"]',
          { timeout: 5000 },
        )
        .catch(() => null);

      // Extract messages
      const rawMessages = await this.page.evaluate((loggedInUsername: string | undefined) => {
        const results: Array<{
          text: string;
          senderName: string;
          isFromMe: boolean;
          timestamp: number;
        }> = [];

        // Messenger renders messages in rows. Each message group typically has a
        // sender avatar and a cluster of message bubbles.
        const messageRows = document.querySelectorAll(
          'div[role="row"], [data-testid*="message-container"], div[class*="__msg"]',
        );

        if (messageRows.length === 0) {
          // Fallback: try to get all text bubbles directly
          const bubbles = document.querySelectorAll(
            'div[dir="auto"][class*="message"], div[data-text="true"]',
          );
          bubbles.forEach((bubble) => {
            const text = bubble.textContent?.trim() || "";
            if (text) {
              results.push({
                text,
                senderName: "Unknown",
                isFromMe: false,
                timestamp: Date.now(),
              });
            }
          });
          return results;
        }

        messageRows.forEach((row) => {
          // Extract message text
          const textEls = row.querySelectorAll('div[dir="auto"], span[dir="auto"]');
          let text = "";
          for (const el of textEls) {
            const t = el.textContent?.trim() || "";
            if (t.length > 0) {
              text = t;
              break;
            }
          }
          if (!text) {
            return;
          }

          // Determine if this message is from the logged-in user
          // Messenger aligns sent messages to the right and colors them blue
          const isFromMe = (() => {
            // Check for Messenger's blue bubble (sent messages)
            const blueBg = row.querySelector(
              'div[style*="background-color: rgb(0, 132, 255)"], div[style*="background-color:#0084ff"]',
            );
            if (blueBg) {
              return true;
            }

            // Check alignment
            const container = row.closest('[class*="__row"]') || row.parentElement;
            if (container) {
              const style = window.getComputedStyle(container);
              if (style.justifyContent === "flex-end" || style.alignItems === "flex-end") {
                return true;
              }
            }

            // Check for "You sent" aria labels
            const ariaLabel = row.getAttribute("aria-label") || "";
            if (
              ariaLabel.toLowerCase().includes("you sent") ||
              ariaLabel.toLowerCase().includes("you:")
            ) {
              return true;
            }

            return false;
          })();

          // Try to get timestamp
          const timeEl = row.querySelector(
            'time, [data-testid="timestamp"], [aria-label*="ago"], [aria-label*="AM"], [aria-label*="PM"]',
          );
          const timestamp = timeEl?.dateTime ? new Date(timeEl.dateTime).getTime() : Date.now();

          // Extract sender name
          const senderEl = row.querySelector(
            '[data-testid="message-sender"], span[class*="author"], h4 span',
          );
          const senderName =
            senderEl?.textContent?.trim() || (isFromMe ? loggedInUsername || "Me" : "Them");

          results.push({
            text,
            senderName,
            isFromMe,
            timestamp,
          });
        });

        return results;
      }, this.username);

      // Map to CdpMessage format
      const messages: CdpMessage[] = rawMessages.slice(-limit).map((m, idx) => {
        const hash = this.hashString(`${m.text}-${m.timestamp}-${idx}`);
        const id = `msg-${m.timestamp}-${hash}`;

        return {
          id,
          senderId: m.isFromMe ? "me" : conversationId,
          senderName: m.senderName,
          text: m.text,
          timestamp: m.timestamp,
          isFromMe: m.isFromMe,
        };
      });

      console.log(`[cdp:messenger] getMessages: found ${messages.length}`);
      return messages;
    } catch (err) {
      console.log(`[cdp:messenger] getMessages failed: ${err}`);
      return [];
    }
  }

  /**
   * Poll for new messages across all Messenger conversations.
   * Checks for unread indicators and extracts new messages.
   */
  async pollForNewMessages(): Promise<CdpMessage[]> {
    if (!this.page) {
      return [];
    }

    try {
      // Ensure we're on Messenger
      const currentUrl = this.page.url();
      if (!currentUrl.includes("messenger.com")) {
        await this.page.goto("https://www.messenger.com/", { waitUntil: "networkidle" });
        await this.page.waitForTimeout(1000);
      }

      // Find conversations with unread indicators
      const unreadConvIds = await this.page.evaluate(() => {
        const ids: string[] = [];

        const conversations = document.querySelectorAll(
          '[data-testid="mwthreadlist-item"], a[href*="/t/"]',
        );

        conversations.forEach((el) => {
          // Check for unread indicators
          const hasUnreadBadge = el.querySelector('[aria-label*="unread"]') !== null;
          const hasBadgeDot = el.querySelector('[data-testid*="badge"]') !== null;
          const hasBoldText =
            el.querySelector('span[style*="font-weight: bold"]') !== null ||
            el.querySelector('span[style*="font-weight: 700"]') !== null;
          const hasBlueDot =
            el.querySelector(
              'div[style*="background-color: rgb(0, 132, 255)"][style*="border-radius"]',
            ) !== null;

          if (hasUnreadBadge || hasBadgeDot || hasBoldText || hasBlueDot) {
            const link = el.closest("a") || (el as HTMLAnchorElement);
            const href = link?.getAttribute?.("href") || "";
            const match = href.match(/\/t\/(\d+)/);
            if (match) {
              ids.push(match[1]);
            }
          }
        });

        return ids;
      });

      if (unreadConvIds.length === 0) {
        return [];
      }

      console.log(
        `[cdp:messenger] pollForNewMessages: ${unreadConvIds.length} unread conversations`,
      );

      const newMessages: CdpMessage[] = [];

      for (const convId of unreadConvIds) {
        const messages = await this.getMessages(convId, 10);

        for (const msg of messages) {
          if (!msg.isFromMe && !this.seenMessageIds.has(msg.id)) {
            this.seenMessageIds.add(msg.id);
            newMessages.push(msg);
          }
        }

        // Navigate back to main chat list for next conversation
        if (unreadConvIds.indexOf(convId) < unreadConvIds.length - 1) {
          await this.page.goto("https://www.messenger.com/", { waitUntil: "networkidle" });
          await this.page.waitForTimeout(500);
        }
      }

      // Prune seenMessageIds to prevent unbounded growth (keep last 5000)
      if (this.seenMessageIds.size > 5000) {
        const entries = Array.from(this.seenMessageIds);
        const toRemove = entries.slice(0, entries.length - 5000);
        for (const id of toRemove) {
          this.seenMessageIds.delete(id);
        }
      }

      console.log(`[cdp:messenger] pollForNewMessages: ${newMessages.length} new messages`);
      return newMessages;
    } catch (err) {
      console.log(`[cdp:messenger] pollForNewMessages failed: ${err}`);
      return [];
    }
  }

  /**
   * Simple string hash for generating deduplication IDs.
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash).toString(36);
  }
}

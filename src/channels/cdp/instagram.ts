/**
 * Instagram CDP Channel
 *
 * Browser-based DM automation for Instagram via Playwright.
 * Implements real selectors for Instagram's Direct Inbox UI.
 *
 * Instagram frequently changes its DOM structure, so selectors use
 * multiple fallback patterns (aria-labels, roles, data attributes).
 */

import {
  BaseCdpChannel,
  type CdpChannelConfig,
  type CdpConversation,
  type CdpMessage,
} from "./base-cdp-channel.js";

export interface InstagramCdpConfig extends CdpChannelConfig {
  username?: string;
}

export class InstagramCdpChannel extends BaseCdpChannel {
  private seenMessageIds = new Set<string>();
  private username: string | undefined;

  constructor(config: InstagramCdpConfig) {
    super("instagram", config);
    this.username = config.username;
  }

  get loginUrl(): string {
    return "https://www.instagram.com/direct/inbox/";
  }

  /**
   * Check if the user is logged into Instagram by looking for inbox indicators.
   * Instagram renders different elements depending on version, so we check multiple selectors.
   */
  async isLoggedIn(): Promise<boolean> {
    if (!this.page) {
      return false;
    }

    try {
      const indicator = await this.page
        .waitForSelector(
          [
            '[aria-label="Inbox"]',
            '[aria-label="Direct messaging"]',
            'a[href="/direct/inbox/"]',
            '[aria-label="New message"]',
            'div[role="main"] div[role="list"]',
          ].join(", "),
          { timeout: 5000 },
        )
        .catch(() => null);

      const loggedIn = indicator !== null;
      console.log(`[cdp:instagram] isLoggedIn: ${loggedIn}`);
      return loggedIn;
    } catch (err) {
      console.log(`[cdp:instagram] isLoggedIn check failed: ${err}`);
      return false;
    }
  }

  /**
   * Send a DM to a user on Instagram.
   *
   * Flow:
   * 1. Click compose/new message button
   * 2. Search for recipient by name
   * 3. Select the matching result
   * 4. Confirm selection (Chat/Next)
   * 5. Type and send the message
   */
  async sendMessage(to: string, text: string): Promise<boolean> {
    if (!this.page) {
      return false;
    }

    try {
      console.log(`[cdp:instagram] sendMessage to="${to}" text="${text.slice(0, 50)}..."`);

      // Step 1: Navigate to inbox if not already there
      const currentUrl = this.page.url();
      if (!currentUrl.includes("/direct/")) {
        await this.page.goto("https://www.instagram.com/direct/inbox/", {
          waitUntil: "networkidle",
        });
        await this.page.waitForTimeout(1000);
      }

      // Step 2: Click "New message" compose button
      const composeBtn = await this.page
        .waitForSelector(
          [
            '[aria-label="New message"]',
            '[aria-label="New Message"]',
            '[aria-label="Compose"]',
            'svg[aria-label="New message"]',
            'div[role="button"]:has(svg[aria-label="New message"])',
          ].join(", "),
          { timeout: 5000 },
        )
        .catch(() => null);

      if (!composeBtn) {
        console.log("[cdp:instagram] sendMessage: compose button not found");
        return false;
      }

      await composeBtn.click();
      await this.page.waitForTimeout(800);

      // Step 3: Type recipient name in the search field
      const searchInput = await this.page
        .waitForSelector(
          [
            'input[name="queryBox"]',
            'input[placeholder="Search..."]',
            'input[aria-label="Search"]',
            'input[aria-label="Search input"]',
            'input[type="text"]',
          ].join(", "),
          { timeout: 5000 },
        )
        .catch(() => null);

      if (!searchInput) {
        console.log("[cdp:instagram] sendMessage: search input not found");
        return false;
      }

      await searchInput.fill("");
      await searchInput.type(to, { delay: 80 });
      await this.page.waitForTimeout(1500);

      // Step 4: Click the matching search result
      const searchResult = await this.page
        .waitForSelector(
          [
            `div[role="dialog"] button:has-text("${to}")`,
            `div[role="dialog"] div[role="listbox"] div:has-text("${to}")`,
            `div[role="dialog"] label:has-text("${to}")`,
            `div[role="dialog"] span:has-text("${to}")`,
          ].join(", "),
          { timeout: 5000 },
        )
        .catch(() => null);

      if (!searchResult) {
        console.log(`[cdp:instagram] sendMessage: no search result found for "${to}"`);
        return false;
      }

      await searchResult.click();
      await this.page.waitForTimeout(500);

      // Step 5: Click "Chat" or "Next" button to open conversation
      const confirmBtn = await this.page
        .waitForSelector(
          [
            'div[role="dialog"] button:has-text("Chat")',
            'div[role="dialog"] button:has-text("Next")',
            'div[role="dialog"] div[role="button"]:has-text("Chat")',
            'div[role="dialog"] div[role="button"]:has-text("Next")',
          ].join(", "),
          { timeout: 3000 },
        )
        .catch(() => null);

      if (confirmBtn) {
        await confirmBtn.click();
        await this.page.waitForTimeout(1000);
      }

      // Step 6: Type the message
      const messageInput = await this.page
        .waitForSelector(
          [
            '[aria-label="Message"]',
            '[aria-label="Message..."]',
            'textarea[placeholder="Message..."]',
            'div[role="textbox"][contenteditable="true"]',
            'div[aria-label="Message"][contenteditable="true"]',
          ].join(", "),
          { timeout: 5000 },
        )
        .catch(() => null);

      if (!messageInput) {
        console.log("[cdp:instagram] sendMessage: message input not found");
        return false;
      }

      await messageInput.click();
      await this.page.waitForTimeout(200);
      await messageInput.type(text, { delay: 30 });
      await this.page.waitForTimeout(300);

      // Step 7: Press Enter to send
      await this.page.keyboard.press("Enter");
      await this.page.waitForTimeout(500);

      console.log(`[cdp:instagram] sendMessage: sent successfully to "${to}"`);
      return true;
    } catch (err) {
      console.log(`[cdp:instagram] sendMessage failed: ${err}`);
      return false;
    }
  }

  /**
   * Get the list of conversations from the Instagram DM sidebar.
   */
  async getConversations(): Promise<CdpConversation[]> {
    if (!this.page) {
      return [];
    }

    try {
      console.log("[cdp:instagram] getConversations");

      // Ensure we're on the inbox page
      const currentUrl = this.page.url();
      if (!currentUrl.includes("/direct/inbox")) {
        await this.page.goto("https://www.instagram.com/direct/inbox/", {
          waitUntil: "networkidle",
        });
        await this.page.waitForTimeout(1000);
      }

      // Wait for conversation list to render
      await this.page
        .waitForSelector('div[role="list"], div[role="listbox"], [aria-label="Direct messaging"]', {
          timeout: 5000,
        })
        .catch(() => null);

      // Extract conversations from the sidebar using page.evaluate
      const conversations = await this.page.evaluate(() => {
        const results: Array<{
          id: string;
          participantName: string;
          lastMessage: string;
          unreadCount: number;
        }> = [];

        // Instagram renders conversation items as list items or clickable divs
        // Try multiple selector strategies
        const conversationElements =
          document.querySelectorAll('div[role="listitem"]').length > 0
            ? document.querySelectorAll('div[role="listitem"]')
            : document.querySelectorAll('div[role="list"] > div, a[href*="/direct/t/"]');

        conversationElements.forEach((el, index) => {
          // Extract the conversation link to get the thread ID
          const link = el.querySelector('a[href*="/direct/t/"]');
          const threadMatch = link?.href?.match(/\/direct\/t\/(\d+)/);
          const threadId = threadMatch ? threadMatch[1] : `conv-${index}`;

          // Get participant name - usually the first prominent text
          const spans = el.querySelectorAll("span");
          let participantName = "";
          let lastMessage = "";

          // The first visible, non-empty span with meaningful text is usually the name
          for (const span of spans) {
            const text = span.textContent?.trim() || "";
            if (!text || text.length > 100) {
              continue;
            }

            if (!participantName && text.length > 0 && text.length < 50) {
              participantName = text;
            } else if (participantName && !lastMessage && text.length > 0) {
              lastMessage = text;
              break;
            }
          }

          // Check for unread indicator (blue dot or bold text)
          const hasBoldText = el.querySelector('span[style*="font-weight: 600"]') !== null;
          const hasBlueDot =
            el.querySelector('div[style*="background-color: rgb(0, 149, 246)"]') !== null;
          const unreadCount = hasBoldText || hasBlueDot ? 1 : 0;

          if (participantName) {
            results.push({
              id: threadId,
              participantName,
              lastMessage,
              unreadCount,
            });
          }
        });

        return results;
      });

      console.log(`[cdp:instagram] getConversations: found ${conversations.length}`);

      return conversations.map((c) => ({
        id: c.id,
        participantName: c.participantName,
        lastMessage: c.lastMessage || undefined,
        lastMessageAt: undefined,
        unreadCount: c.unreadCount,
      }));
    } catch (err) {
      console.log(`[cdp:instagram] getConversations failed: ${err}`);
      return [];
    }
  }

  /**
   * Get messages from a specific conversation.
   *
   * @param conversationId - The thread ID or conversation identifier
   * @param limit - Maximum number of messages to return (default 20)
   */
  async getMessages(conversationId: string, limit: number = 20): Promise<CdpMessage[]> {
    if (!this.page) {
      return [];
    }

    try {
      console.log(`[cdp:instagram] getMessages: conversationId="${conversationId}" limit=${limit}`);

      // Navigate to the conversation if we have a thread ID
      if (conversationId.match(/^\d+$/)) {
        const currentUrl = this.page.url();
        if (!currentUrl.includes(`/direct/t/${conversationId}`)) {
          await this.page.goto(`https://www.instagram.com/direct/t/${conversationId}/`, {
            waitUntil: "networkidle",
          });
          await this.page.waitForTimeout(1000);
        }
      } else {
        // Try clicking the conversation in the sidebar
        const convItem = await this.page
          .waitForSelector(
            [
              `a[href*="/direct/t/${conversationId}"]`,
              `div[role="listitem"]:has-text("${conversationId}")`,
              `div[role="list"] div:has-text("${conversationId}")`,
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
        .waitForSelector('div[role="row"], div[role="listitem"], div[class*="message"]', {
          timeout: 5000,
        })
        .catch(() => null);

      // Extract messages using page.evaluate
      const rawMessages = await this.page.evaluate((loggedInUsername: string | undefined) => {
        const results: Array<{
          text: string;
          senderName: string;
          isFromMe: boolean;
          timestamp: number;
        }> = [];

        // Instagram message rows are typically div[role="row"] elements
        const messageElements =
          document.querySelectorAll('div[role="row"]').length > 0
            ? document.querySelectorAll('div[role="row"]')
            : document.querySelectorAll(
                'div[role="listitem"], div[data-testid="message-container"]',
              );

        messageElements.forEach((el) => {
          const textEl = el.querySelector("span, div[dir]");
          const text = textEl?.textContent?.trim() || "";
          if (!text) {
            return;
          }

          // Determine if the message is from the logged-in user
          // Instagram typically aligns sent messages to the right
          const computedStyle = window.getComputedStyle(el);
          const parentStyle = el.parentElement ? window.getComputedStyle(el.parentElement) : null;

          const isFromMe =
            computedStyle.justifyContent === "flex-end" ||
            parentStyle?.justifyContent === "flex-end" ||
            parentStyle?.alignItems === "flex-end" ||
            el.querySelector('div[style*="align-self: flex-end"]') !== null;

          // Try to find a timestamp element
          const timeEl = el.querySelector("time, [datetime]");
          const timestamp = timeEl?.dateTime ? new Date(timeEl.dateTime).getTime() : Date.now();

          // Try to extract sender name from screen reader text or group chat label
          const senderLabel = el.querySelector('[aria-label*="said"], [aria-label*="sent"]');
          const senderName = senderLabel
            ? senderLabel.getAttribute("aria-label")?.split(/\s+(said|sent)/)?.[0] || ""
            : isFromMe
              ? loggedInUsername || "Me"
              : "Them";

          results.push({
            text,
            senderName,
            isFromMe,
            timestamp,
          });
        });

        return results;
      }, this.username);

      // Map to CdpMessage format with deduplication IDs
      const messages: CdpMessage[] = rawMessages.slice(-limit).map((m, idx) => {
        const hash = this.hashString(`${m.text}-${m.timestamp}-${idx}`);
        const id = `ig-${m.timestamp}-${hash}`;

        return {
          id,
          senderId: m.isFromMe ? "me" : conversationId,
          senderName: m.senderName,
          text: m.text,
          timestamp: m.timestamp,
          isFromMe: m.isFromMe,
        };
      });

      console.log(`[cdp:instagram] getMessages: found ${messages.length}`);
      return messages;
    } catch (err) {
      console.log(`[cdp:instagram] getMessages failed: ${err}`);
      return [];
    }
  }

  /**
   * Poll for new messages across all conversations.
   * Checks for unread indicators and extracts new messages.
   */
  async pollForNewMessages(): Promise<CdpMessage[]> {
    if (!this.page) {
      return [];
    }

    try {
      // Ensure we're on the inbox page
      const currentUrl = this.page.url();
      if (!currentUrl.includes("/direct/")) {
        await this.page.goto("https://www.instagram.com/direct/inbox/", {
          waitUntil: "networkidle",
        });
        await this.page.waitForTimeout(1000);
      }

      // Find conversations with unread indicators
      const unreadConvIds = await this.page.evaluate(() => {
        const ids: string[] = [];
        const conversations = document.querySelectorAll(
          'div[role="listitem"], a[href*="/direct/t/"]',
        );

        conversations.forEach((el) => {
          // Check for unread indicators: bold text, blue dot, notification badge
          const hasBold = el.querySelector(
            'span[style*="font-weight: 600"], span[style*="font-weight: 700"]',
          );
          const hasBlueDot = el.querySelector('div[style*="background-color: rgb(0, 149, 246)"]');
          const hasBadge = el.querySelector('[aria-label*="unread"], [data-testid*="unread"]');

          if (hasBold || hasBlueDot || hasBadge) {
            const link = el.querySelector('a[href*="/direct/t/"]');
            const match = link?.href?.match(/\/direct\/t\/(\d+)/);
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
        `[cdp:instagram] pollForNewMessages: ${unreadConvIds.length} unread conversations`,
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

        // Navigate back to inbox for next conversation
        if (unreadConvIds.indexOf(convId) < unreadConvIds.length - 1) {
          await this.page.goto("https://www.instagram.com/direct/inbox/", {
            waitUntil: "networkidle",
          });
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

      console.log(`[cdp:instagram] pollForNewMessages: ${newMessages.length} new messages`);
      return newMessages;
    } catch (err) {
      console.log(`[cdp:instagram] pollForNewMessages failed: ${err}`);
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

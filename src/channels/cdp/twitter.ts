/**
 * Twitter/X CDP Channel
 *
 * Browser-based DM automation for Twitter/X via Playwright.
 * Uses data-testid attributes where available, which are more stable
 * than class names on X.com.
 */

import {
  BaseCdpChannel,
  type CdpChannelConfig,
  type CdpConversation,
  type CdpMessage,
} from "./base-cdp-channel.js";

export interface TwitterCdpConfig extends CdpChannelConfig {
  username?: string;
}

export class TwitterCdpChannel extends BaseCdpChannel {
  private seenMessageIds = new Set<string>();
  private username: string | undefined;

  constructor(config: TwitterCdpConfig) {
    super("twitter", config);
    this.username = config.username;
  }

  get loginUrl(): string {
    return "https://x.com/messages";
  }

  /**
   * Check if the user is logged into X.com by looking for DM inbox elements.
   * X.com uses data-testid attributes extensively which are relatively stable.
   */
  async isLoggedIn(): Promise<boolean> {
    if (!this.page) {
      return false;
    }

    try {
      const indicator = await this.page
        .waitForSelector(
          [
            '[data-testid="DmScrollerContainer"]',
            '[data-testid="DMDrawer"]',
            '[data-testid="DmActivityContainer"]',
            '[aria-label="Direct Messages"]',
            'a[href="/messages"]',
            '[data-testid="AppTabBar_DirectMessage_Link"]',
          ].join(", "),
          { timeout: 5000 },
        )
        .catch(() => null);

      const loggedIn = indicator !== null;
      console.log(`[cdp:twitter] isLoggedIn: ${loggedIn}`);
      return loggedIn;
    } catch (err) {
      console.log(`[cdp:twitter] isLoggedIn check failed: ${err}`);
      return false;
    }
  }

  /**
   * Send a DM to a user on X.com.
   *
   * Flow:
   * 1. Click "New message" button
   * 2. Search for recipient
   * 3. Select matching result
   * 4. Click Next
   * 5. Type message and send
   */
  async sendMessage(to: string, text: string): Promise<boolean> {
    if (!this.page) {
      return false;
    }

    try {
      console.log(`[cdp:twitter] sendMessage to="${to}" text="${text.slice(0, 50)}..."`);

      // Step 1: Navigate to messages if not already there
      const currentUrl = this.page.url();
      if (!currentUrl.includes("/messages")) {
        await this.page.goto("https://x.com/messages", { waitUntil: "networkidle" });
        await this.page.waitForTimeout(1000);
      }

      // Step 2: Click "New message" button
      const newDmBtn = await this.page
        .waitForSelector(
          [
            '[data-testid="NewDM_Button"]',
            '[aria-label="New message"]',
            '[aria-label="New Message"]',
            '[data-testid="DM_new-conversation-button"]',
          ].join(", "),
          { timeout: 5000 },
        )
        .catch(() => null);

      if (!newDmBtn) {
        console.log("[cdp:twitter] sendMessage: new DM button not found");
        return false;
      }

      await newDmBtn.click();
      await this.page.waitForTimeout(800);

      // Step 3: Type recipient in the people search field
      const searchInput = await this.page
        .waitForSelector(
          [
            '[data-testid="searchPeople"]',
            'input[aria-label="Search people"]',
            'input[placeholder="Search people"]',
            'input[type="text"]',
          ].join(", "),
          { timeout: 5000 },
        )
        .catch(() => null);

      if (!searchInput) {
        console.log("[cdp:twitter] sendMessage: search input not found");
        return false;
      }

      await searchInput.fill("");
      await searchInput.type(to, { delay: 80 });
      await this.page.waitForTimeout(1500);

      // Step 4: Click the matching search result
      const searchResult = await this.page
        .waitForSelector(
          [
            `[data-testid="TypeaheadUser"]:has-text("${to}")`,
            `div[role="option"]:has-text("${to}")`,
            `li[role="listitem"]:has-text("${to}")`,
            `[data-testid="typeaheadResult"]:has-text("${to}")`,
          ].join(", "),
          { timeout: 5000 },
        )
        .catch(() => null);

      if (!searchResult) {
        console.log(`[cdp:twitter] sendMessage: no search result for "${to}"`);
        return false;
      }

      await searchResult.click();
      await this.page.waitForTimeout(500);

      // Step 5: Click "Next" button to open conversation
      const nextBtn = await this.page
        .waitForSelector(
          [
            '[data-testid="nextButton"]',
            'button:has-text("Next")',
            '[role="button"]:has-text("Next")',
          ].join(", "),
          { timeout: 3000 },
        )
        .catch(() => null);

      if (nextBtn) {
        await nextBtn.click();
        await this.page.waitForTimeout(1000);
      }

      // Step 6: Type the message in the composer
      const messageInput = await this.page
        .waitForSelector(
          [
            '[data-testid="dmComposerTextInput"]',
            '[aria-label="Start a new message"]',
            'div[role="textbox"][contenteditable="true"]',
            '[data-testid="DmActivityComposer"] div[contenteditable="true"]',
          ].join(", "),
          { timeout: 5000 },
        )
        .catch(() => null);

      if (!messageInput) {
        console.log("[cdp:twitter] sendMessage: message input not found");
        return false;
      }

      await messageInput.click();
      await this.page.waitForTimeout(200);
      await messageInput.type(text, { delay: 30 });
      await this.page.waitForTimeout(300);

      // Step 7: Click the send button
      const sendBtn = await this.page
        .waitForSelector(
          [
            '[data-testid="dmComposerSendButton"]',
            '[aria-label="Send"]',
            'button[type="submit"]:has(svg)',
          ].join(", "),
          { timeout: 3000 },
        )
        .catch(() => null);

      if (sendBtn) {
        await sendBtn.click();
      } else {
        // Fallback: press Enter
        await this.page.keyboard.press("Enter");
      }

      await this.page.waitForTimeout(500);

      console.log(`[cdp:twitter] sendMessage: sent successfully to "${to}"`);
      return true;
    } catch (err) {
      console.log(`[cdp:twitter] sendMessage failed: ${err}`);
      return false;
    }
  }

  /**
   * Get the list of DM conversations from the X.com sidebar.
   */
  async getConversations(): Promise<CdpConversation[]> {
    if (!this.page) {
      return [];
    }

    try {
      console.log("[cdp:twitter] getConversations");

      // Ensure we're on the messages page
      const currentUrl = this.page.url();
      if (!currentUrl.includes("/messages")) {
        await this.page.goto("https://x.com/messages", { waitUntil: "networkidle" });
        await this.page.waitForTimeout(1000);
      }

      // Wait for conversation list to load
      await this.page
        .waitForSelector(
          '[data-testid="DmScrollerContainer"], [data-testid="DMDrawer"], [aria-label="Direct Messages"]',
          { timeout: 5000 },
        )
        .catch(() => null);

      // Extract conversations from the DM sidebar
      const conversations = await this.page.evaluate(() => {
        const results: Array<{
          id: string;
          participantName: string;
          lastMessage: string;
          unreadCount: number;
        }> = [];

        // X.com renders DM conversations as list items within the scroller
        const conversationElements = document.querySelectorAll(
          '[data-testid="conversation"], [data-testid="DmScrollerContainer"] > div > div, a[href*="/messages/"]',
        );

        conversationElements.forEach((el, index) => {
          // Extract conversation ID from the link
          const link = el.closest("a") || el.querySelector("a");
          const href = link?.getAttribute("href") || "";
          const convMatch = href.match(/\/messages\/(\d+[-\d]*)/);
          const convId = convMatch ? convMatch[1] : `tw-conv-${index}`;

          // Extract participant name and last message
          const textElements = el.querySelectorAll("span");
          let participantName = "";
          let lastMessage = "";

          for (const span of textElements) {
            const text = span.textContent?.trim() || "";
            if (!text) {
              continue;
            }

            // Skip timestamps and indicators
            if (text.match(/^\d+[hms]$/) || text === "." || text.length > 200) {
              continue;
            }

            if (!participantName && text.length > 0 && text.length < 60) {
              participantName = text;
            } else if (participantName && !lastMessage && text.length > 0) {
              lastMessage = text;
              break;
            }
          }

          // Check for unread badge
          const hasBadge =
            el.querySelector('[aria-label*="unread"]') !== null ||
            el.querySelector('[data-testid*="unread"]') !== null;
          const hasBoldText = el.querySelector('span[style*="font-weight: 700"]') !== null;
          const unreadCount = hasBadge || hasBoldText ? 1 : 0;

          if (participantName) {
            results.push({
              id: convId,
              participantName,
              lastMessage,
              unreadCount,
            });
          }
        });

        return results;
      });

      console.log(`[cdp:twitter] getConversations: found ${conversations.length}`);

      return conversations.map((c) => ({
        id: c.id,
        participantName: c.participantName,
        lastMessage: c.lastMessage || undefined,
        lastMessageAt: undefined,
        unreadCount: c.unreadCount,
      }));
    } catch (err) {
      console.log(`[cdp:twitter] getConversations failed: ${err}`);
      return [];
    }
  }

  /**
   * Get messages from a specific DM conversation.
   *
   * @param conversationId - The conversation ID from X.com URL
   * @param limit - Maximum number of messages to return (default 20)
   */
  async getMessages(conversationId: string, limit: number = 20): Promise<CdpMessage[]> {
    if (!this.page) {
      return [];
    }

    try {
      console.log(`[cdp:twitter] getMessages: conversationId="${conversationId}" limit=${limit}`);

      // Navigate to the conversation
      const currentUrl = this.page.url();
      if (!currentUrl.includes(`/messages/${conversationId}`)) {
        await this.page.goto(`https://x.com/messages/${conversationId}`, {
          waitUntil: "networkidle",
        });
        await this.page.waitForTimeout(1000);
      }

      // Wait for messages to load
      await this.page
        .waitForSelector(
          '[data-testid="messageEntry"], [data-testid="tweetText"], div[data-testid*="message"]',
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

        // X.com DM messages use data-testid="messageEntry" or similar
        const messageElements =
          document.querySelectorAll('[data-testid="messageEntry"]').length > 0
            ? document.querySelectorAll('[data-testid="messageEntry"]')
            : document.querySelectorAll(
                '[data-testid="DmScrollerContainer"] div[role="row"], [data-testid="cellInnerDiv"]',
              );

        messageElements.forEach((el) => {
          // Extract text content
          const textEl = el.querySelector('[data-testid="tweetText"], span[dir], div[dir="auto"]');
          const text = textEl?.textContent?.trim() || "";
          if (!text) {
            return;
          }

          // Determine if from the logged-in user
          // X.com typically uses different background colors for sent vs received
          const isFromMe = (() => {
            // Sent messages often have a blue/themed background
            const bgEl = el.querySelector(
              'div[style*="background-color: rgb(29, 155, 240)"], div[style*="background-color: rgb(29,155,240)"]',
            );
            if (bgEl) {
              return true;
            }

            // Check alignment (sent messages align right)
            const parent = el.closest('[data-testid="cellInnerDiv"]') || el.parentElement;
            if (parent) {
              const style = window.getComputedStyle(parent);
              if (style.justifyContent === "flex-end") {
                return true;
              }
            }

            // Check for the logged-in user's avatar on the message side
            const avatarLink = el.querySelector(`a[href*="/${loggedInUsername}"]`);
            if (avatarLink) {
              return true;
            }

            return false;
          })();

          // Try to extract timestamp
          const timeEl = el.querySelector("time");
          const timestamp = timeEl?.dateTime ? new Date(timeEl.dateTime).getTime() : Date.now();

          // Extract sender name
          const senderEl = el.querySelector('[data-testid="User-Name"] span, a[role="link"] span');
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
        const id = `tw-${m.timestamp}-${hash}`;

        return {
          id,
          senderId: m.isFromMe ? "me" : conversationId,
          senderName: m.senderName,
          text: m.text,
          timestamp: m.timestamp,
          isFromMe: m.isFromMe,
        };
      });

      console.log(`[cdp:twitter] getMessages: found ${messages.length}`);
      return messages;
    } catch (err) {
      console.log(`[cdp:twitter] getMessages failed: ${err}`);
      return [];
    }
  }

  /**
   * Poll for new messages across all DM conversations.
   * Checks for unread badges and extracts new messages.
   */
  async pollForNewMessages(): Promise<CdpMessage[]> {
    if (!this.page) {
      return [];
    }

    try {
      // Ensure we're on the messages page
      const currentUrl = this.page.url();
      if (!currentUrl.includes("/messages")) {
        await this.page.goto("https://x.com/messages", { waitUntil: "networkidle" });
        await this.page.waitForTimeout(1000);
      }

      // Find conversations with unread indicators
      const unreadConvIds = await this.page.evaluate(() => {
        const ids: string[] = [];

        const conversations = document.querySelectorAll(
          '[data-testid="conversation"], a[href*="/messages/"]',
        );

        conversations.forEach((el) => {
          // Check for unread indicators
          const hasBadge =
            el.querySelector('[aria-label*="unread"]') !== null ||
            el.querySelector('[data-testid*="unread"]') !== null;
          const hasBoldText = el.querySelector('span[style*="font-weight: 700"]') !== null;
          const hasBlueDot =
            el.querySelector(
              'div[style*="background-color: rgb(29, 155, 240)"][style*="border-radius: 50%"]',
            ) !== null;

          if (hasBadge || hasBoldText || hasBlueDot) {
            const link = el.closest("a") || el.querySelector("a");
            const href = link?.getAttribute("href") || "";
            const match = href.match(/\/messages\/(\d+[-\d]*)/);
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

      console.log(`[cdp:twitter] pollForNewMessages: ${unreadConvIds.length} unread conversations`);

      const newMessages: CdpMessage[] = [];

      for (const convId of unreadConvIds) {
        const messages = await this.getMessages(convId, 10);

        for (const msg of messages) {
          if (!msg.isFromMe && !this.seenMessageIds.has(msg.id)) {
            this.seenMessageIds.add(msg.id);
            newMessages.push(msg);
          }
        }

        // Navigate back to messages list for the next conversation
        if (unreadConvIds.indexOf(convId) < unreadConvIds.length - 1) {
          await this.page.goto("https://x.com/messages", { waitUntil: "networkidle" });
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

      console.log(`[cdp:twitter] pollForNewMessages: ${newMessages.length} new messages`);
      return newMessages;
    } catch (err) {
      console.log(`[cdp:twitter] pollForNewMessages failed: ${err}`);
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

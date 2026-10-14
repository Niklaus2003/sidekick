/**
 * Sidekick - Grounded Page Chat Controller (Slice 6 & Slice 7)
 * Implements streaming chat anchored strictly in the current page context,
 * rich markdown rendering with code block copy buttons, and
 * right-click context menu action handlers (Explain, Translate, Draft Reply).
 */

import { streamAiContent } from "../../ai/ai_router.js";
import {
  buildChatPrompt,
  buildExplainPrompt,
  buildTranslatePrompt,
  buildDraftReplyPrompt
} from "../../ai/prompt_templates.js";

export class ChatViewController {
  constructor() {
    this.elements = {
      chatMessages: document.getElementById("chat-messages"),
      chatInput: document.getElementById("chat-input"),
      chatForm: document.getElementById("chat-form"),
      btnSend: document.getElementById("btn-chat-send"),
      promptChips: document.querySelectorAll(".prompt-chip"),
      engineStatus: document.getElementById("badge-engine-status"),
      tabUrlDisplay: document.getElementById("tab-url-display"),
      tabBtnChat: document.getElementById("tab-btn-chat")
    };

    this.isStreaming = false;
    this.activeTabId = null;
    this.activeTabTitle = "";
    this.activeTabUrl = "";
    this.cachedPageText = "";
    this.cachedPageTabId = null;
  }

  /**
   * Initialize chat events, listeners, and check for pending context actions
   */
  async init() {
    if (!this.elements.chatForm || !this.elements.chatInput) return;

    this.setupInputHandlers();
    this.setupPromptChips();
    this.setupTabListeners();
    this.listenToRuntimeMessages();

    // Check for pending context actions (Slice 7)
    await this.checkPendingContextAction();
  }

  /**
   * Setup textarea input auto-resize and submit listeners
   */
  setupInputHandlers() {
    const input = this.elements.chatInput;
    const form = this.elements.chatForm;

    // Auto-resize textarea
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
    });

    // Enter to send (Shift+Enter for multiline)
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        form.dispatchEvent(new Event("submit"));
      }
    });

    // Form submit
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const query = input.value.trim();
      if (!query || this.isStreaming) return;

      input.value = "";
      input.style.height = "auto";

      await this.handleUserQuery(query);
    });
  }

  /**
   * Bind quick prompt chips in welcome bubble
   */
  setupPromptChips() {
    this.elements.promptChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const promptText = chip.getAttribute("data-prompt");
        if (promptText && !this.isStreaming) {
          this.handleUserQuery(promptText);
        }
      });
    });
  }

  /**
   * Track tab changes to invalidate page cache
   */
  setupTabListeners() {
    if (chrome.tabs && chrome.tabs.onActivated) {
      chrome.tabs.onActivated.addListener(() => {
        this.invalidatePageCache();
      });
    }

    if (chrome.tabs && chrome.tabs.onUpdated) {
      chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.status === "complete" || changeInfo.url) {
          this.invalidatePageCache();
        }
      });
    }
  }

  invalidatePageCache() {
    this.cachedPageText = "";
    this.cachedPageTabId = null;
  }

  /**
   * Listen for runtime messages dispatched from background (e.g. Slice 7 context menus)
   */
  listenToRuntimeMessages() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.type === "EXECUTE_CONTEXT_ACTION" && message.payload) {
        this.handleContextAction(message.payload);
      }
    });
  }

  /**
   * Check if a context menu action was stored while side panel was opening
   */
  async checkPendingContextAction() {
    const storageKey = "sidekick_pending_context_action";
    let pending = null;

    try {
      if (chrome.storage && chrome.storage.session) {
        const sess = await chrome.storage.session.get(storageKey);
        if (sess && sess[storageKey]) {
          pending = sess[storageKey];
          await chrome.storage.session.remove(storageKey);
        }
      }
    } catch {
      // Session storage fallback
    }

    if (!pending) {
      try {
        const local = await chrome.storage.local.get(storageKey);
        if (local && local[storageKey]) {
          pending = local[storageKey];
          await chrome.storage.local.remove(storageKey);
        }
      } catch {
        // Storage get fallback
      }
    }

    if (pending && pending.text && Date.now() - (pending.timestamp || 0) < 60000) {
      // Ensure chat tab is active
      this.elements.tabBtnChat?.click();
      await this.handleContextAction(pending);
    }
  }

  /**
   * Handle incoming Context Menu action (Slice 7)
   * @param {{ action: string, text: string, tabId?: number, pageTitle?: string, pageUrl?: string }} payload
   */
  async handleContextAction(payload) {
    if (this.isStreaming) return;

    // Switch to Chat tab in UI
    this.elements.tabBtnChat?.click();

    const { action, text } = payload;
    if (!text) return;

    let userLabel = "";
    let prompt = "";
    let actionBadge = "";

    switch (action) {
      case "explain":
        userLabel = `📖 Explain in plain English: "${text.length > 80 ? text.slice(0, 80) + '...' : text}"`;
        prompt = buildExplainPrompt({ selectedText: text });
        actionBadge = "Explain";
        break;

      case "translate":
        userLabel = `🌐 Translate to English: "${text.length > 80 ? text.slice(0, 80) + '...' : text}"`;
        prompt = buildTranslatePrompt(text);
        actionBadge = "Translate";
        break;

      case "reply":
        userLabel = `✉️ Draft professional reply to: "${text.length > 80 ? text.slice(0, 80) + '...' : text}"`;
        prompt = buildDraftReplyPrompt({ selectedText: text });
        actionBadge = "Draft Reply";
        break;

      default:
        userLabel = text;
        prompt = buildChatPrompt({ userQuery: text });
        actionBadge = "Quick Action";
        break;
    }

    this.appendUserBubble(userLabel, actionBadge);

    await this.executeStream(prompt, actionBadge);
  }

  /**
   * Handle user query entered in chat form (Slice 6)
   * Anchors answer in active webpage content with strict grounding
   * @param {string} userQuery
   */
  async handleUserQuery(userQuery) {
    if (this.isStreaming || !userQuery.trim()) return;

    this.appendUserBubble(userQuery);

    this.updateEngineBadge("Grounding page...", "busy");

    // 1. Check if user provided an explicit URL in their message (Slice 6 enhancement)
    const pastedUrl = this.extractUrlFromQuery(userQuery);
    let pageData = null;

    if (pastedUrl) {
      pageData = await this.fetchUrlContent(pastedUrl);
    }

    // Fall back to active tab content if no URL pasted or fetch returned empty
    if (!pageData || !pageData.textContent) {
      pageData = await this.getActiveTabContent();
    }

    // 2. Build grounded chat prompt
    const prompt = buildChatPrompt({
      pageTitle: pageData?.title || this.activeTabTitle || "Current Webpage",
      pageUrl: pageData?.url || this.activeTabUrl || "",
      pageContent: pageData?.textContent || "",
      userQuery
    });

    // 3. Stream AI answer
    const modeBadge = pastedUrl ? (pageData?.isYouTube ? "YouTube Link" : "Web Link") : "Grounded Chat";
    await this.executeStream(prompt, modeBadge);
  }

  /**
   * Extract first HTTP/HTTPS URL from user query
   * @param {string} query
   * @returns {string | null}
   */
  extractUrlFromQuery(query) {
    if (!query) return null;
    const match = query.match(/https?:\/\/[^\s"'<>]+/i);
    return match ? match[0] : null;
  }

  /**
   * Fetch and parse content directly from a pasted URL
   * Uses cross-origin permissions granted by host_permissions in Manifest V3
   * @param {string} url
   * @returns {Promise<{ title: string, textContent: string, url: string, isYouTube?: boolean } | null>}
   */
  async fetchUrlContent(url) {
    try {
      this.updateEngineBadge("Reading link...", "busy");

      const isYt = url.includes("youtube.com") || url.includes("youtu.be");
      if (isYt) {
        // Fetch YouTube metadata via oEmbed
        const oembedUrl = `https://noembed.com/embed?url=${encodeURIComponent(url)}`;
        const resp = await fetch(oembedUrl);
        if (resp.ok) {
          const ytInfo = await resp.json();
          return {
            title: ytInfo.title || "YouTube Video",
            textContent: `YOUTUBE VIDEO:\nTitle: ${ytInfo.title || "Unknown"}\nChannel: ${ytInfo.author_name || ""}\nURL: ${url}`,
            url,
            isYouTube: true
          };
        }
      }

      // Fetch webpage HTML
      const resp = await fetch(url);
      if (!resp.ok) return null;

      const html = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // Strip boilerplate tags
      doc.querySelectorAll("script, style, noscript, svg, nav, footer, header").forEach((el) => el.remove());
      const title = doc.querySelector("title")?.innerText?.trim() || "Webpage";
      const cleanText = (doc.body?.innerText || doc.body?.textContent || "")
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .slice(0, 15000)
        .trim();

      return {
        title,
        textContent: cleanText,
        url,
        isYouTube: false
      };
    } catch (err) {
      console.warn("[Sidekick Chat] Error fetching direct URL:", err);
      return null;
    }
  }

  /**
   * Execute streaming request to AI Provider Router with live markdown rendering
   * @param {string} prompt
   * @param {string} modeLabel
   */
  async executeStream(prompt, modeLabel = "Sidekick") {
    this.isStreaming = true;
    const { bubbleEl, contentEl } = this.createAiBubble(modeLabel);

    const cursor = document.createElement("span");
    cursor.className = "typing-cursor";
    contentEl.appendChild(cursor);
    this.scrollToBottom();

    let accumulatedText = "";

    try {
      this.updateEngineBadge("Thinking...", "busy");

      const result = await streamAiContent({
        prompt,
        onChunk: (chunkText) => {
          accumulatedText = chunkText;
          contentEl.innerHTML = this.renderMarkdown(chunkText, true);
          contentEl.appendChild(cursor);
          this.scrollToBottom();
        },
        onProviderChange: (provider) => {
          this.updateEngineBadge(`${provider === "groq" ? "Groq" : "Gemini"}: Thinking...`, "busy");
        }
      });

      cursor.remove();
      contentEl.innerHTML = this.renderMarkdown(accumulatedText, false);
      this.updateEngineBadge(`Ready (${result.provider === "groq" ? "Groq" : "Gemini"})`, "ready");

      // Bind code block copy buttons inside rendered markdown
      this.bindCodeBlockCopyButtons(contentEl);
      this.addBubbleCopyButton(bubbleEl, accumulatedText);

    } catch (err) {
      cursor.remove();
      this.updateEngineBadge("Error", "error");

      contentEl.innerHTML = `
        <div class="chat-error-message">
          <strong>Error:</strong> ${this.escapeHtml(err.message || "Failed to generate answer.")}
        </div>
      `;
    } finally {
      this.isStreaming = false;
      this.scrollToBottom();
    }
  }

  /**
   * Retrieve readable article content from active browser tab for grounding
   * @returns {Promise<{ title: string, textContent: string, url: string }>}
   */
  async getActiveTabContent() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        return { title: "", textContent: "", url: "" };
      }

      this.activeTabId = tab.id;
      this.activeTabTitle = tab.title || "";
      this.activeTabUrl = tab.url || "";

      // Check cache
      if (this.cachedPageTabId === tab.id && this.cachedPageText) {
        return {
          title: tab.title || "",
          textContent: this.cachedPageText,
          url: tab.url || ""
        };
      }

      // Check restricted URLs
      if (!tab.url || /^(chrome|chrome-extension|devtools|about|data):/.test(tab.url)) {
        return { title: tab.title || "Restricted Page", textContent: "", url: tab.url || "" };
      }

      // Query content script for readable text
      let articleData = null;
      try {
        const response = await this.sendMessagePromise(tab.id, { type: "EXTRACT_ARTICLE" });
        if (response && response.success && response.data) {
          articleData = response.data;
        }
      } catch {
        // Content script not yet injected
      }

      if (!articleData) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["src/content/readability.js", "src/content/content_script.js"]
          });
          await new Promise((r) => setTimeout(r, 100));

          const res = await this.sendMessagePromise(tab.id, { type: "EXTRACT_ARTICLE" });
          if (res && res.success && res.data) {
            articleData = res.data;
          }
        } catch {
          // Injection failure
        }
      }

      const text = articleData?.textContent || "";
      this.cachedPageText = text;
      this.cachedPageTabId = tab.id;

      return {
        title: articleData?.title || tab.title || "",
        textContent: text,
        url: tab.url || ""
      };
    } catch (e) {
      console.warn("[Sidekick Chat] Error getting active tab content:", e);
      return { title: "", textContent: "", url: "" };
    }
  }

  sendMessagePromise(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Append a user chat bubble to the thread
   * @param {string} text
   * @param {string} [badgeText]
   */
  appendUserBubble(text, badgeText = "") {
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble user-bubble";

    if (badgeText) {
      const badge = document.createElement("span");
      badge.className = "chat-action-badge";
      badge.textContent = badgeText;
      bubble.appendChild(badge);
    }

    const textSpan = document.createElement("div");
    textSpan.className = "user-bubble-text";
    textSpan.textContent = text;
    bubble.appendChild(textSpan);

    this.elements.chatMessages.appendChild(bubble);
    this.scrollToBottom();
  }

  /**
   * Create an AI response bubble with header and content container
   * @param {string} modeLabel
   * @returns {{ bubbleEl: HTMLElement, contentEl: HTMLElement }}
   */
  createAiBubble(modeLabel = "Sidekick") {
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble ai-bubble";

    const header = document.createElement("div");
    header.className = "bubble-header";
    header.innerHTML = `
      <span class="badge badge-ai">Sidekick</span>
      <span class="bubble-mode-tag">${this.escapeHtml(modeLabel)}</span>
    `;

    const content = document.createElement("div");
    content.className = "bubble-content";

    bubble.appendChild(header);
    bubble.appendChild(content);
    this.elements.chatMessages.appendChild(bubble);

    return { bubbleEl: bubble, contentEl: content };
  }

  /**
   * Attach Copy Message button to completed AI bubble
   * @param {HTMLElement} bubbleEl
   * @param {string} text
   */
  addBubbleCopyButton(bubbleEl, text) {
    if (!bubbleEl || !text) return;

    let actions = bubbleEl.querySelector(".bubble-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "bubble-actions";
      bubbleEl.appendChild(actions);
    }

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn-bubble-copy";
    copyBtn.title = "Copy response to clipboard";
    copyBtn.innerHTML = `📋 Copy`;

    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.innerHTML = `✓ Copied!`;
        copyBtn.classList.add("copied");
        setTimeout(() => {
          copyBtn.innerHTML = `📋 Copy`;
          copyBtn.classList.remove("copied");
        }, 2000);
      } catch (err) {
        console.warn("[Sidekick Chat] Clipboard write error:", err);
      }
    });

    actions.appendChild(copyBtn);
  }

  /**
   * Bind event listeners to Copy Code buttons inside rendered markdown blocks
   * @param {HTMLElement} container
   */
  bindCodeBlockCopyButtons(container) {
    if (!container) return;
    const copyBtns = container.querySelectorAll(".btn-copy-code");

    copyBtns.forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const codeText = btn.getAttribute("data-code") || "";
        if (!codeText) return;

        try {
          await navigator.clipboard.writeText(codeText);
          const originalText = btn.textContent;
          btn.textContent = "✓ Copied!";
          btn.classList.add("copied");
          setTimeout(() => {
            btn.textContent = originalText;
            btn.classList.remove("copied");
          }, 2000);
        } catch (err) {
          console.warn("[Sidekick Chat] Copy code failed:", err);
        }
      });
    });
  }

  /**
   * Markdown rendering with support for code blocks, language badges, and copy buttons
   * @param {string} str
   * @param {boolean} isStreaming
   * @returns {string}
   */
  renderMarkdown(str, isStreaming = false) {
    if (!str) return "";

    let text = str;

    // 1. Process fenced code blocks ```lang\ncode\n```
    const codeBlocks = [];
    text = text.replace(/```([a-zA-Z0-9_\-#+.]*)\s*\n([\s\S]*?)```/g, (match, lang, code) => {
      const index = codeBlocks.length;
      const cleanLang = lang.trim() || "code";
      const escapedCode = this.escapeHtml(code.trim());
      const rawCode = this.escapeHtml(code.trim());

      const blockHtml = `
        <div class="code-block-wrapper">
          <div class="code-block-header">
            <span class="code-lang-tag">${this.escapeHtml(cleanLang)}</span>
            <button type="button" class="btn-copy-code" data-code="${rawCode}" title="Copy code snippet">
              📋 Copy
            </button>
          </div>
          <pre class="code-block-pre"><code class="language-${this.escapeHtml(cleanLang)}">${escapedCode}</code></pre>
        </div>
      `;
      codeBlocks.push(blockHtml);
      return `__CODE_BLOCK_${index}__`;
    });

    // 2. Escape standard HTML in remaining text
    text = this.escapeHtml(text);

    // 3. Headers: ###, ##, #
    text = text.replace(/^### (.*$)/gim, '<h5 class="chat-md-h5">$1</h5>');
    text = text.replace(/^## (.*$)/gim, '<h4 class="chat-md-h4">$1</h4>');
    text = text.replace(/^# (.*$)/gim, '<h3 class="chat-md-h3">$1</h3>');

    // 4. Bold & Italic
    text = text.replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>");
    text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");

    // 5. Inline Code
    text = text.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');

    // 6. Bullet lists
    text = text.replace(/^[-*•]\s+(.*)$/gim, '<li class="chat-list-item">$1</li>');
    text = text.replace(/((?:<li class="chat-list-item">.*<\/li>\s*)+)/g, '<ul class="chat-ul">$1</ul>');

    // 7. Numbered lists
    text = text.replace(/^\d+\.\s+(.*)$/gim, '<li class="chat-list-num">$1</li>');
    text = text.replace(/((?:<li class="chat-list-num">.*<\/li>\s*)+)/g, '<ol class="chat-ol">$1</ol>');

    // 8. Line breaks
    text = text.replace(/\n\n/g, "<br><br>").replace(/\n/g, "<br>");

    // 9. Restore code blocks
    codeBlocks.forEach((blockHtml, index) => {
      text = text.replace(`__CODE_BLOCK_${index}__`, blockHtml);
    });

    return text;
  }

  escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  updateEngineBadge(text, statusType) {
    if (!this.elements.engineStatus) return;
    this.elements.engineStatus.textContent = text;

    if (statusType === "busy") {
      this.elements.engineStatus.className = "badge badge-status badge-busy";
    } else if (statusType === "ready") {
      this.elements.engineStatus.className = "badge badge-status badge-ready";
    } else if (statusType === "error") {
      this.elements.engineStatus.className = "badge badge-status badge-locked";
    }
  }

  scrollToBottom() {
    if (this.elements.chatMessages) {
      this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }
  }
}

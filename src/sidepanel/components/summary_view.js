/**
 * Sidekick - Summary View Controller (Slice 3)
 * Orchestrates article content extraction, streaming structured summaries, and UI rendering
 */

import { streamAiContent } from "../../ai/ai_router.js";
import { buildSummaryPrompt } from "../../ai/prompt_templates.js";

export class SummaryViewController {
  constructor() {
    this.elements = {
      viewSummary: document.getElementById("view-summary"),
      btnTriggerSummary: document.getElementById("btn-trigger-summary"),
      btnDetailConcise: document.getElementById("btn-detail-concise"),
      btnDetailDetailed: document.getElementById("btn-detail-detailed"),
      resultsCard: document.getElementById("summary-results-card"),
      emptyState: document.getElementById("summary-empty-state"),
      contentDisplay: document.getElementById("summary-content-display"),
      engineStatus: document.getElementById("badge-engine-status")
    };

    this.detailLevel = "concise"; // "concise" | "detailed"
    this.isGenerating = false;
    this.lastExtractedData = null;
    this.lastGeneratedMarkdown = "";
  }

  /**
   * Initialize UI event listeners
   */
  init() {
    if (!this.elements.btnTriggerSummary) return;

    // Toggle detail levels
    if (this.elements.btnDetailConcise && this.elements.btnDetailDetailed) {
      this.elements.btnDetailConcise.addEventListener("click", () => {
        this.setDetailLevel("concise");
      });

      this.elements.btnDetailDetailed.addEventListener("click", () => {
        this.setDetailLevel("detailed");
      });
    }

    // Trigger Summary button
    this.elements.btnTriggerSummary.addEventListener("click", () => {
      this.handleSummarizeClick();
    });
  }

  /**
   * Set detail level (concise vs detailed)
   * @param {"concise" | "detailed"} level
   */
  setDetailLevel(level) {
    this.detailLevel = level;
    if (level === "concise") {
      this.elements.btnDetailConcise?.classList.add("active");
      this.elements.btnDetailDetailed?.classList.remove("active");
    } else {
      this.elements.btnDetailDetailed?.classList.add("active");
      this.elements.btnDetailConcise?.classList.remove("active");
    }
  }

  /**
   * Main handler for summarize button
   */
  async handleSummarizeClick() {
    if (this.isGenerating) return;

    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      this.renderError("Unable to locate active browser tab.");
      return;
    }

    // Check for internal/restricted chrome URLs
    if (!tab.url || /^(chrome|chrome-extension|devtools|about|data):/.test(tab.url)) {
      this.renderRestrictedNotice(tab.url || "Internal Page");
      return;
    }

    this.isGenerating = true;
    this.setButtonLoading(true);
    this.updateEngineBadge("Extracting...", "busy");

    try {
      // 1. Extract content from active tab
      const articleData = await this.extractArticleFromTab(tab.id);

      if (!articleData || !articleData.textContent || articleData.textContent.trim().length < 50) {
        this.renderError(
          "Could not find sufficient readable text on this page to summarize. Please ensure you are viewing a content page or article."
        );
        return;
      }

      this.lastExtractedData = articleData;

      // 2. Prepare Results UI Container
      this.prepareSummaryUi(articleData);

      // 3. Build structured prompt
      const prompt = buildSummaryPrompt({
        articleTitle: articleData.title || tab.title || "Webpage Article",
        articleText: articleData.textContent.slice(0, 15000), // Token boundary limit for speed
        detailLevel: this.detailLevel
      });

      this.updateEngineBadge("Summarizing...", "busy");

      // 4. Stream response from Gemini 3.5 Flash-Lite
      const summaryBodyEl = document.getElementById("summary-stream-body");
      let fullSummaryText = "";

      const result = await streamAiContent({
        prompt,
        onChunk: (accumulated) => {
          fullSummaryText = accumulated;
          this.renderFormattedSummary(summaryBodyEl, accumulated, true);
        },
        onProviderChange: (provider, reason) => {
          if (provider === "groq") {
            this.updateEngineBadge("Groq: Summarizing...", "busy");
          } else {
            this.updateEngineBadge("Gemini (Fallback)...", "busy");
          }
        }
      });

      this.lastGeneratedMarkdown = fullSummaryText;
      this.renderFormattedSummary(summaryBodyEl, fullSummaryText, false);
      this.updateEngineBadge(`Ready (${result.provider === "groq" ? "Groq" : "Gemini"})`, "ready");

      // Setup copy button
      this.setupCopyButton();
    } catch (err) {
      console.error("[Sidekick Summary] Summarization error:", err);
      this.updateEngineBadge("Error", "error");
      this.renderError(err.message || "Failed to generate structured summary.");
    } finally {
      this.isGenerating = false;
      this.setButtonLoading(false);
    }
  }

  /**
   * Send extraction message to tab, injecting content script if not already present
   * @param {number} tabId
   * @returns {Promise<any>}
   */
  async extractArticleFromTab(tabId) {
    try {
      // Try sending message directly
      const response = await this.sendMessagePromise(tabId, { type: "EXTRACT_ARTICLE" });
      if (response && response.success) {
        return response.data;
      }
    } catch {
      // Content script not yet present on tab (e.g. opened prior to extension load)
      console.log("[Sidekick Summary] Content script not detected, injecting dynamically...");
    }

    // Inject readability and content script dynamically
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["src/content/readability.js", "src/content/content_script.js"]
      });

      // Small delay for script evaluation
      await new Promise((r) => setTimeout(r, 100));

      const response = await this.sendMessagePromise(tabId, { type: "EXTRACT_ARTICLE" });
      if (response && response.success) {
        return response.data;
      }
      throw new Error(response?.error || "Article extraction returned no data.");
    } catch (injectionErr) {
      throw new Error(`Failed to read page content: ${injectionErr.message}`);
    }
  }

  /**
   * Helper promise wrapper for chrome.tabs.sendMessage
   */
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
   * Prepare UI structure before streaming
   * @param {object} article
   */
  prepareSummaryUi(article) {
    this.elements.emptyState?.classList.add("hidden");
    this.elements.contentDisplay?.classList.remove("hidden");

    const wordCount = article.textContent.split(/\s+/).length;
    const estReadingTimeMin = Math.max(1, Math.ceil(wordCount / 220));

    this.elements.contentDisplay.innerHTML = `
      <div class="summary-article-meta">
        <div class="meta-header">
          <span class="meta-tag meta-domain">${this.escapeHtml(article.siteName || "Webpage")}</span>
          <span class="meta-tag meta-words">${wordCount.toLocaleString()} words</span>
          <span class="meta-tag meta-time">~${estReadingTimeMin} min read</span>
          <span class="meta-tag meta-method">${article.method === "readability" ? "Clean Reader" : "DOM Cleaned"}</span>
        </div>
        <h4 class="summary-article-title">${this.escapeHtml(article.title || "Untitled Article")}</h4>
        ${article.byline ? `<div class="meta-byline">By ${this.escapeHtml(article.byline)}</div>` : ""}
      </div>

      <div class="summary-toolbar">
        <span class="summary-mode-indicator">
          Mode: <strong>${this.detailLevel === "concise" ? "5 Key Takeaways (Concise)" : "Comprehensive (Detailed)"}</strong>
        </span>
        <button type="button" class="btn-copy" id="btn-copy-summary" title="Copy summary to clipboard">
          📋 Copy Summary
        </button>
      </div>

      <div class="summary-stream-body" id="summary-stream-body">
        <div class="summary-skeleton">
          <div class="skeleton-line full"></div>
          <div class="skeleton-line medium"></div>
          <div class="skeleton-line short"></div>
        </div>
      </div>
    `;
  }

  /**
   * Format and render streaming markdown into styled sections
   * @param {HTMLElement} container
   * @param {string} rawMarkdown
   * @param {boolean} isStreaming
   */
  renderFormattedSummary(container, rawMarkdown, isStreaming = false) {
    if (!container) return;

    if (!rawMarkdown || rawMarkdown.trim().length === 0) {
      return;
    }

    // Split markdown by major sections (## One-Line TL;DR, ## Key Takeaways, ## What To Do Next)
    const sections = this.parseStructuredSections(rawMarkdown);

    let html = "";

    // 1. TL;DR Section
    if (sections.tldr) {
      html += `
        <div class="summary-section card-tldr">
          <div class="section-badge">⚡ TL;DR</div>
          <div class="tldr-text">${this.formatInlineMarkdown(sections.tldr)}</div>
        </div>
      `;
    }

    // 2. Key Takeaways Section
    if (sections.takeaways && sections.takeaways.length > 0) {
      html += `
        <div class="summary-section card-takeaways">
          <div class="section-title">💡 Key Takeaways</div>
          <ul class="takeaways-list">
            ${sections.takeaways
              .map(
                (item) => `
              <li class="takeaway-item">
                <span class="bullet-dot"></span>
                <span class="item-text">${this.formatInlineMarkdown(item)}</span>
              </li>
            `
              )
              .join("")}
          </ul>
        </div>
      `;
    }

    // 3. Action Items / Next Steps
    if (sections.nextSteps) {
      html += `
        <div class="summary-section card-next-steps">
          <div class="section-title">🎯 What To Do Next</div>
          <div class="next-steps-text">${this.formatInlineMarkdown(sections.nextSteps)}</div>
        </div>
      `;
    }

    // 4. Any remaining raw content if sections couldn't be cleanly parsed
    if (!sections.tldr && !sections.takeaways.length && !sections.nextSteps) {
      html += `<div class="summary-section generic-summary">${this.formatInlineMarkdown(rawMarkdown)}</div>`;
    }

    if (isStreaming) {
      html += '<span class="typing-cursor"></span>';
    }

    container.innerHTML = html;
  }

  /**
   * Parse structured sections from model response
   * @param {string} text
   */
  parseStructuredSections(text) {
    const result = {
      tldr: "",
      takeaways: [],
      nextSteps: ""
    };

    // Clean text
    const normalized = text.replace(/\r\n/g, "\n");

    // Match TL;DR
    const tldrMatch = normalized.match(
      /(?:##\s*(?:One-Line\s*)?TL;?DR|TL;?DR:?)([\s\S]*?)(?=(?:##|\n\s*\n\s*💡|\n\s*\n\s*Key Takeaways|$))/i
    );
    if (tldrMatch) {
      result.tldr = tldrMatch[1].replace(/^[ \t\n*#-]+/, "").trim();
    }

    // Match Key Takeaways
    const takeawaysMatch = normalized.match(
      /(?:##\s*Key Takeaways|💡\s*Key Takeaways)([\s\S]*?)(?=(?:##\s*What To Do Next|🎯|##\s*Actionable|$))/i
    );
    if (takeawaysMatch) {
      const block = takeawaysMatch[1].trim();
      const bulletLines = block
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => /^[-*•\d+.]\s+/.test(l));

      if (bulletLines.length > 0) {
        result.takeaways = bulletLines.map((l) => l.replace(/^[-*•\d+.]\s+/, "").trim());
      } else if (block) {
        result.takeaways = [block];
      }
    }

    // Match Next Steps
    const nextStepsMatch = normalized.match(
      /(?:##\s*What To Do Next.*?|🎯\s*What To Do Next.*?)([\s\S]*)$/i
    );
    if (nextStepsMatch) {
      result.nextSteps = nextStepsMatch[1].replace(/^[ \t\n*#-]+/, "").trim();
    }

    return result;
  }

  /**
   * Convert lightweight markdown syntax (bold, italic, code) into HTML
   * @param {string} str
   */
  formatInlineMarkdown(str) {
    if (!str) return "";
    let safe = this.escapeHtml(str);

    // Bold: **text** or __text__
    safe = safe.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    // Italic: *text* or _text_
    safe = safe.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
    // Inline code: `text`
    safe = safe.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Line breaks to <br> if not in list
    safe = safe.replace(/\n\n/g, "<br><br>").replace(/\n/g, "<br>");
    return safe;
  }

  /**
   * Setup copy-to-clipboard button
   */
  setupCopyButton() {
    const btnCopy = document.getElementById("btn-copy-summary");
    if (!btnCopy) return;

    btnCopy.addEventListener("click", async () => {
      if (!this.lastGeneratedMarkdown && !this.elements.contentDisplay) return;

      const articleTitle = this.lastExtractedData?.title || "Article Summary";
      const sourceUrl = this.lastExtractedData?.url || "";
      const textToCopy = `Title: ${articleTitle}\nSource: ${sourceUrl}\n\n${this.lastGeneratedMarkdown}`;

      try {
        await navigator.clipboard.writeText(textToCopy);
        const originalText = btnCopy.textContent;
        btnCopy.textContent = "✅ Copied!";
        btnCopy.classList.add("copied");

        setTimeout(() => {
          btnCopy.textContent = originalText;
          btnCopy.classList.remove("copied");
        }, 2000);
      } catch (err) {
        console.error("[Sidekick Summary] Failed to copy:", err);
      }
    });
  }

  /**
   * Set button loading state
   */
  setButtonLoading(loading) {
    if (!this.elements.btnTriggerSummary) return;

    if (loading) {
      this.elements.btnTriggerSummary.disabled = true;
      this.elements.btnTriggerSummary.innerHTML = `
        <span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span>
        Extracting & Summarizing...
      `;
    } else {
      this.elements.btnTriggerSummary.disabled = false;
      this.elements.btnTriggerSummary.innerHTML = `✨ Summarize Current Page`;
    }
  }

  /**
   * Update top header engine badge
   */
  updateEngineBadge(text, state) {
    if (!this.elements.engineStatus) return;
    this.elements.engineStatus.textContent = text;
    if (state === "ready") {
      this.elements.engineStatus.className = "badge badge-status badge-ready";
    } else if (state === "busy") {
      this.elements.engineStatus.className = "badge badge-status badge-lang";
    } else if (state === "error") {
      this.elements.engineStatus.className = "badge badge-locked";
    }
  }

  /**
   * Render error state in container
   */
  renderError(message) {
    this.elements.emptyState?.classList.add("hidden");
    this.elements.contentDisplay?.classList.remove("hidden");
    this.elements.contentDisplay.innerHTML = `
      <div class="summary-error-card">
        <div class="error-icon">⚠️</div>
        <h4>Unable to Summarize Page</h4>
        <p>${this.escapeHtml(message)}</p>
        <button class="btn btn-outline btn-sm" id="btn-retry-summary" style="margin-top: 10px;">
          🔄 Try Again
        </button>
      </div>
    `;

    document.getElementById("btn-retry-summary")?.addEventListener("click", () => {
      this.handleSummarizeClick();
    });
  }

  /**
   * Render message for restricted internal URLs
   */
  renderRestrictedNotice(url) {
    this.elements.emptyState?.classList.add("hidden");
    this.elements.contentDisplay?.classList.remove("hidden");
    this.elements.contentDisplay.innerHTML = `
      <div class="summary-restricted-card">
        <div class="restricted-icon">🔒</div>
        <h4>Browser-Protected Page</h4>
        <p>Chrome prohibits extensions from injecting scripts into internal URLs like <code>${this.escapeHtml(
          url
        )}</code>.</p>
        <p class="restricted-hint">Navigate to any public website, news article, or blog to use the summarizer.</p>
      </div>
    `;
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
}

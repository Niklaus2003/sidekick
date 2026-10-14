/**
 * Sidekick - Summary View Controller (Slice 3, Slice 4, Slice 5)
 * Orchestrates article extraction, YouTube video chapter summaries,
 * interactive video player seeking, and concise vs. detailed summary controls.
 */

import { streamAiContent } from "../../ai/ai_router.js";
import { buildSummaryPrompt, buildYouTubeSummaryPrompt } from "../../ai/prompt_templates.js";

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
    this.isYouTubeMode = false;
    this.activeTabId = null;
    this.lastExtractedData = null;
    this.lastGeneratedMarkdown = "";
  }

  /**
   * Initialize UI event listeners and active tab listeners
   */
  init() {
    if (!this.elements.btnTriggerSummary) return;

    // Toggle detail levels (Slice 5)
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

    // Check current tab type on launch
    this.checkActiveTabMode();

    // Listen for tab switch/update events to toggle YouTube mode
    if (chrome.tabs && chrome.tabs.onActivated) {
      chrome.tabs.onActivated.addListener(() => {
        this.checkActiveTabMode();
      });
    }

    if (chrome.tabs && chrome.tabs.onUpdated) {
      chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.status === "complete" || changeInfo.url) {
          this.checkActiveTabMode();
        }
      });
    }
  }

  /**
   * Check if the currently active tab is a YouTube watch page
   */
  async checkActiveTabMode() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) return;

      this.activeTabId = tab.id;
      const isYt =
        (tab.url.includes("youtube.com") && tab.url.includes("/watch")) ||
        tab.url.includes("youtu.be/");

      this.isYouTubeMode = isYt;

      if (isYt) {
        if (this.elements.btnTriggerSummary && !this.isGenerating) {
          this.elements.btnTriggerSummary.innerHTML = `🎬 Summarize Video Chapters`;
        }
      } else {
        if (this.elements.btnTriggerSummary && !this.isGenerating) {
          this.elements.btnTriggerSummary.innerHTML = `✨ Summarize Current Page`;
        }
      }
    } catch {
      // Ignore background query errors
    }
  }

  /**
   * Set detail level (concise vs detailed) - Slice 5
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
    this.activeTabId = tab.id;

    // Check for internal/restricted chrome URLs
    if (!tab.url || /^(chrome|chrome-extension|devtools|about|data):/.test(tab.url)) {
      this.renderRestrictedNotice(tab.url || "Internal Page");
      return;
    }

    this.isGenerating = true;
    this.setButtonLoading(true);
    this.updateEngineBadge("Extracting...", "busy");

    try {
      const isYt =
        (tab.url.includes("youtube.com") && tab.url.includes("/watch")) ||
        tab.url.includes("youtu.be/");

      if (isYt) {
        await this.handleYouTubeSummarize(tab.id);
      } else {
        await this.handleArticleSummarize(tab.id, tab.title);
      }
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
   * Handle standard webpage article summarization (Slice 3 & 5)
   */
  async handleArticleSummarize(tabId, tabTitle) {
    // 1. Extract content from active tab
    const articleData = await this.extractArticleFromTab(tabId);

    if (!articleData || !articleData.textContent || articleData.textContent.trim().length < 50) {
      this.renderError(
        "Could not find sufficient readable text on this page to summarize. Please ensure you are viewing a content page or article."
      );
      return;
    }

    this.lastExtractedData = articleData;

    // 2. Prepare Results UI Container
    this.prepareArticleSummaryUi(articleData);

    // 3. Build structured prompt (Slice 5 Concise vs Detailed)
    const prompt = buildSummaryPrompt({
      articleTitle: articleData.title || tabTitle || "Webpage Article",
      articleText: articleData.textContent.slice(0, 15000),
      detailLevel: this.detailLevel
    });

    this.updateEngineBadge("Summarizing...", "busy");

    // 4. Stream response from primary Groq with Gemini fallback
    const summaryBodyEl = document.getElementById("summary-stream-body");
    let fullSummaryText = "";

    const result = await streamAiContent({
      prompt,
      onChunk: (accumulated) => {
        fullSummaryText = accumulated;
        this.renderFormattedSummary(summaryBodyEl, accumulated, true);
      },
      onProviderChange: (provider) => {
        this.updateEngineBadge(`${provider === "groq" ? "Groq" : "Gemini"}: Summarizing...`, "busy");
      }
    });

    this.lastGeneratedMarkdown = fullSummaryText;
    this.renderFormattedSummary(summaryBodyEl, fullSummaryText, false);
    this.updateEngineBadge(`Ready (${result.provider === "groq" ? "Groq" : "Gemini"})`, "ready");

    this.setupCopyButton();
  }

  /**
   * Handle YouTube video chapter summarization (Slice 4 & 5)
   */
  async handleYouTubeSummarize(tabId) {
    this.updateEngineBadge("Reading Video...", "busy");

    // 1. Extract YouTube metadata & cues
    const ytData = await this.extractYouTubeFromTab(tabId);

    if (!ytData || !ytData.isYouTube) {
      this.renderError("Unable to read YouTube player information on this page.");
      return;
    }

    this.lastExtractedData = ytData;

    // 2. Prepare YouTube Results UI
    this.prepareYouTubeSummaryUi(ytData);

    // 3. Build YouTube chapter summary prompt
    const prompt = buildYouTubeSummaryPrompt({
      videoTitle: ytData.title || "YouTube Video",
      channelName: ytData.channel || "",
      duration: ytData.duration || "",
      description: ytData.description || "",
      chapters: ytData.chapters || [],
      transcriptText: ytData.transcript || "",
      detailLevel: this.detailLevel
    });

    this.updateEngineBadge("Chaptering...", "busy");

    // 4. Stream response
    const summaryBodyEl = document.getElementById("summary-stream-body");
    let fullSummaryText = "";

    const result = await streamAiContent({
      prompt,
      onChunk: (accumulated) => {
        fullSummaryText = accumulated;
        this.renderFormattedSummary(summaryBodyEl, accumulated, true, true);
      },
      onProviderChange: (provider) => {
        this.updateEngineBadge(`${provider === "groq" ? "Groq" : "Gemini"}: Chaptering...`, "busy");
      }
    });

    this.lastGeneratedMarkdown = fullSummaryText;
    this.renderFormattedSummary(summaryBodyEl, fullSummaryText, false, true);
    this.updateEngineBadge(`Ready (${result.provider === "groq" ? "Groq" : "Gemini"})`, "ready");

    this.setupCopyButton();
    this.setupTimestampSeekers(tabId);
  }

  /**
   * Extract readable article text using Readability
   */
  async extractArticleFromTab(tabId) {
    try {
      const response = await this.sendMessagePromise(tabId, { type: "EXTRACT_ARTICLE" });
      if (response && response.success) {
        return response.data;
      }
    } catch {
      // Content script not detected, inject dynamically
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["src/content/readability.js", "src/content/content_script.js"]
      });
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
   * Extract YouTube metadata, chapters, and cues
   */
  async extractYouTubeFromTab(tabId) {
    try {
      const response = await this.sendMessagePromise(tabId, { type: "EXTRACT_YOUTUBE" });
      if (response && response.success) {
        return response.data;
      }
    } catch {
      // Inject youtube_extractor.js dynamically
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["src/content/youtube_extractor.js"]
      });
      await new Promise((r) => setTimeout(r, 120));

      const response = await this.sendMessagePromise(tabId, { type: "EXTRACT_YOUTUBE" });
      if (response && response.success) {
        return response.data;
      }
      throw new Error(response?.error || "YouTube extraction returned no data.");
    } catch (injectionErr) {
      throw new Error(`Failed to extract YouTube details: ${injectionErr.message}`);
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
   * UI Setup for Article Summary
   */
  prepareArticleSummaryUi(article) {
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
          Detail: <strong>${this.detailLevel === "concise" ? "Concise (5 Key Points)" : "Detailed Analysis"}</strong>
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
   * UI Setup for YouTube Summary
   */
  prepareYouTubeSummaryUi(ytData) {
    this.elements.emptyState?.classList.add("hidden");
    this.elements.contentDisplay?.classList.remove("hidden");

    this.elements.contentDisplay.innerHTML = `
      <div class="summary-article-meta">
        <div class="meta-header">
          <span class="meta-tag meta-yt">▶ YouTube Video</span>
          ${ytData.channel ? `<span class="meta-tag meta-channel">${this.escapeHtml(ytData.channel)}</span>` : ""}
          ${ytData.duration ? `<span class="meta-tag meta-time">⏱️ ${this.escapeHtml(ytData.duration)}</span>` : ""}
          ${ytData.chapters && ytData.chapters.length > 0 ? `<span class="meta-tag meta-method">${ytData.chapters.length} Chapters</span>` : ""}
        </div>
        <h4 class="summary-article-title">${this.escapeHtml(ytData.title || "YouTube Video")}</h4>
      </div>

      <div class="summary-toolbar">
        <span class="summary-mode-indicator">
          Detail: <strong>${this.detailLevel === "concise" ? "Concise Chapters" : "Detailed Breakdowns"}</strong>
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
   * Render structured sections with interactive timestamp buttons for YouTube
   */
  renderFormattedSummary(container, rawMarkdown, isStreaming = false, isYouTube = false) {
    if (!container || !rawMarkdown) return;

    const sections = this.parseStructuredSections(rawMarkdown);
    let html = "";

    // 1. TL;DR Section
    if (sections.tldr) {
      html += `
        <div class="summary-section card-tldr">
          <div class="section-badge">${isYouTube ? "⚡ Video TL;DR" : "⚡ TL;DR"}</div>
          <div class="tldr-text">${this.formatInlineMarkdown(sections.tldr, isYouTube)}</div>
        </div>
      `;
    }

    // 2. Key Takeaways / Chapter Breakdowns
    if (sections.takeaways && sections.takeaways.length > 0) {
      html += `
        <div class="summary-section card-takeaways">
          <div class="section-title">${isYouTube ? "🎬 Chapter Breakdowns & Key Moments" : "💡 Key Takeaways"}</div>
          <ul class="takeaways-list">
            ${sections.takeaways
              .map(
                (item) => `
              <li class="takeaway-item">
                <span class="bullet-dot"></span>
                <span class="item-text">${this.formatInlineMarkdown(item, isYouTube)}</span>
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
          <div class="next-steps-text">${this.formatInlineMarkdown(sections.nextSteps, isYouTube)}</div>
        </div>
      `;
    }

    // 4. Raw fallback if headers not matched
    if (!sections.tldr && !sections.takeaways.length && !sections.nextSteps) {
      html += `<div class="summary-section generic-summary">${this.formatInlineMarkdown(rawMarkdown, isYouTube)}</div>`;
    }

    if (isStreaming) {
      html += '<span class="typing-cursor"></span>';
    }

    container.innerHTML = html;

    // If YouTube mode, rebind any interactive timestamps in the DOM
    if (isYouTube && !isStreaming) {
      this.setupTimestampSeekers(this.activeTabId);
    }
  }

  /**
   * Format markdown inline and convert [MM:SS] to clickable seek chips
   */
  formatInlineMarkdown(str, isYouTube = false) {
    if (!str) return "";
    let safe = this.escapeHtml(str);

    // Convert [MM:SS] or [HH:MM:SS] to interactive seek chips for YouTube (Slice 4)
    if (isYouTube) {
      safe = safe.replace(/\[((?:\d{1,2}:)?\d{1,2}:\d{2})\]/g, (match, timeStr) => {
        const seconds = this.parseTimestampToSeconds(timeStr);
        return `<button type="button" class="yt-seek-chip" data-seconds="${seconds}" data-time="${timeStr}" title="Click to seek YouTube video to ${timeStr}">⏱️ ${timeStr}</button>`;
      });
    }

    // Bold & italic & code
    safe = safe.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
    safe = safe.replace(/`([^`]+)`/g, "<code>$1</code>");
    safe = safe.replace(/\n\n/g, "<br><br>").replace(/\n/g, "<br>");

    return safe;
  }

  /**
   * Setup interactive click handlers for timestamp chips
   */
  setupTimestampSeekers(tabId) {
    const seekChips = this.elements.contentDisplay?.querySelectorAll(".yt-seek-chip");
    if (!seekChips) return;

    seekChips.forEach((chip) => {
      chip.addEventListener("click", async (e) => {
        e.preventDefault();
        const seconds = parseInt(chip.getAttribute("data-seconds"), 10);
        const timeStr = chip.getAttribute("data-time") || "";

        if (isNaN(seconds)) return;

        try {
          await this.sendMessagePromise(tabId || this.activeTabId, {
            type: "SEEK_YOUTUBE",
            seconds
          });
          this.showSeekToast(`Jumped to ${timeStr}`);
        } catch (err) {
          console.warn("[Sidekick] Failed to seek video:", err);
        }
      });
    });
  }

  showSeekToast(text) {
    const existing = document.querySelector(".yt-seek-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "yt-seek-toast";
    toast.textContent = `▶ ${text}`;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 2000);
  }

  parseStructuredSections(text) {
    const result = { tldr: "", takeaways: [], nextSteps: "" };
    const normalized = text.replace(/\r\n/g, "\n");

    const tldrMatch = normalized.match(
      /(?:##\s*(?:One-Line\s*)?(?:Overview\s*)?TL;?DR|TL;?DR:?)([\s\S]*?)(?=(?:##|\n\s*\n\s*💡|\n\s*\n\s*Key|\n\s*\n\s*🎬|$))/i
    );
    if (tldrMatch) {
      result.tldr = tldrMatch[1].replace(/^[ \t\n*#-]+/, "").trim();
    }

    const takeawaysMatch = normalized.match(
      /(?:##\s*(?:Key Takeaways|Chapter Breakdowns.*?)|(?:💡|🎬)\s*(?:Key Takeaways|Chapter Breakdowns.*?))([\s\S]*?)(?=(?:##\s*What To Do Next|🎯|##\s*Actionable|##\s*Main Conclusion|$))/i
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

    const nextStepsMatch = normalized.match(
      /(?:##\s*What To Do Next.*?|🎯\s*What To Do Next.*?|##\s*Main Conclusion.*?)([\s\S]*)$/i
    );
    if (nextStepsMatch) {
      result.nextSteps = nextStepsMatch[1].replace(/^[ \t\n*#-]+/, "").trim();
    }

    return result;
  }

  parseTimestampToSeconds(str) {
    if (!str) return 0;
    const parts = str.split(":").map((p) => parseInt(p, 10));
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
  }

  setupCopyButton() {
    const btnCopy = document.getElementById("btn-copy-summary");
    if (!btnCopy) return;

    btnCopy.addEventListener("click", async () => {
      if (!this.lastGeneratedMarkdown) return;
      const title = this.lastExtractedData?.title || "Summary";
      const url = this.lastExtractedData?.url || "";
      const textToCopy = `Title: ${title}\nSource: ${url}\nMode: ${this.detailLevel.toUpperCase()}\n\n${this.lastGeneratedMarkdown}`;

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

  setButtonLoading(loading) {
    if (!this.elements.btnTriggerSummary) return;

    if (loading) {
      this.elements.btnTriggerSummary.disabled = true;
      this.elements.btnTriggerSummary.innerHTML = `
        <span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span>
        Generating Summary...
      `;
    } else {
      this.elements.btnTriggerSummary.disabled = false;
      this.elements.btnTriggerSummary.innerHTML = this.isYouTubeMode
        ? `🎬 Summarize Video Chapters`
        : `✨ Summarize Current Page`;
    }
  }

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

  renderError(message) {
    this.elements.emptyState?.classList.add("hidden");
    this.elements.contentDisplay?.classList.remove("hidden");
    this.elements.contentDisplay.innerHTML = `
      <div class="summary-error-card">
        <div class="error-icon">⚠️</div>
        <h4>Unable to Summarize</h4>
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
        <p class="restricted-hint">Navigate to any public website, article, or YouTube video to use the summarizer.</p>
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

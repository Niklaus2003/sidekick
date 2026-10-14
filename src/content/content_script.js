/**
 * Sidekick - Content Script
 * Extracts readable article content and structured DOM data for AI processing
 */

(function initSidekickContentScript() {
  // Prevent duplicate initialization on the same page
  if (window.__SIDEKICK_CONTENT_SCRIPT_INITIALIZED__) {
    return;
  }
  window.__SIDEKICK_CONTENT_SCRIPT_INITIALIZED__ = true;

  console.log("[Sidekick Content Script] Initialized on:", window.location.href);

  /**
   * Listen for messages from Sidekick side panel and background worker
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return false;

    switch (message.type) {
      case "PING_CONTENT_SCRIPT":
        sendResponse({ success: true, url: window.location.href, title: document.title });
        return false;

      case "EXTRACT_ARTICLE":
        try {
          const articleData = extractCleanArticle();
          sendResponse({ success: true, data: articleData });
        } catch (err) {
          console.error("[Sidekick Content Script] Article extraction error:", err);
          sendResponse({
            success: false,
            error: err.message || "Failed to extract readable article content."
          });
        }
        return false;

      default:
        return false;
    }
  });

  /**
   * Extract readable article text using Readability with graceful fallback
   */
  function extractCleanArticle() {
    let article = null;

    // Check if Readability is loaded
    const ReadabilityClass = window.Readability || globalThis.Readability;

    if (typeof ReadabilityClass === "function") {
      try {
        // Clone the document so DOM manipulation inside Readability doesn't alter the live page
        const docClone = document.cloneNode(true);
        const reader = new ReadabilityClass(docClone, {
          charThreshold: 80,
          classesToPreserve: ["code", "pre", "table", "blockquote"]
        });
        article = reader.parse();
      } catch (e) {
        console.warn("[Sidekick Content Script] Readability parsing threw an error, using fallback:", e);
      }
    }

    // If Readability succeeded and found substantial content
    if (article && article.textContent && article.textContent.trim().length > 100) {
      return {
        title: article.title || document.title,
        byline: article.byline || "",
        siteName: article.siteName || window.location.hostname,
        excerpt: article.excerpt || "",
        textContent: cleanWhitespace(article.textContent),
        length: article.textContent.length,
        url: window.location.href,
        method: "readability"
      };
    }

    // Fallback: Extract from <article>, <main>, or document.body
    return extractFallbackContent();
  }

  /**
   * Fallback content extractor for pages where Readability returns null or empty
   */
  function extractFallbackContent() {
    const mainTarget =
      document.querySelector("article") ||
      document.querySelector("main") ||
      document.querySelector('[role="main"]') ||
      document.body;

    if (!mainTarget) {
      return {
        title: document.title || "Untitled Page",
        byline: "",
        siteName: window.location.hostname,
        excerpt: "",
        textContent: "",
        length: 0,
        url: window.location.href,
        method: "empty"
      };
    }

    const clone = mainTarget.cloneNode(true);

    // Strip unhelpful elements
    const elementsToRemove = clone.querySelectorAll(
      "script, style, noscript, svg, nav, footer, header, [aria-hidden='true'], iframe, ads, .advertisement, #comments"
    );
    elementsToRemove.forEach((el) => el.remove());

    const text = cleanWhitespace(clone.innerText || clone.textContent || "");

    return {
      title: document.title || "Untitled Page",
      byline: "",
      siteName: window.location.hostname,
      excerpt: text.slice(0, 200).replace(/\n+/g, " "),
      textContent: text,
      length: text.length,
      url: window.location.href,
      method: "dom_fallback"
    };
  }

  /**
   * Clean excessive whitespace and blank lines
   * @param {string} str
   * @returns {string}
   */
  function cleanWhitespace(str) {
    if (!str) return "";
    return str
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
})();

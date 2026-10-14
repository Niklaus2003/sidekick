/**
 * Sidekick - YouTube Video & Chapter Extractor (Slice 4)
 * Extracts metadata, timestamps, description, and transcript from YouTube watch pages
 * Controls HTML5 video player seeking via synthetic events
 */

(function initSidekickYouTubeExtractor() {
  if (window.__SIDEKICK_YOUTUBE_EXTRACTOR_INITIALIZED__) {
    return;
  }
  window.__SIDEKICK_YOUTUBE_EXTRACTOR_INITIALIZED__ = true;

  console.log("[Sidekick YouTube Extractor] Initialized on:", window.location.href);

  /**
   * Listen for messages from Sidekick side panel and background worker
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return false;

    switch (message.type) {
      case "CHECK_YOUTUBE":
        sendResponse({
          isYouTube: isYouTubeWatchPage(),
          videoId: getYouTubeVideoId(),
          url: window.location.href
        });
        return false;

      case "EXTRACT_YOUTUBE":
        try {
          const videoData = extractYouTubeData();
          sendResponse({ success: true, data: videoData });
        } catch (err) {
          console.error("[Sidekick YouTube] Extraction error:", err);
          sendResponse({
            success: false,
            error: err.message || "Failed to extract YouTube video metadata."
          });
        }
        return false;

      case "SEEK_YOUTUBE":
        try {
          const result = seekVideoTo(message.seconds);
          sendResponse(result);
        } catch (err) {
          console.error("[Sidekick YouTube] Seek error:", err);
          sendResponse({ success: false, error: err.message });
        }
        return false;

      default:
        return false;
    }
  });

  /**
   * Check if current page is an active YouTube watch page
   * @returns {boolean}
   */
  function isYouTubeWatchPage() {
    const isYt =
      window.location.hostname.includes("youtube.com") ||
      window.location.hostname.includes("youtu.be");
    const isWatch =
      window.location.pathname.startsWith("/watch") ||
      window.location.pathname.startsWith("/live");
    return isYt && isWatch;
  }

  /**
   * Extract video ID from URL
   * @returns {string | null}
   */
  function getYouTubeVideoId() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get("v") || null;
    } catch {
      return null;
    }
  }

  /**
   * Comprehensive YouTube video metadata and transcript/chapter extractor
   */
  function extractYouTubeData() {
    if (!isYouTubeWatchPage()) {
      return {
        isYouTube: false,
        error: "Not an active YouTube video watch page."
      };
    }

    // 1. Video Title
    const titleEl =
      document.querySelector("h1.style-scope.ytd-watch-metadata yt-formatted-string") ||
      document.querySelector("h1.title.style-scope.ytd-video-primary-info-renderer") ||
      document.querySelector("#title h1");
    const rawTitle = titleEl ? titleEl.innerText.trim() : document.title.replace(/ - YouTube$/, "").trim();

    // 2. Channel Name
    const channelEl =
      document.querySelector("#owner #channel-name yt-formatted-string a") ||
      document.querySelector("#owner #channel-name a") ||
      document.querySelector("ytd-channel-name a");
    const channel = channelEl ? channelEl.innerText.trim() : "";

    // 3. Duration & Current Time
    const videoEl = document.querySelector("video");
    const durationSeconds = videoEl ? Math.floor(videoEl.duration || 0) : 0;
    const currentTimeSeconds = videoEl ? Math.floor(videoEl.currentTime || 0) : 0;

    const durationDisplayEl = document.querySelector(".ytp-time-duration");
    const durationFormatted = durationDisplayEl ? durationDisplayEl.innerText.trim() : formatSeconds(durationSeconds);

    // 4. Description & Chapters from Description
    const descEl =
      document.querySelector("#description-inline-expander") ||
      document.querySelector("#description") ||
      document.querySelector("ytd-expander#description");
    const description = descEl ? descEl.innerText.trim() : "";

    const chapters = extractChaptersFromText(description);

    // 5. Transcript Segments (if transcript drawer was opened by user)
    const transcriptSegments = extractTranscriptFromDom();

    return {
      isYouTube: true,
      videoId: getYouTubeVideoId(),
      title: rawTitle,
      channel,
      duration: durationFormatted,
      durationSeconds,
      currentTimeSeconds,
      description: description.slice(0, 3000), // Limit description for prompt budget
      chapters,
      transcript: transcriptSegments,
      url: window.location.href
    };
  }

  /**
   * Parse timestamped chapters from description text
   * Format: "01:23 Introduction" or "0:45 Key Concept" or "1:02:15 Deep Dive"
   * @param {string} text
   * @returns {Array<{ timestamp: string, seconds: number, title: string }>}
   */
  function extractChaptersFromText(text) {
    if (!text) return [];
    const lines = text.split("\n");
    const chapters = [];
    const timeRegex = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})/;

    for (const line of lines) {
      const match = line.match(timeRegex);
      if (match) {
        const timestamp = match[0];
        const seconds = parseTimestampToSeconds(timestamp);
        const title = line.replace(timestamp, "").replace(/^[\s\-–—:|]+/, "").trim();
        if (title.length > 0) {
          chapters.push({ timestamp, seconds, title });
        }
      }
    }
    return chapters;
  }

  /**
   * Extract transcript lines if transcript container is present in the DOM
   * @returns {string}
   */
  function extractTranscriptFromDom() {
    const segmentEls = document.querySelectorAll("ytd-transcript-segment-renderer");
    if (!segmentEls || segmentEls.length === 0) return "";

    const lines = [];
    segmentEls.forEach((el) => {
      const time = el.querySelector(".segment-timestamp")?.innerText?.trim() || "";
      const text = el.querySelector(".segment-text")?.innerText?.trim() || "";
      if (text) {
        lines.push(`${time ? `[${time}] ` : ""}${text}`);
      }
    });

    return lines.join("\n");
  }

  /**
   * Seek HTML5 video player to a specific timestamp in seconds
   * @param {number} seconds
   * @returns {{ success: boolean, currentTime: number }}
   */
  function seekVideoTo(seconds) {
    const video = document.querySelector("video");
    if (!video) {
      throw new Error("No HTML5 video element found on this page.");
    }

    const targetSeconds = Math.max(0, Math.min(seconds, video.duration || seconds));
    video.currentTime = targetSeconds;

    // Ensure video is playing after seek
    if (video.paused) {
      video.play().catch(() => {});
    }

    return {
      success: true,
      currentTime: video.currentTime,
      formattedTime: formatSeconds(Math.floor(video.currentTime))
    };
  }

  /**
   * Helper to convert HH:MM:SS or MM:SS to seconds
   * @param {string} str
   * @returns {number}
   */
  function parseTimestampToSeconds(str) {
    const parts = str.split(":").map((p) => parseInt(p, 10));
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
  }

  /**
   * Helper to format seconds as MM:SS or HH:MM:SS
   * @param {number} totalSeconds
   * @returns {string}
   */
  function formatSeconds(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n) => String(n).padStart(2, "0");

    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${minutes}:${pad(seconds)}`;
  }
})();

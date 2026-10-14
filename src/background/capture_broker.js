/**
 * Sidekick - Screenshot Capture Broker (Slice 8)
 * Manages tab viewport snapshots via chrome.tabs.captureVisibleTab
 * and coordinates region crop selection with the active webpage.
 */

/**
 * Capture visible tab as PNG data URL
 * @param {number | null} windowId
 * @returns {Promise<string>}
 */
function captureVisibleTabSnapshot(windowId = null) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || "Failed to capture visible tab"));
      } else if (!dataUrl) {
        reject(new Error("captureVisibleTab returned empty data"));
      } else {
        resolve(dataUrl);
      }
    });
  });
}

/**
 * Initiate region selection overlay on the active tab
 * @param {number} [tabId]
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
async function startRegionCaptureOnActiveTab(tabId = null) {
  try {
    let targetTabId = tabId;
    let windowId = null;

    if (!targetTabId) {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab || !activeTab.id) {
        throw new Error("No active tab found to capture.");
      }
      targetTabId = activeTab.id;
      windowId = activeTab.windowId;
    }

    // Capture tab snapshot
    const dataUrl = await captureVisibleTabSnapshot(windowId);

    // Ensure region_selector.js is injected into target tab
    try {
      await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        files: ["src/content/region_selector.js"]
      });
    } catch (injErr) {
      console.warn("[Sidekick Capture Broker] Injection notice:", injErr.message);
    }

    // Send snapshot to region selector
    await chrome.tabs.sendMessage(targetTabId, {
      type: "INIT_REGION_SELECTOR",
      dataUrl
    });

    return { success: true };
  } catch (err) {
    console.error("[Sidekick Capture Broker] Error starting region capture:", err);
    return { success: false, error: err.message };
  }
}

// Runtime message listener for capture requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  switch (message.type) {
    case "CAPTURE_VISIBLE_TAB":
      captureVisibleTabSnapshot(message.windowId || null)
        .then((dataUrl) => sendResponse({ success: true, dataUrl }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case "START_REGION_CAPTURE":
      startRegionCaptureOnActiveTab(message.tabId || null)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    default:
      return false;
  }
});

// Expose on self for background worker
if (typeof self !== "undefined") {
  self.captureVisibleTabSnapshot = captureVisibleTabSnapshot;
  self.startRegionCaptureOnActiveTab = startRegionCaptureOnActiveTab;
}

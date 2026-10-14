/**
 * Sidekick - Background Service Worker
 * Central event coordinator and lifecycle manager for Manifest V3
 * Bulletproof, self-contained, zero-dependency startup
 */

// Default settings snapshot for initialization
const DEFAULT_SETTINGS = {
  primaryProvider: "groq",
  groqApiKey: "",
  groqModel: "openai/gpt-oss-120b",
  fallbackProvider: "gemini",
  geminiApiKey: "",
  modelPreference: "gemini-3.5-flash-lite",
  maxStepLimit: 10,
  dryRunDefault: false,
  languagePolicy: "english_only"
};

const SETTINGS_KEY = "sidekick_settings";

// 1. Extension installation & startup initialization
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log(`[Sidekick Worker] Extension installed/updated. Reason: ${details.reason}`);

  // Safely configure side panel behavior if supported
  if (chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === "function") {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err) => console.warn("[Sidekick Worker] setPanelBehavior notice:", err));
  }

  // Ensure default settings exist in storage
  try {
    const existing = await chrome.storage.local.get(SETTINGS_KEY);
    if (!existing || !existing[SETTINGS_KEY]) {
      await chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
    }
  } catch (err) {
    console.error("[Sidekick Worker] Error initializing settings:", err);
  }
});

// 2. Fallback action click handler to open side panel
if (chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener(async (tab) => {
    if (chrome.sidePanel && typeof chrome.sidePanel.open === "function") {
      try {
        await chrome.sidePanel.open({ tabId: tab.id });
      } catch (err) {
        console.warn("[Sidekick Worker] sidePanel.open notice:", err);
      }
    }
  });
}

// 3. Central message bus
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  switch (message.type) {
    case "PING":
      sendResponse({ status: "OK", timestamp: Date.now() });
      return false;

    case "GET_ACTIVE_TAB":
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0) {
          sendResponse({ success: true, tab: tabs[0] });
        } else {
          sendResponse({ success: false, error: "No active tab found" });
        }
      });
      return true;

    case "TEST_GEMINI_KEY":
      handleApiKeyTest(message.payload?.apiKey)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case "TEST_GROQ_KEY":
      handleGroqKeyTest(message.payload?.apiKey)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case "TEST_ALL_KEYS":
      handleAllKeysTest(message.payload || {})
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    default:
      return false;
  }
});

/**
 * Perform a lightweight verification call to Gemini API
 * @param {string} apiKey
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function handleApiKeyTest(apiKey) {
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    return { success: false, message: "Gemini API key cannot be empty." };
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey.trim()}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "ping" }] }],
        generationConfig: { maxOutputTokens: 5 }
      })
    });

    if (response.ok) {
      return {
        success: true,
        message: "Gemini API connected successfully! (gemini-3.5-flash-lite fallback verified & active)"
      };
    } else {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
      return { success: false, message: `Gemini validation failed: ${errorMsg}` };
    }
  } catch (networkErr) {
    return {
      success: false,
      message: `Network error connecting to Google AI Studio: ${networkErr.message}`
    };
  }
}

/**
 * Perform a lightweight verification call to Groq API
 * @param {string} apiKey
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function handleGroqKeyTest(apiKey) {
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    return { success: false, message: "Groq API key cannot be empty." };
  }

  const endpoint = "https://api.groq.com/openai/v1/chat/completions";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5
      })
    });

    if (response.ok) {
      return {
        success: true,
        message: "Groq API connected successfully! (openai/gpt-oss-120b verified as Primary Engine)"
      };
    } else {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
      return { success: false, message: `Groq validation failed: ${errorMsg}` };
    }
  } catch (networkErr) {
    return {
      success: false,
      message: `Network error connecting to Groq: ${networkErr.message}`
    };
  }
}

/**
 * Test both Groq (Primary) and Gemini (Fallback) keys
 */
async function handleAllKeysTest({ groqApiKey, geminiApiKey }) {
  const results = [];

  if (groqApiKey) {
    const groqRes = await handleGroqKeyTest(groqApiKey);
    results.push(groqRes.success ? "✅ Primary (Groq): Connected" : `❌ Primary (Groq): ${groqRes.message}`);
  } else {
    results.push("⚠️ Primary (Groq): No key provided");
  }

  if (geminiApiKey) {
    const geminiRes = await handleApiKeyTest(geminiApiKey);
    results.push(geminiRes.success ? "✅ Fallback (Gemini): Connected" : `❌ Fallback (Gemini): ${geminiRes.message}`);
  } else {
    results.push("⚠️ Fallback (Gemini): No key provided");
  }

  const allSuccess = results.every((r) => r.startsWith("✅"));
  return {
    success: allSuccess,
    message: results.join("\n")
  };
}

console.log("[Sidekick Worker] Background Service Worker initialized successfully.");

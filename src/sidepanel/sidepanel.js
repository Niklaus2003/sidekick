/**
 * Sidekick - Side Panel Controller
 * Handles UI interactions, tab switching, settings management, and active tab tracking
 */

import { getSettings, saveSettings } from "../shared/storage_utils.js";
import { SummaryViewController } from "./components/summary_view.js";
import { ChatViewController } from "./components/chat_view.js";

// DOM Element References
const elements = {
  navTabs: document.querySelectorAll(".nav-tab"),
  tabPanels: document.querySelectorAll(".tab-panel"),
  tabUrlDisplay: document.getElementById("tab-url-display"),
  tabFavicon: document.getElementById("tab-favicon"),
  engineStatus: document.getElementById("badge-engine-status"),
  footerStatus: document.getElementById("footer-status-text"),

  // Settings
  settingsForm: document.getElementById("settings-form"),
  inputGeminiKey: document.getElementById("input-gemini-key"),
  inputGroqKey: document.getElementById("input-groq-key"),
  selectModel: document.getElementById("select-model"),
  inputStepLimit: document.getElementById("input-step-limit"),
  btnToggleKey: document.getElementById("btn-toggle-key"),
  btnToggleGroqKey: document.getElementById("btn-toggle-groq-key"),
  btnTestKey: document.getElementById("btn-test-key"),
  testBtnText: document.getElementById("test-btn-text"),
  testSpinner: document.getElementById("test-spinner"),
  settingsAlert: document.getElementById("settings-alert"),

  // Emergency Stop
  btnEmergencyStop: document.getElementById("btn-emergency-stop"),

  // Chat
  chatMessages: document.getElementById("chat-messages"),
  chatInput: document.getElementById("chat-input"),
  chatForm: document.getElementById("chat-form"),
  promptChips: document.querySelectorAll(".prompt-chip"),

  // Summary
  detailToggles: document.querySelectorAll("#view-summary .toggle-btn")
};

// Application State
const state = {
  activeTabId: null,
  activeTabUrl: null,
  activeTabTitle: null,
  currentView: "view-chat",
  isStreaming: false
};

/**
 * Initialize Side Panel
 */
async function initSidePanel() {
  setupTabNavigation();
  setupSettingsHandlers();
  setupEmergencyStop();

  // Initialize View Controllers (Slice 3, 4, 5, 6, 7)
  const chatController = new ChatViewController();
  chatController.init();

  const summaryController = new SummaryViewController();
  summaryController.init();

  await loadSavedSettings();
  await updateActiveTabInfo();
  listenToChromeTabEvents();
}

/**
 * Tab Navigation Controller
 */
function setupTabNavigation() {
  elements.navTabs.forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      const targetViewId = tabBtn.getAttribute("data-target");
      if (!targetViewId) return;

      // Update Nav Tab Buttons
      elements.navTabs.forEach((btn) => {
        btn.classList.remove("active");
        btn.setAttribute("aria-selected", "false");
      });
      tabBtn.classList.add("active");
      tabBtn.setAttribute("aria-selected", "true");

      // Update Tab Panels
      elements.tabPanels.forEach((panel) => {
        panel.classList.remove("active");
      });
      const targetPanel = document.getElementById(targetViewId);
      if (targetPanel) {
        targetPanel.classList.add("active");
        state.currentView = targetViewId;
      }
    });
  });
}

/**
 * Settings View Handlers
 */
function setupSettingsHandlers() {
  // Toggle password visibility for Gemini Key
  elements.btnToggleKey.addEventListener("click", () => {
    const isPassword = elements.inputGeminiKey.type === "password";
    elements.inputGeminiKey.type = isPassword ? "text" : "password";
    elements.btnToggleKey.textContent = isPassword ? "🙈" : "👁️";
  });

  // Toggle password visibility for Groq Key
  elements.btnToggleGroqKey?.addEventListener("click", () => {
    const isPassword = elements.inputGroqKey.type === "password";
    elements.inputGroqKey.type = isPassword ? "text" : "password";
    elements.btnToggleGroqKey.textContent = isPassword ? "🙈" : "👁️";
  });

  // Settings Form Submit (Save)
  elements.settingsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const geminiApiKey = elements.inputGeminiKey.value.trim();
    const groqApiKey = elements.inputGroqKey.value.trim();
    const modelPreference = elements.selectModel.value;
    const maxStepLimit = parseInt(elements.inputStepLimit.value, 10) || 10;

    const success = await saveSettings({
      geminiApiKey,
      groqApiKey,
      modelPreference,
      maxStepLimit
    });

    if (success) {
      showSettingsAlert("Settings saved successfully! Ready for AI tasks.", "success");
    } else {
      showSettingsAlert("Failed to save settings to local storage.", "error");
    }
  });

  // Test Connection Button (Tests Primary Groq + Fallback Gemini)
  elements.btnTestKey.addEventListener("click", async () => {
    const groqApiKey = elements.inputGroqKey.value.trim();
    const geminiApiKey = elements.inputGeminiKey.value.trim();

    if (!groqApiKey && !geminiApiKey) {
      showSettingsAlert("Please enter a Groq or Gemini API Key to test.", "error");
      elements.inputGroqKey.focus();
      return;
    }

    setTestButtonLoading(true);

    try {
      // Send verification request to service worker
      const response = await chrome.runtime.sendMessage({
        type: "TEST_ALL_KEYS",
        payload: { groqApiKey, geminiApiKey }
      });

      if (response && response.success) {
        showSettingsAlert(response.message || "APIs connected successfully!", "success");
        await saveSettings({ groqApiKey, geminiApiKey });
      } else {
        const errorMsg = response?.error || response?.message || "Failed to validate keys.";
        showSettingsAlert(errorMsg, "error");
      }
    } catch (err) {
      showSettingsAlert(`Connection test failed: ${err.message}`, "error");
    } finally {
      setTestButtonLoading(false);
    }
  });
}

/**
 * Load saved settings from chrome.storage.local
 */
async function loadSavedSettings() {
  const settings = await getSettings();
  if (settings.geminiApiKey) {
    elements.inputGeminiKey.value = settings.geminiApiKey;
  }
  if (settings.groqApiKey) {
    elements.inputGroqKey.value = settings.groqApiKey;
  }
  if (settings.modelPreference) {
    elements.selectModel.value = settings.modelPreference;
  }
  if (settings.maxStepLimit) {
    elements.inputStepLimit.value = settings.maxStepLimit;
  }

  // If no API key is saved, show gentle hint
  if (!settings.geminiApiKey) {
    elements.footerStatus.textContent = "Please configure Gemini API key in Settings";
  }
}

/**
 * Display alert banner in Settings
 * @param {string} message
 * @param {"success" | "error"} type
 */
function showSettingsAlert(message, type = "success") {
  elements.settingsAlert.className = `alert-box alert-${type}`;
  elements.settingsAlert.textContent = message;
  elements.settingsAlert.classList.remove("hidden");

  // Auto-hide success alerts after 5 seconds
  if (type === "success") {
    setTimeout(() => {
      elements.settingsAlert.classList.add("hidden");
    }, 5000);
  }
}

/**
 * Toggle Test Button Loading Spinner
 * @param {boolean} isLoading
 */
function setTestButtonLoading(isLoading) {
  if (isLoading) {
    elements.testSpinner.classList.remove("hidden");
    elements.testBtnText.textContent = "Connecting...";
    elements.btnTestKey.disabled = true;
  } else {
    elements.testSpinner.classList.add("hidden");
    elements.testBtnText.textContent = "Test Connection";
    elements.btnTestKey.disabled = false;
  }
}

/**
 * Track and Display Active Browser Tab Info
 */
async function updateActiveTabInfo() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0) {
      const activeTab = tabs[0];
      state.activeTabId = activeTab.id;
      state.activeTabUrl = activeTab.url;
      state.activeTabTitle = activeTab.title;

      // Format hostname or URL
      if (activeTab.url) {
        try {
          const parsed = new URL(activeTab.url);
          const domain = parsed.hostname.replace(/^www\./, "");
          elements.tabUrlDisplay.textContent = `${domain} — ${activeTab.title || ""}`;
        } catch {
          elements.tabUrlDisplay.textContent = activeTab.title || activeTab.url;
        }
      } else {
        elements.tabUrlDisplay.textContent = "New Tab";
      }

      // Check restricted URLs
      if (activeTab.url && /^(chrome|chrome-extension|devtools|about|data):/.test(activeTab.url)) {
        elements.tabUrlDisplay.textContent = `Restricted: ${activeTab.url.split("/")[2] || "internal page"}`;
        elements.engineStatus.textContent = "Protected";
        elements.engineStatus.className = "badge badge-locked";
      } else {
        elements.engineStatus.textContent = "Ready";
        elements.engineStatus.className = "badge badge-status badge-ready";
      }
    }
  } catch (err) {
    console.error("[Sidekick] Error updating active tab info:", err);
  }
}

/**
 * Chrome Tab Events Listener
 */
function listenToChromeTabEvents() {
  chrome.tabs.onActivated.addListener(() => {
    updateActiveTabInfo();
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === "complete" || changeInfo.url) {
      updateActiveTabInfo();
    }
  });
}

/**
 * Emergency Stop / Global Kill Switch
 */
function setupEmergencyStop() {
  const triggerStop = () => {
    console.warn("[Sidekick] Emergency STOP triggered by user.");
    elements.footerStatus.textContent = "Task Stopped by User";
    chrome.runtime.sendMessage({ type: "STOP_TASK" }).catch(() => {});
  };

  elements.btnEmergencyStop.addEventListener("click", triggerStop);

  // Keyboard shortcut: Esc triggers emergency stop
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      triggerStop();
    }
  });
}

// Start application
document.addEventListener("DOMContentLoaded", initSidePanel);

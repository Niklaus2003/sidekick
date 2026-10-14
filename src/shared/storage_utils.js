/**
 * Sidekick - Chrome Storage Utilities
 * Provides promise-based access to chrome.storage.local and chrome.storage.session
 */

export const STORAGE_KEYS = {
  SETTINGS: "sidekick_settings",
  PROFILE: "sidekick_user_profile",
  SAVED_SKILLS: "sidekick_saved_skills",
  ACTION_LOGS: "sidekick_action_logs",
  SESSION_TASK: "sidekick_session_task"
};

export const DEFAULT_SETTINGS = {
  primaryProvider: "groq",
  groqApiKey: "",
  groqModel: "openai/gpt-oss-120b",
  fallbackProvider: "gemini",
  geminiApiKey: "",
  modelPreference: "gemini-3.5-flash-lite", // Fallback Gemini model
  maxStepLimit: 10,
  dryRunDefault: false,
  languagePolicy: "english_only" // Strictly English, non-modifiable
};

/**
 * Retrieve user settings from chrome.storage.local
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
export async function getSettings() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
  } catch (err) {
    console.error("[Sidekick Storage] Failed to get settings:", err);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Persist user settings to chrome.storage.local
 * @param {Partial<typeof DEFAULT_SETTINGS>} newSettings
 * @returns {Promise<boolean>}
 */
export async function saveSettings(newSettings) {
  try {
    const current = await getSettings();
    const updated = { ...current, ...newSettings, languagePolicy: "english_only" };
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
    return true;
  } catch (err) {
    console.error("[Sidekick Storage] Failed to save settings:", err);
    return false;
  }
}

/**
 * Convenience method to get Gemini API key
 * @returns {Promise<string>}
 */
export async function getApiKey() {
  const settings = await getSettings();
  return settings.geminiApiKey || "";
}

/**
 * Convenience method to store Gemini API key
 * @param {string} apiKey
 * @returns {Promise<boolean>}
 */
export async function setApiKey(apiKey) {
  return await saveSettings({ geminiApiKey: apiKey.trim() });
}

/**
 * Retrieve ephemeral session task state from chrome.storage.session
 * @returns {Promise<any>}
 */
export async function getSessionState() {
  try {
    if (!chrome.storage.session) return null;
    const result = await chrome.storage.session.get(STORAGE_KEYS.SESSION_TASK);
    return result[STORAGE_KEYS.SESSION_TASK] || null;
  } catch (err) {
    console.error("[Sidekick Storage] Failed to get session state:", err);
    return null;
  }
}

/**
 * Persist active task state to chrome.storage.session (survives service worker restart)
 * @param {any} state
 * @returns {Promise<boolean>}
 */
export async function setSessionState(state) {
  try {
    if (!chrome.storage.session) return false;
    await chrome.storage.session.set({ [STORAGE_KEYS.SESSION_TASK]: state });
    return true;
  } catch (err) {
    console.error("[Sidekick Storage] Failed to set session state:", err);
    return false;
  }
}

/**
 * Clear session state on task termination
 * @returns {Promise<boolean>}
 */
export async function clearSessionState() {
  try {
    if (!chrome.storage.session) return false;
    await chrome.storage.session.remove(STORAGE_KEYS.SESSION_TASK);
    return true;
  } catch (err) {
    console.error("[Sidekick Storage] Failed to clear session state:", err);
    return false;
  }
}

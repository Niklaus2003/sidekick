/**
 * Sidekick - Context Menus Controller (Slice 7)
 * Registers browser right-click context menu shortcuts for selected text
 * and routes them directly to the Sidekick chat interface.
 */

const CONTEXT_MENU_ITEMS = [
  {
    id: "sidekick_explain",
    title: "Sidekick: Explain this in plain English",
    contexts: ["selection"],
    action: "explain"
  },
  {
    id: "sidekick_translate",
    title: "Sidekick: Translate to English",
    contexts: ["selection"],
    action: "translate"
  },
  {
    id: "sidekick_reply",
    title: "Sidekick: Draft a professional reply",
    contexts: ["selection"],
    action: "reply"
  }
];

const PENDING_ACTION_STORAGE_KEY = "sidekick_pending_context_action";

/**
 * Initialize and register context menus
 */
function setupContextMenus() {
  if (!chrome.contextMenus) {
    console.warn("[Sidekick Context Menus] chrome.contextMenus API not available.");
    return;
  }

  // Clear existing items first to avoid duplicate ID errors on reload
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) {
      console.warn("[Sidekick Context Menus] removeAll warning:", chrome.runtime.lastError);
    }

    CONTEXT_MENU_ITEMS.forEach((item) => {
      chrome.contextMenus.create({
        id: item.id,
        title: item.title,
        contexts: item.contexts
      }, () => {
        if (chrome.runtime.lastError) {
          console.warn(`[Sidekick Context Menus] Failed to create ${item.id}:`, chrome.runtime.lastError);
        }
      });
    });

    console.log("[Sidekick Context Menus] All 3 context menus registered successfully.");
  });
}

/**
 * Handle clicks on Sidekick context menus
 * @param {chrome.contextMenus.OnClickData} info
 * @param {chrome.tabs.Tab} tab
 */
async function handleContextMenuClick(info, tab) {
  if (!info || !info.menuItemId) return;

  const matched = CONTEXT_MENU_ITEMS.find((item) => item.id === info.menuItemId);
  if (!matched) return;

  const payload = {
    action: matched.action,
    text: info.selectionText ? info.selectionText.trim() : "",
    tabId: tab ? tab.id : null,
    pageUrl: tab ? tab.url : "",
    pageTitle: tab ? tab.title : "",
    timestamp: Date.now()
  };

  console.log(`[Sidekick Context Menus] Triggered action: "${matched.action}" on text: "${payload.text.slice(0, 40)}..."`);

  // 1. Store pending action in both session & local storage for maximum resilience
  try {
    if (chrome.storage.session) {
      await chrome.storage.session.set({ [PENDING_ACTION_STORAGE_KEY]: payload });
    }
  } catch (sessErr) {
    console.warn("[Sidekick Context Menus] Session storage notice:", sessErr);
  }

  try {
    await chrome.storage.local.set({ [PENDING_ACTION_STORAGE_KEY]: payload });
  } catch (localErr) {
    console.warn("[Sidekick Context Menus] Local storage notice:", localErr);
  }

  // 2. Open side panel
  if (chrome.sidePanel && typeof chrome.sidePanel.open === "function") {
    try {
      if (tab && tab.id) {
        await chrome.sidePanel.open({ tabId: tab.id });
      } else if (tab && tab.windowId) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      }
    } catch (panelErr) {
      console.warn("[Sidekick Context Menus] sidePanel.open notice:", panelErr);
    }
  }

  // 3. Dispatch direct runtime message if side panel is already open and ready
  try {
    chrome.runtime.sendMessage({
      type: "EXECUTE_CONTEXT_ACTION",
      payload
    }).catch(() => {
      // Ignored if side panel is loading; storage will handle it on mount
    });
  } catch {
    // Port closed / side panel opening
  }
}

// Bind context menu click listener in worker scope
if (chrome.contextMenus && chrome.contextMenus.onClicked) {
  chrome.contextMenus.onClicked.addListener(handleContextMenuClick);
}

// Expose on self for background service worker
if (typeof self !== "undefined") {
  self.setupContextMenus = setupContextMenus;
  self.handleContextMenuClick = handleContextMenuClick;
  self.PENDING_ACTION_STORAGE_KEY = PENDING_ACTION_STORAGE_KEY;
}

/**
 * tabIdentity.js
 *
 * Generates and maintains a unique, isolated identifier for this specific browser tab.
 * Persisted in sessionStorage (which is strictly scoped to a single tab and survives page reloads,
 * but is NOT shared across tabs or duplicate windows).
 *
 * This allows the backend to distinguish:
 * - Same-tab reconnects / page reloads (same tabId -> seamlessly re-attach)
 * - Duplicate tabs opened for the same room (different tabId -> ROOM_ACTIVE_ELSEWHERE -> Switch Here)
 */

const STORAGE_KEY = 'synctube:tab-id:v1'

/**
 * Get or generate the unique tab ID for this browser tab.
 *
 * @returns {string}
 */
export function getTabId() {
  try {
    let tabId = sessionStorage.getItem(STORAGE_KEY)
    if (tabId && typeof tabId === 'string' && tabId.length >= 16) {
      return tabId
    }

    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      tabId = crypto.randomUUID()
    } else {
      tabId = 'tab_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now().toString(36)
    }

    sessionStorage.setItem(STORAGE_KEY, tabId)
    return tabId
  } catch {
    // If sessionStorage is inaccessible (e.g. strict sandboxing), generate in-memory id
    return 'tab_' + Math.random().toString(36).slice(2, 11)
  }
}

/**
 * clientIdentity.js
 *
 * Generates and stores a stable, anonymous browser identity for guest users.
 * Persisted in localStorage so multiple tabs and window reloads on the same browser
 * share the same device identity.
 *
 * An opaque random UUID is generated once using crypto.randomUUID().
 * It is NEVER displayed in the UI, NEVER fingerprinted, and NEVER broadcasted to other users.
 */

const STORAGE_KEY = 'synctube:device-id:v1'

/**
 * Returns the stable guest device ID for this browser profile.
 * Generates and persists a new UUID if one does not already exist.
 *
 * @returns {string}
 */
export function getGuestDeviceId() {
  try {
    let deviceId = localStorage.getItem(STORAGE_KEY)
    if (deviceId && typeof deviceId === 'string' && deviceId.length >= 32) {
      return deviceId
    }

    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      deviceId = crypto.randomUUID()
    } else {
      // Fallback RFC4122 v4 UUID generator if crypto.randomUUID is unavailable
      deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
      })
    }

    localStorage.setItem(STORAGE_KEY, deviceId)
    return deviceId
  } catch {
    // If localStorage is blocked (e.g. private mode restrictions), generate ephemeral UUID
    return '00000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14)
  }
}

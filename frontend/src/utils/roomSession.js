/**
 * roomSession.js
 *
 * Persists lightweight room session information in localStorage.
 * When a user opens the same room in a second browser tab, the new tab
 * has an empty React context; this utility allows the tab to recover
 * the participant's chosen nickname and join automatically without
 * re-prompting for a nickname.
 *
 * Stores only safe, non-sensitive information: { username }.
 * Does NOT store tokens, roles, socket IDs, or identity hashes.
 */

function getKey(roomId) {
  return `synctube:room-session:${roomId?.toUpperCase()}`
}

/**
 * Get the stored session for a given room.
 *
 * @param {string} roomId
 * @returns {{ username: string }|null}
 */
export function getRoomSession(roomId) {
  if (!roomId) return null
  try {
    const raw = localStorage.getItem(getKey(roomId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.username === 'string' && parsed.username.trim()) {
      return { username: parsed.username.trim() }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Persist the active room session.
 *
 * @param {string} roomId
 * @param {{ username: string }} sessionData
 */
export function setRoomSession(roomId, { username }) {
  if (!roomId || !username) return
  try {
    localStorage.setItem(getKey(roomId), JSON.stringify({
      username: username.trim(),
      savedAt: Date.now(),
    }))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clear the room session (e.g. on explicit leave, kick, or ban).
 *
 * @param {string} roomId
 */
export function clearRoomSession(roomId) {
  if (!roomId) return
  try {
    localStorage.removeItem(getKey(roomId))
  } catch {
    // Ignore storage errors
  }
}

/**
 * disconnectGraceManager.js
 *
 * Manages transient network disconnect grace periods for participants.
 * When a participant's last active socket disconnects unexpectedly,
 * a grace timer is started (default: 7000ms).
 *
 * If any socket with the same participantId / identityHash reconnects within
 * the grace period, the timer is cancelled and the participant seamlessly remains online.
 *
 * If the timer expires without a reconnect, the leave is finalized:
 * the participant is removed from MongoDB, host is transferred if necessary,
 * and USER_LEFT is emitted.
 */

const pendingGraceTimers = new Map()

function getTimerKey(roomId, participantId) {
  return `${roomId}:${participantId}`
}

/**
 * Schedule a disconnect grace period for a participant.
 *
 * @param {Object} params
 * @param {string} params.roomId
 * @param {string} params.participantId
 * @param {Function} params.onExpire - Callback executed if timer expires without reconnection.
 * @param {number} [params.graceMs=7000] - Grace period duration in milliseconds.
 */
function scheduleDisconnectGrace({ roomId, participantId, onExpire, graceMs = 7000 }) {
  const key = getTimerKey(roomId, participantId)

  // Clear any existing timer for this participant
  if (pendingGraceTimers.has(key)) {
    clearTimeout(pendingGraceTimers.get(key))
    pendingGraceTimers.delete(key)
  }

  const timer = setTimeout(async () => {
    pendingGraceTimers.delete(key)
    try {
      await onExpire()
    } catch (err) {
      console.error(`[DisconnectGrace] Error finalizing leave for ${key}:`, err.message)
    }
  }, graceMs)

  pendingGraceTimers.set(key, timer)
}

/**
 * Cancel any active disconnect grace timer for a participant (e.g. upon reconnection or explicit leave).
 *
 * @param {string} roomId
 * @param {string} participantId
 * @returns {boolean} True if a pending timer was cancelled.
 */
function cancelDisconnectGrace(roomId, participantId) {
  const key = getTimerKey(roomId, participantId)
  if (pendingGraceTimers.has(key)) {
    clearTimeout(pendingGraceTimers.get(key))
    pendingGraceTimers.delete(key)
    return true
  }
  return false
}

/**
 * Check if a participant has a pending disconnect grace timer.
 *
 * @param {string} roomId
 * @param {string} participantId
 * @returns {boolean}
 */
function hasPendingGrace(roomId, participantId) {
  return pendingGraceTimers.has(getTimerKey(roomId, participantId))
}

/**
 * Clears all pending timers (useful for unit testing and graceful shutdown).
 */
function clearAllTimers() {
  for (const timer of pendingGraceTimers.values()) {
    clearTimeout(timer)
  }
  pendingGraceTimers.clear()
}

module.exports = {
  scheduleDisconnectGrace,
  cancelDisconnectGrace,
  hasPendingGrace,
  clearAllTimers,
}

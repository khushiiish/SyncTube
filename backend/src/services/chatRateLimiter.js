/**
 * chatRateLimiter.js
 *
 * In-memory sliding-window rate limiter for text chat messages.
 * Keyed by `${roomId}:${participantId}` to ensure limits apply to the stable
 * participant identity, preventing flood abuse via multiple open tabs or reconnections.
 *
 * Limit: Maximum 20 text messages per participant per 10 seconds.
 */

const MAX_CHAT_MESSAGES = 20
const WINDOW_MS = 10 * 1000 // 10 seconds

// Map<string, number[]> — keys: `${roomId}:${participantId}`, values: array of timestamps
const participantChatWindows = new Map()

/**
 * Check and record a text chat message attempt.
 *
 * @param {string} roomId
 * @param {string} participantId
 * @returns {{ allowed: boolean, message?: string }}
 */
function checkAndRecordChat(roomId, participantId) {
  if (!roomId || !participantId) {
    return { allowed: false, message: 'Invalid room or participant identity.' }
  }

  const key = `${roomId.toUpperCase()}:${participantId}`
  const now = Date.now()

  let timestamps = participantChatWindows.get(key) || []
  // Prune timestamps older than WINDOW_MS
  timestamps = timestamps.filter(t => now - t < WINDOW_MS)

  if (timestamps.length >= MAX_CHAT_MESSAGES) {
    return {
      allowed: false,
      code: 'CHAT_RATE_LIMITED',
      message: 'You are sending messages too quickly. Please wait a moment.',
    }
  }

  timestamps.push(now)
  participantChatWindows.set(key, timestamps)

  return { allowed: true }
}

/**
 * Periodically purge stale entries from memory (runs every 60s).
 */
function sweepExpiredChatLimits() {
  const now = Date.now()
  for (const [key, timestamps] of participantChatWindows.entries()) {
    const valid = timestamps.filter(t => now - t < WINDOW_MS)
    if (valid.length === 0) {
      participantChatWindows.delete(key)
    } else {
      participantChatWindows.set(key, valid)
    }
  }
}

const sweepInterval = setInterval(sweepExpiredChatLimits, 60000)
if (sweepInterval.unref) {
  sweepInterval.unref()
}

/**
 * Reset limiter state (primarily for test suites).
 */
function resetChatLimiter() {
  participantChatWindows.clear()
}

module.exports = {
  checkAndRecordChat,
  sweepExpiredChatLimits,
  resetChatLimiter,
  resetChatLimits: resetChatLimiter,
}

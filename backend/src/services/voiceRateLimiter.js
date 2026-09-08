/**
 * voiceRateLimiter.js
 *
 * In-memory sliding-window rate limiter for voice message uploads.
 * Keyed by `${roomId}:${participantId}` to ensure limits are tied to the
 * stable participant identity, preventing bypass via multiple open tabs.
 *
 * Limit: Maximum 10 voice messages per participant per 5 minutes.
 */

const MAX_VOICE_MESSAGES = 10
const WINDOW_MS = 5 * 60 * 1000 // 5 minutes

// Map<string, number[]> — keys: `${roomId}:${participantId}`, values: array of timestamps
const participantVoiceWindows = new Map()

/**
 * Check and record a voice message attempt.
 *
 * @param {string} roomId
 * @param {string} participantId
 * @returns {{ allowed: boolean, message?: string }}
 */
function checkAndRecordVoice(roomId, participantId) {
  if (!roomId || !participantId) {
    return { allowed: false, message: 'Invalid room or participant identity.' }
  }

  const key = `${roomId.toUpperCase()}:${participantId}`
  const now = Date.now()

  let timestamps = participantVoiceWindows.get(key) || []
  // Prune timestamps older than WINDOW_MS
  timestamps = timestamps.filter(t => now - t < WINDOW_MS)

  if (timestamps.length >= MAX_VOICE_MESSAGES) {
    return {
      allowed: false,
      code: 'RATE_LIMITED',
      message: 'Too many voice messages. Please wait a few minutes before trying again.',
    }
  }

  timestamps.push(now)
  participantVoiceWindows.set(key, timestamps)

  return { allowed: true }
}

/**
 * Sweep expired rate limit records to prevent memory growth.
 */
function sweepExpiredLimits() {
  const now = Date.now()
  for (const [key, timestamps] of participantVoiceWindows.entries()) {
    const valid = timestamps.filter(t => now - t < WINDOW_MS)
    if (valid.length === 0) {
      participantVoiceWindows.delete(key)
    } else {
      participantVoiceWindows.set(key, valid)
    }
  }
}

// Auto-sweep every 10 minutes
const sweepInterval = setInterval(sweepExpiredLimits, 10 * 60 * 1000)
if (sweepInterval.unref) sweepInterval.unref()

/**
 * Reset all rate limits (for testing).
 */
function resetRateLimits() {
  participantVoiceWindows.clear()
}

module.exports = {
  checkAndRecordVoice,
  resetRateLimits,
  MAX_VOICE_MESSAGES,
  WINDOW_MS,
}

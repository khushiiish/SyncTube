/**
 * inviteRateLimiter — In-memory rate limiter for room email invitations.
 *
 * Rules:
 * 1. Socket Limit: max 5 invitations per socket in a sliding 10-minute window.
 * 2. Room+Recipient Cooldown: same room and same recipient cannot receive another invite for 60 seconds.
 * 3. Automatic Pruning: entries older than 10 minutes are purged regularly to prevent memory growth.
 */

const SOCKET_WINDOW_MS = 10 * 60 * 1000 // 10 minutes
const SOCKET_MAX_ATTEMPTS = 5
const COOLDOWN_MS = 60 * 1000 // 60 seconds

// Map<socketId, number[]> (array of timestamps)
const socketAttempts = new Map()

// Map<`${roomId}:${normalizedEmail}`, number> (timestamp of last send)
const recipientCooldowns = new Map()

/**
 * Prunes expired entries from internal memory maps.
 */
function pruneExpiredEntries() {
  const now = Date.now()

  // Prune socket attempts
  for (const [socketId, timestamps] of socketAttempts.entries()) {
    const valid = timestamps.filter(t => now - t < SOCKET_WINDOW_MS)
    if (valid.length === 0) {
      socketAttempts.delete(socketId)
    } else {
      socketAttempts.set(socketId, valid)
    }
  }

  // Prune cooldowns
  for (const [key, lastSent] of recipientCooldowns.entries()) {
    if (now - lastSent >= COOLDOWN_MS) {
      recipientCooldowns.delete(key)
    }
  }
}

// Periodically run cleanup every 5 minutes
const cleanupInterval = setInterval(pruneExpiredEntries, 5 * 60 * 1000)
if (cleanupInterval.unref) cleanupInterval.unref() // Do not hold the event loop open

/**
 * Checks if a socket can send an invitation to the given room and recipient.
 * If allowed, records the attempt.
 *
 * @param {string} socketId
 * @param {string} roomId
 * @param {string} normalizedEmail
 * @returns {{ allowed: boolean, code?: string, message?: string }}
 */
function checkAndRecordInvite(socketId, roomId, normalizedEmail) {
  const now = Date.now()

  // 1. Check Room + Recipient Cooldown
  const cooldownKey = `${roomId.toUpperCase()}:${normalizedEmail}`
  const lastSent = recipientCooldowns.get(cooldownKey)
  if (lastSent && (now - lastSent) < COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((COOLDOWN_MS - (now - lastSent)) / 1000)
    return {
      allowed: false,
      code: 'COOLDOWN_ACTIVE',
      message: `An invitation was already sent to this address recently. Please wait ${remainingSeconds}s before sending again.`,
    }
  }

  // 2. Check Socket 10-minute Rate Limit
  const attempts = socketAttempts.get(socketId) || []
  const recentAttempts = attempts.filter(t => (now - t) < SOCKET_WINDOW_MS)

  if (recentAttempts.length >= SOCKET_MAX_ATTEMPTS) {
    return {
      allowed: false,
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many invitations sent. Please wait a few minutes before trying again.',
    }
  }

  // Record successful check
  recentAttempts.push(now)
  socketAttempts.set(socketId, recentAttempts)
  recipientCooldowns.set(cooldownKey, now)

  return { allowed: true }
}

/**
 * Resets tracking state (useful for tests).
 */
function resetRateLimits() {
  socketAttempts.clear()
  recipientCooldowns.clear()
}

module.exports = {
  checkAndRecordInvite,
  resetRateLimits,
  pruneExpiredEntries,
}

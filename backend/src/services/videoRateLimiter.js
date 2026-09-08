/**
 * videoRateLimiter.js
 *
 * Lightweight in-memory flood protection for video playback control events
 * (PLAY, PAUSE, SEEK, CHANGE_VIDEO).
 *
 * Allows normal interactive video seeking while preventing abusive high-frequency
 * loops (e.g. scripts emitting hundreds of seeks/second).
 *
 * Limit: Maximum 15 control events per 3 seconds per socket.
 */

const MAX_CONTROL_EVENTS = 15
const WINDOW_MS = 3 * 1000 // 3 seconds

// Map<string, number[]> — keys: socketId, values: timestamps array
const socketControlWindows = new Map()

/**
 * Check if a playback control action is permitted.
 *
 * @param {string} socketId
 * @returns {boolean} True if allowed, false if throttled
 */
function checkControlRate(socketId) {
  if (!socketId) return false

  const now = Date.now()
  let timestamps = socketControlWindows.get(socketId) || []
  timestamps = timestamps.filter(t => now - t < WINDOW_MS)

  if (timestamps.length >= MAX_CONTROL_EVENTS) {
    return false
  }

  timestamps.push(now)
  socketControlWindows.set(socketId, timestamps)
  return true
}

/**
 * Clean up rate tracking on socket disconnect.
 *
 * @param {string} socketId
 */
function clearControlRate(socketId) {
  if (socketId) {
    socketControlWindows.delete(socketId)
  }
}

// Sweep stale socket entries every 30s
const sweepInterval = setInterval(() => {
  const now = Date.now()
  for (const [socketId, timestamps] of socketControlWindows.entries()) {
    const valid = timestamps.filter(t => now - t < WINDOW_MS)
    if (valid.length === 0) {
      socketControlWindows.delete(socketId)
    } else {
      socketControlWindows.set(socketId, valid)
    }
  }
}, 30000)

if (sweepInterval.unref) {
  sweepInterval.unref()
}

module.exports = {
  checkControlRate,
  clearControlRate,
}

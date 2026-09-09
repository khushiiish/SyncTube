/**
 * roomMutationLock.js — in-process mutex serializer for room-scoped state mutations.
 *
 * Prevents race conditions during critical concurrent room operations (JOIN, TAKEOVER, KICK)
 * on the same room. Operations on different rooms execute concurrently without blocking each other.
 *
 * Assumption: Single backend instance architecture.
 */

const roomLocks = new Map()

/**
 * Executes a function holding an exclusive in-process lock for the specified roomId.
 *
 * @template T
 * @param {string} roomId - Room identifier to lock
 * @param {() => Promise<T>} fn - Async work to execute inside the lock
 * @returns {Promise<T>}
 */
async function withRoomLock(roomId, fn) {
  if (!roomId || typeof fn !== 'function') {
    return typeof fn === 'function' ? await fn() : undefined
  }

  const key = roomId.toUpperCase().trim()

  // Retrieve current tail promise in the queue, or a resolved promise
  const previousLock = roomLocks.get(key) || Promise.resolve()

  let releaseCurrentLock
  const currentLock = new Promise(resolve => {
    releaseCurrentLock = resolve
  })

  // Set current tail of queue for this room
  roomLocks.set(key, currentLock)

  try {
    // Wait for prior mutation on this room to complete
    await previousLock
    return await fn()
  } finally {
    // Release lock for the next queued mutation
    releaseCurrentLock()

    // Clean up map entry if this was the last queued lock
    if (roomLocks.get(key) === currentLock) {
      roomLocks.delete(key)
    }
  }
}

/**
 * Returns true if a room currently has an active or pending mutation lock.
 * Useful for diagnostics and tests.
 *
 * @param {string} roomId
 * @returns {boolean}
 */
function isRoomLocked(roomId) {
  if (!roomId) return false
  return roomLocks.has(roomId.toUpperCase().trim())
}

module.exports = {
  withRoomLock,
  isRoomLocked,
}

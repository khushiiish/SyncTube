const VoiceAsset = require('../models/VoiceAsset')
const { deleteAudio } = require('./voiceStorageService')

/**
 * voiceCleanupService.js
 *
 * Manages deletion of Cloudinary audio assets when:
 * 1. A room is explicitly deleted by the host or auto-deleted when empty.
 * 2. Room documents expire via MongoDB 24-hour TTL.
 */

let cleanupInterval = null

/**
 * Record a newly uploaded voice asset for cleanup tracking.
 *
 * @param {Object} params
 * @param {string} params.roomId
 * @param {string} params.publicId
 * @param {Date} [params.deleteAfter] - Defaults to 24 hours from now
 */
async function recordVoiceAsset({ roomId, publicId, deleteAfter }) {
  try {
    const expiry = deleteAfter || new Date(Date.now() + 24 * 60 * 60 * 1000)
    await VoiceAsset.create({
      roomId: roomId.toUpperCase(),
      publicId,
      deleteAfter: expiry,
    })
  } catch (err) {
    console.warn('[VoiceCleanup] Failed to record voice asset for cleanup:', err.message)
  }
}

/**
 * Deletes all Cloudinary assets associated with a given room.
 * Called on explicit room deletion and empty room removal.
 *
 * @param {string} roomId
 */
async function cleanupRoomAssets(roomId) {
  if (!roomId) return

  try {
    const assets = await VoiceAsset.find({ roomId: roomId.toUpperCase() })
    if (!assets || assets.length === 0) return

    console.log(`[VoiceCleanup] Cleaning up ${assets.length} audio assets for room ${roomId}...`)

    for (const asset of assets) {
      await deleteAudio(asset.publicId)
    }

    await VoiceAsset.deleteMany({ roomId: roomId.toUpperCase() })
  } catch (err) {
    console.warn(`[VoiceCleanup] Error cleaning room assets for ${roomId}:`, err.message)
  }
}

/**
 * Sweeps and destroys all audio assets whose deleteAfter date has passed.
 */
async function cleanupExpiredAssets() {
  try {
    const now = new Date()
    const expiredAssets = await VoiceAsset.find({ deleteAfter: { $lte: now } }).limit(50)
    if (!expiredAssets || expiredAssets.length === 0) return

    console.log(`[VoiceCleanup] Found ${expiredAssets.length} expired audio assets. Purging from Cloudinary...`)

    for (const asset of expiredAssets) {
      await deleteAudio(asset.publicId)
      await VoiceAsset.deleteOne({ _id: asset._id })
    }
  } catch (err) {
    // Database might be offline during development; handle gracefully
    if (!err.message?.includes('buffering timed out')) {
      console.warn('[VoiceCleanup] Periodic cleanup error:', err.message)
    }
  }
}

/**
 * Starts the periodic background cleanup timer (runs once per hour).
 *
 * @param {number} [intervalMs=3600000]
 */
function startPeriodicCleanup(intervalMs = 3600000) {
  if (cleanupInterval) clearInterval(cleanupInterval)

  cleanupInterval = setInterval(() => {
    cleanupExpiredAssets().catch(() => {})
  }, intervalMs)

  // Unref timer so Node process isn't kept awake during graceful shutdown/tests
  if (cleanupInterval.unref) {
    cleanupInterval.unref()
  }
}

function stopPeriodicCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
  }
}

module.exports = {
  recordVoiceAsset,
  cleanupRoomAssets,
  cleanupExpiredAssets,
  startPeriodicCleanup,
  stopPeriodicCleanup,
}

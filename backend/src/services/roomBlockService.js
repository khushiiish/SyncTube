const RoomBlock = require('../models/RoomBlock')

/**
 * Standard Room and Block Time-To-Live: 24 hours (in milliseconds).
 */
const ROOM_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Checks whether an identity is blocked from a specific room.
 *
 * Query is strictly scoped by both roomId and identityHash to prevent global ban leakage.
 *
 * @param {string} roomId
 * @param {string} identityHash
 * @returns {Promise<boolean>}
 */
async function isBlocked(roomId, identityHash) {
  if (!roomId || !identityHash) return false
  const normalizedRoomId = roomId.toUpperCase().trim()

  const block = await RoomBlock.findOne({
    roomId: normalizedRoomId,
    identityHash,
  })

  return Boolean(block)
}

/**
 * Persists a room block with idempotent upsert semantics.
 *
 * @param {Object} params
 * @param {string} params.roomId
 * @param {string} params.identityHash
 * @param {string|null} [params.blockedByParticipantId]
 * @param {string} [params.reason='removed_by_host']
 * @param {Date} [params.expiresAt]
 * @returns {Promise<Object>}
 */
async function blockIdentity({ roomId, identityHash, blockedByParticipantId = null, reason = 'removed_by_host', expiresAt }) {
  if (!roomId || !identityHash) {
    throw new Error('roomId and identityHash are required to block an identity.')
  }

  const normalizedRoomId = roomId.toUpperCase().trim()
  const ttlDate = expiresAt instanceof Date ? expiresAt : new Date(Date.now() + ROOM_TTL_MS)

  const block = await RoomBlock.findOneAndUpdate(
    { roomId: normalizedRoomId, identityHash },
    {
      $setOnInsert: {
        roomId: normalizedRoomId,
        identityHash,
        blockedByParticipantId: blockedByParticipantId || null,
        reason: reason || 'removed_by_host',
        createdAt: new Date(),
        expiresAt: ttlDate,
      },
    },
    { upsert: true, returnDocument: 'after' }
  )

  return block
}

/**
 * Removes all block records for a room (e.g. when room is deleted).
 *
 * @param {string} roomId
 * @returns {Promise<number>} Number of removed blocks
 */
async function removeRoomBlocks(roomId) {
  if (!roomId) return 0
  const normalizedRoomId = roomId.toUpperCase().trim()
  const result = await RoomBlock.deleteMany({ roomId: normalizedRoomId })
  return result.deletedCount || 0
}

module.exports = {
  ROOM_TTL_MS,
  isBlocked,
  blockIdentity,
  removeRoomBlocks,
}

const mongoose = require('mongoose')

/**
 * RoomBlock model — persists room-specific participant bans.
 *
 * Scoped by roomId + identityHash:
 * - When User X is removed from Room A, only the (Room A + Hash X) record is created.
 * - User X is blocked from Room A, but remains completely free to join Room B, Room C, etc.
 *
 * Compound unique index { roomId: 1, identityHash: 1 }:
 * - Guarantees idempotency and prevents duplicate block records.
 *
 * TTL index on expiresAt:
 * - MongoDB automatically purges expired block records aligned with the 24-hour room lifespan.
 */
const roomBlockSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    index: true,
  },
  identityHash: {
    type: String,
    required: true,
    index: true,
  },
  blockedByParticipantId: {
    type: String,
    default: null,
  },
  reason: {
    type: String,
    default: 'removed_by_host',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
})

// Compound unique index ensuring one block per identity per room
roomBlockSchema.index({ roomId: 1, identityHash: 1 }, { unique: true })

// TTL index: MongoDB auto-removes expired blocks
roomBlockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const RoomBlock = mongoose.model('RoomBlock', roomBlockSchema)
module.exports = RoomBlock

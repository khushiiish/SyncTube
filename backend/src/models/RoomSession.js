const mongoose = require('mongoose')

/**
 * RoomSession model — server-authoritative active room session registry.
 *
 * Guarantees that an authenticated user (by clerkUserId) can have
 * at most ONE active session in a given room across any device or browser.
 *
 * Scoped by roomId + userId:
 * - User X in Room A: at most ONE active document.
 * - User X in Room B: completely independent and allowed.
 *
 * Compound unique index on { roomId: 1, userId: 1 } with partialFilterExpression: { status: 'active' }:
 * - Database-level atomic guarantee against concurrent joins across devices.
 */
const roomSessionSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    index: true,
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  identityHash: {
    type: String,
    required: true,
    index: true,
  },
  sessionId: {
    type: String,
    required: true,
    index: true,
  },
  socketId: {
    type: String,
    default: null,
  },
  tabId: {
    type: String,
    default: null,
  },
  deviceInfo: {
    type: String,
    default: 'Unknown Device',
  },
  status: {
    type: String,
    enum: ['active', 'terminated', 'replaced'],
    default: 'active',
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastActiveAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
})

// Atomic constraint: At most one 'active' session per user per room
roomSessionSchema.index(
  { roomId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' },
  }
)

// TTL index: auto-purged by MongoDB
roomSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const RoomSession = mongoose.model('RoomSession', roomSessionSchema)
module.exports = RoomSession

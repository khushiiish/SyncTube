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

/**
 * Automatically repairs legacy or erroneous indexes on startup.
 * Specifically drops any unique constraint on sessionId_1 to allow
 * the same browser session ID to be reused across rooms or after session termination.
 */
RoomSession.repairIndexes = async function() {
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) return
    const collection = mongoose.connection.collection('roomsessions')
    const indexes = await collection.indexes()
    const legacySessionIdx = indexes.find(idx => idx.name === 'sessionId_1' && idx.unique)
    if (legacySessionIdx) {
      console.log('[RoomSession] Dropping erroneous unique index on sessionId_1...')
      await collection.dropIndex('sessionId_1')
      await collection.createIndex({ sessionId: 1 })
      console.log('[RoomSession] Successfully replaced with non-unique sessionId index.')
    }
  } catch (err) {
    // Ignore NamespaceNotFound (code 26) when collection hasn't been created yet
    if (err.code !== 26 && !err.message?.includes('ns not found')) {
      console.warn('[RoomSession] Index repair notice:', err.message)
    }
  }
}

module.exports = RoomSession

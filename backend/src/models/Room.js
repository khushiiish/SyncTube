const mongoose = require('mongoose')

/**
 * Room model — the central data structure.
 *
 * Architecture decision: participants are embedded in the Room document
 * (not a separate collection) because they are always accessed together
 * with the room. This avoids joins and reduces latency for sync operations.
 *
 * TTL: Rooms expire 24 hours after creation to keep the database clean.
 */

const participantSchema = new mongoose.Schema({
  socketId:  { type: String, required: true },
  username:  { type: String, required: true, trim: true },
  role:      { type: String, enum: ['host', 'moderator', 'participant', 'viewer'], default: 'participant' },
  joinedAt:  { type: Date, default: Date.now },
  status:    { type: String, enum: ['online', 'buffering', 'offline'], default: 'online' },
}, { _id: false })

const videoStateSchema = new mongoose.Schema({
  videoId:     { type: String, default: null },
  title:       { type: String, default: '' },
  isPlaying:   { type: Boolean, default: false },
  currentTime: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now },
}, { _id: false })

const queueItemSchema = new mongoose.Schema({
  videoId:   { type: String, required: true },
  title:     { type: String, required: true },
  thumbnail: { type: String, default: '' },
  duration:  { type: Number, default: 0 },
  addedBy:   { type: String, required: true },
  addedAt:   { type: Date, default: Date.now },
})

const roomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  },
  roomName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 60,
  },
  hostSocketId: {
    type: String,
    default: null,
  },
  participants: [participantSchema],
  videoState:   { type: videoStateSchema, default: () => ({}) },
  queue:        [queueItemSchema],

  // TTL: auto-delete documents 24 hours after creation
  createdAt: { type: Date, default: Date.now, expires: 86400 },
})

// Virtual: participant count
roomSchema.virtual('participantCount').get(function () {
  return this.participants.length
})

// Helper: find participant by socketId
roomSchema.methods.findParticipant = function (socketId) {
  return this.participants.find(p => p.socketId === socketId)
}

// Helper: check if socketId has a given role
roomSchema.methods.hasRole = function (socketId, role) {
  const p = this.findParticipant(socketId)
  if (!p) return false
  if (Array.isArray(role)) return role.includes(p.role)
  return p.role === role
}

const Room = mongoose.model('Room', roomSchema)
module.exports = Room

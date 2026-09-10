const mongoose = require('mongoose')

/**
 * Room model — the central data structure.
 *
 * Phase 4 Architecture:
 * - Persistent chat history for both text and voice messages (capped at 250 in MongoDB).
 * - Voice messages store Cloudinary metadata (url, duration, bytes, mimeType).
 * - Internal Cloudinary publicId is omitted from safe client serialization.
 * - Sockets represent transient connections; participantId is stable person identity.
 * - Block list (blockedParticipants) enforces room-level rejoin bans.
 *
 * TTL: Rooms expire 24 hours after creation to keep the database clean.
 */

const participantSchema = new mongoose.Schema({
  participantId:   { type: String, required: true },
  identityHash:    { type: String, required: true },
  clerkUserId:     { type: String, default: null, index: true },
  username:        { type: String, required: true, trim: true },
  role:            { type: String, enum: ['host', 'moderator', 'participant', 'viewer'], default: 'participant' },
  socketIds:       [{ type: String }],
  primarySocketId: { type: String, default: null },
  activeTabId:     { type: String, default: null },
  activeSessionId: { type: String, default: null },
  joinedAt:        { type: Date, default: Date.now },
  status:          { type: String, enum: ['online', 'reconnecting', 'offline', 'buffering'], default: 'online' },
  // Backward-compatibility bridge for any old Phase 2 documents
  socketId:        { type: String, default: null },
}, { _id: false })

const blockedParticipantSchema = new mongoose.Schema({
  identityHash:           { type: String, required: true },
  blockedAt:              { type: Date, default: Date.now },
  blockedByParticipantId: { type: String, default: null },
}, { _id: false })

const videoStateSchema = new mongoose.Schema({
  videoId:     { type: String, default: null },
  title:       { type: String, default: '' },
  isPlaying:   { type: Boolean, default: false },
  currentTime: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now },
}, { _id: false })

const queueItemSchema = new mongoose.Schema({
  videoId:              { type: String, required: true },
  title:                { type: String, required: true },
  thumbnail:            { type: String, default: '' },
  duration:             { type: Number, default: 0 },
  addedBy:              { type: String, required: true },
  addedByParticipantId: { type: String, default: null },
  addedAt:              { type: Date, default: Date.now },
})

const chatMessageSchema = new mongoose.Schema({
  messageId:     { type: String, required: true },
  type:          { type: String, enum: ['text', 'voice'], required: true },
  participantId: { type: String, required: true },
  username:      { type: String, required: true, trim: true },
  text:          { type: String, default: null },
  audio: {
    url:      { type: String, default: null },
    publicId: { type: String, default: null },
    duration: { type: Number, default: null },
    mimeType: { type: String, default: null },
    bytes:    { type: Number, default: null },
  },
  createdAt:     { type: Date, default: Date.now },
}, { _id: false })

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
  hostParticipantId: {
    type: String,
    default: null,
  },
  // Backward-compatibility bridge
  hostSocketId: {
    type: String,
    default: null,
  },
  createdByClerkUserId: {
    type: String,
    default: null,
    index: true,
  },
  participants:        [participantSchema],
  blockedParticipants: [blockedParticipantSchema],
  membershipVersion:   { type: Number, default: 0 },
  videoState:          { type: videoStateSchema, default: () => ({}) },
  queue:               [queueItemSchema],
  chatMessages:        [chatMessageSchema],

  // TTL: auto-delete documents 24 hours after creation
  createdAt: { type: Date, default: Date.now, expires: 86400 },
})

// Virtual: participant count (1 per person, regardless of open tabs)
roomSchema.virtual('participantCount').get(function () {
  return this.participants.length
})

// Helper: find participant by stable participantId
roomSchema.methods.findParticipantById = function (participantId) {
  if (!participantId) return null
  return this.participants.find(p => p.participantId === participantId) || null
}

// Helper: find participant by active socketId (checks socketIds array, primarySocketId, and legacy socketId)
roomSchema.methods.findParticipantBySocket = function (socketId) {
  if (!socketId) return null
  return this.participants.find(p => {
    if (p.socketIds && p.socketIds.includes(socketId)) return true
    if (p.primarySocketId === socketId) return true
    if (p.socketId === socketId) return true
    return false
  }) || null
}

// Helper: find participant by identityHash
roomSchema.methods.findParticipantByIdentityHash = function (identityHash) {
  if (!identityHash) return null
  return this.participants.find(p => p.identityHash === identityHash) || null
}

// Helper: check if a socket has a given role
roomSchema.methods.hasRoleForSocket = function (socketId, role) {
  const p = this.findParticipantBySocket(socketId)
  if (!p) return false
  if (Array.isArray(role)) return role.includes(p.role)
  return p.role === role
}

// Helper: check if a participantId has a given role
roomSchema.methods.hasRoleForParticipant = function (participantId, role) {
  const p = this.findParticipantById(participantId)
  if (!p) return false
  if (Array.isArray(role)) return role.includes(p.role)
  return p.role === role
}

// Helper: check if an identityHash is on the room's blocked list
roomSchema.methods.isIdentityBlocked = function (identityHash) {
  if (!this.blockedParticipants || !identityHash) return false
  return this.blockedParticipants.some(b => b.identityHash === identityHash)
}

// Helper: safe participant serializer (omits identityHash, socketIds, primarySocketId)
roomSchema.methods.toSafeParticipant = function (participant) {
  if (!participant) return null
  return {
    participantId: participant.participantId || participant.socketId,
    username:      participant.username,
    role:          participant.role,
    status:        participant.status,
    joinedAt:      participant.joinedAt,
  }
}

// Helper: safe serialization for all participants
roomSchema.methods.toSafeParticipants = function () {
  return this.participants.map(p => this.toSafeParticipant(p))
}

// Helper: safe chat message serializer (omits internal publicId)
roomSchema.methods.toSafeChatMessage = function (msg) {
  if (!msg) return null
  return {
    id:            msg.messageId, // compatibility alias
    messageId:     msg.messageId,
    type:          msg.type,
    participantId: msg.participantId,
    username:      msg.username,
    text:          msg.text,
    audio: msg.type === 'voice' && msg.audio ? {
      url:      msg.audio.url,
      duration: msg.audio.duration,
      mimeType: msg.audio.mimeType,
      bytes:    msg.audio.bytes,
    } : null,
    createdAt:     msg.createdAt,
    timestamp:     msg.createdAt ? new Date(msg.createdAt).toISOString() : new Date().toISOString(),
  }
}

// Helper: safe serialization for all chat messages
roomSchema.methods.toSafeChatMessages = function () {
  if (!this.chatMessages) return []
  return this.chatMessages.map(m => this.toSafeChatMessage(m))
}

// Backward-compatibility bridge
roomSchema.methods.findParticipant = function (socketId) {
  return this.findParticipantBySocket(socketId)
}

roomSchema.methods.hasRole = function (socketId, role) {
  return this.hasRoleForSocket(socketId, role)
}

const Room = mongoose.model('Room', roomSchema)
module.exports = Room

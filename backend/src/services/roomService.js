const Room = require('../models/Room')
const { generateRoomId } = require('../utils/generateRoomId')
const { nanoid } = require('nanoid')
const crypto = require('crypto')
const voiceCleanupService = require('./voiceCleanupService')

/**
 * roomService — business logic layer.
 * Controllers and socket handlers call these functions.
 * Keeps DB logic out of routes and socket handlers.
 *
 * Phase 3 Architecture:
 * - Participants are identified by stable participantId and identityHash.
 * - Same identity attaches to existing participant, adding socketId to participant.socketIds.
 * - Disconnects remove socketIds; leave finalization only occurs when all sockets disconnect (post-grace).
 * - Kicking atomically records identityHash in room.blockedParticipants.
 */

/**
 * Create a new room.
 */
async function createRoom({ username, roomName, createdByClerkUserId }) {
  let roomId, exists
  do {
    roomId = generateRoomId()
    exists = await Room.exists({ roomId })
  } while (exists)

  const room = new Room({
    roomId,
    roomName: roomName.trim(),
    createdByClerkUserId: createdByClerkUserId || null,
    participants: [],
    blockedParticipants: [],
    videoState: {
      videoId: null,
      isPlaying: false,
      currentTime: 0,
    },
    queue: [],
  })

  await room.save()
  return room
}

/**
 * Find and validate a room by ID.
 */
async function findRoom(roomId) {
  const room = await Room.findOne({ roomId: roomId.toUpperCase() })
  if (!room) throw new Error('Room not found or has expired.')
  return room
}

/**
 * Join or attach participant to a room.
 *
 * If a participant with the same identityHash already exists:
 *   - Attaches socketId to existing participant.socketIds
 *   - Preserves canonical username and current role
 *   - Returns isNewParticipant: false
 *
 * If participant does not exist:
 *   - Checks if identityHash is on room.blockedParticipants -> returns blocked: true
 *   - Assigns role ('host' if verified creator or first participant in legacy room)
 *   - Generates stable participantId
 *   - Returns isNewParticipant: true
 *
 * @param {string} roomId
 * @param {Object} params
 * @param {string} params.socketId
 * @param {string} params.username
 * @param {string} params.identityHash
 * @param {string|null} [params.clerkUserId]
 */
async function joinOrAttachParticipant(roomId, { socketId, username, identityHash, clerkUserId }) {
  const room = await Room.findOne({ roomId: roomId.toUpperCase() })
  if (!room) throw new Error('Room not found.')

  // 1. Check if identity is blocked from this room
  if (room.isIdentityBlocked(identityHash)) {
    return { room, participant: null, isNewParticipant: false, isPrimary: false, blocked: true }
  }

  // 2. Check if a participant with this identity already exists (same user in another tab or reconnect)
  let participant = room.findParticipantByIdentityHash(identityHash)

  if (participant) {
    // Attach current connection to existing participant
    if (!participant.socketIds) participant.socketIds = []
    if (!participant.socketIds.includes(socketId)) {
      participant.socketIds.push(socketId)
    }

    // Designate primary socket if not set or invalid
    if (!participant.primarySocketId || !participant.socketIds.includes(participant.primarySocketId)) {
      participant.primarySocketId = socketId
    }

    participant.status = 'online'

    // If host, update room.hostSocketId to current primary
    if (participant.role === 'host') {
      room.hostParticipantId = participant.participantId
      room.hostSocketId = participant.primarySocketId
    }

    await room.save()
    return {
      room,
      participant,
      isNewParticipant: false,
      isPrimary: participant.primarySocketId === socketId,
      blocked: false,
    }
  }

  // 3. New participant entering the room
  let assignedRole = 'participant'

  if (room.createdByClerkUserId) {
    // Authenticated room: only verified creator receives host role upon joining
    if (clerkUserId && clerkUserId === room.createdByClerkUserId) {
      assignedRole = 'host'
    } else {
      assignedRole = 'participant'
    }
  } else {
    // Legacy room or unauthenticated creation: first joiner is host
    if (room.participants.length === 0) {
      assignedRole = 'host'
    }
  }

  const participantId = `part_${nanoid(10)}`
  const newParticipant = {
    participantId,
    identityHash,
    username: username.trim().slice(0, 24),
    role: assignedRole,
    socketIds: [socketId],
    primarySocketId: socketId,
    joinedAt: new Date(),
    status: 'online',
  }

  room.participants.push(newParticipant)

  if (assignedRole === 'host') {
    room.hostParticipantId = participantId
    room.hostSocketId = socketId
  }

  await room.save()

  return {
    room,
    participant: newParticipant,
    isNewParticipant: true,
    isPrimary: true,
    blocked: false,
  }
}

/**
 * Remove a specific socket from its participant.
 * Does NOT immediately remove the participant if other sockets remain.
 *
 * @param {string} roomId
 * @param {string} socketId
 * @returns {Promise<{ room: Object, participant: Object, remainingSockets: number, newPrimarySocketId: string|null, allDisconnected: boolean }|null>}
 */
async function removeSocketFromParticipant(roomId, socketId) {
  const room = await Room.findOne({ roomId: roomId.toUpperCase() })
  if (!room) return null

  const participant = room.findParticipantBySocket(socketId)
  if (!participant) return null

  // Remove socket from participant's socketIds list
  participant.socketIds = (participant.socketIds || []).filter(id => id !== socketId)

  let newPrimarySocketId = null

  if (participant.socketIds.length > 0) {
    // Other tabs remain! Check if the disconnected socket was primary
    if (participant.primarySocketId === socketId) {
      participant.primarySocketId = participant.socketIds[0]
      newPrimarySocketId = participant.primarySocketId

      if (participant.role === 'host') {
        room.hostSocketId = participant.primarySocketId
      }
    }
    await room.save()
    return {
      room,
      participant,
      remainingSockets: participant.socketIds.length,
      newPrimarySocketId,
      allDisconnected: false,
    }
  }

  // All sockets disconnected for this participant
  participant.primarySocketId = null
  participant.status = 'reconnecting'
  await room.save()

  return {
    room,
    participant,
    remainingSockets: 0,
    newPrimarySocketId: null,
    allDisconnected: true,
  }
}

/**
 * Finalize participant leave (called after disconnect grace expires or on explicit leave of final tab).
 *
 * @param {string} roomId
 * @param {string} participantId
 * @returns {Promise<{ room: Object|null, leavingParticipant: Object|null, newHost: Object|null }>}
 */
async function finalizeParticipantLeave(roomId, participantId) {
  const room = await Room.findOne({ roomId: roomId.toUpperCase() })
  if (!room) return { room: null, leavingParticipant: null, newHost: null }

  const leavingParticipant = room.findParticipantById(participantId)
  if (!leavingParticipant) return { room, leavingParticipant: null, newHost: null }

  // Concurrency guard: if participant reconnected with active sockets, do not remove
  if (leavingParticipant.socketIds && leavingParticipant.socketIds.length > 0) {
    leavingParticipant.status = 'online'
    await room.save()
    return { room, leavingParticipant, newHost: null, cancelled: true }
  }

  // Remove participant from room
  room.participants = room.participants.filter(p => p.participantId !== participantId)

  let newHost = null

  // Transfer host if leaving participant was host
  if ((leavingParticipant.role === 'host' || room.hostParticipantId === participantId) && room.participants.length > 0) {
    room.participants[0].role = 'host'
    room.hostParticipantId = room.participants[0].participantId
    room.hostSocketId = room.participants[0].primarySocketId || room.participants[0].socketIds?.[0] || null
    newHost = room.participants[0]
  }

  // Delete empty rooms
  if (room.participants.length === 0) {
    await voiceCleanupService.cleanupRoomAssets(room.roomId)
    await Room.deleteOne({ roomId: room.roomId })
    return { room: null, leavingParticipant, newHost: null }
  }

  await room.save()
  return { room, leavingParticipant, newHost }
}

/**
 * Block an identity and remove participant from the room (Host kick action).
 *
 * @param {string} roomId
 * @param {string} targetParticipantId
 * @param {string} blockedByParticipantId
 * @returns {Promise<{ room: Object, target: Object, targetSockets: string[] }|null>}
 */
async function blockAndRemoveParticipant(roomId, targetParticipantId, blockedByParticipantId) {
  const room = await Room.findOne({ roomId: roomId.toUpperCase() })
  if (!room) return null

  const target = room.findParticipantById(targetParticipantId)
  if (!target) return null

  // Atomically add identityHash to blocked list
  if (!room.blockedParticipants) room.blockedParticipants = []
  if (!room.isIdentityBlocked(target.identityHash)) {
    room.blockedParticipants.push({
      identityHash: target.identityHash,
      blockedAt: new Date(),
      blockedByParticipantId: blockedByParticipantId || null,
    })
  }

  // Collect all active sockets for kick notification
  const targetSockets = [...(target.socketIds || [])]
  if (target.primarySocketId && !targetSockets.includes(target.primarySocketId)) {
    targetSockets.push(target.primarySocketId)
  }

  // Remove participant
  room.participants = room.participants.filter(p => p.participantId !== targetParticipantId)

  await room.save()
  return { room, target, targetSockets }
}

/**
 * Update playback state.
 */
async function updateVideoState(roomId, videoStateUpdates) {
  const room = await Room.findOneAndUpdate(
    { roomId: roomId.toUpperCase() },
    {
      $set: {
        ...Object.fromEntries(
          Object.entries(videoStateUpdates).map(([k, v]) => [`videoState.${k}`, v])
        ),
        'videoState.lastUpdated': new Date(),
      },
    },
    { returnDocument: 'after' }
  )
  return room
}

/**
 * Update a participant's role (by stable participantId).
 */
async function updateParticipantRole(roomId, targetParticipantId, role) {
  const room = await Room.findOne({ roomId: roomId.toUpperCase() })
  if (!room) throw new Error('Room not found.')

  const participant = room.findParticipantById(targetParticipantId)
  if (!participant) throw new Error('Participant not found.')

  participant.role = role

  if (role === 'host') {
    // Demote any previous host
    room.participants.forEach(p => {
      if (p.participantId !== targetParticipantId && p.role === 'host') {
        p.role = 'participant'
      }
    })
    room.hostParticipantId = targetParticipantId
    room.hostSocketId = participant.primarySocketId || participant.socketIds?.[0] || null
  }

  await room.save()
  return { room, participant }
}

/**
 * Add a video to the room's queue.
 */
async function addToQueue(roomId, item) {
  const room = await Room.findOne({ roomId: roomId.toUpperCase() })
  if (!room) throw new Error('Room not found.')

  room.queue.push(item)
  await room.save()
  return room
}

/**
 * Remove a video from the room's queue.
 */
async function removeFromQueue(roomId, queueItemId) {
  const room = await Room.findOne({ roomId: roomId.toUpperCase() })
  if (!room) throw new Error('Room not found.')

  room.queue = room.queue.filter(item => item._id.toString() !== queueItemId)
  await room.save()
  return room
}

/**
 * Clear all videos from the room's queue.
 */
async function clearQueue(roomId) {
  const room = await Room.findOne({ roomId: roomId.toUpperCase() })
  if (!room) throw new Error('Room not found.')

  room.queue = []
  await room.save()
  return room
}

/**
 * Reorder the room's queue.
 */
async function reorderQueue(roomId, newOrderIds) {
  const room = await Room.findOne({ roomId: roomId.toUpperCase() })
  if (!room) throw new Error('Room not found.')

  const orderedQueue = []
  newOrderIds.forEach(id => {
    const item = room.queue.find(q => q._id.toString() === id)
    if (item) orderedQueue.push(item)
  })

  // Safety fallback: append any items not in newOrderIds
  room.queue.forEach(q => {
    if (!newOrderIds.includes(q._id.toString())) {
      orderedQueue.push(q)
    }
  })

  room.queue = orderedQueue
  await room.save()
  return room
}

/**
 * Pop the next video from the queue and set it as playing.
 */
async function popNextVideo(roomId) {
  const room = await Room.findOne({ roomId: roomId.toUpperCase() })
  if (!room) throw new Error('Room not found.')

  if (room.queue.length === 0) {
    room.videoState.videoId = null
    room.videoState.title = ''
    room.videoState.isPlaying = false
    room.videoState.currentTime = 0
  } else {
    const nextVideo = room.queue.shift()
    room.videoState.videoId = nextVideo.videoId
    room.videoState.title = nextVideo.title
    room.videoState.isPlaying = true
    room.videoState.currentTime = 0
  }

  await room.save()
  return room
}

/**
 * Get all active rooms.
 */
async function getAllRooms() {
  return await Room.find({})
}

/**
 * Add a persistent chat message (text or voice) to a room, capping history at 250 messages.
 *
 * @param {string} roomId
 * @param {Object} messageData
 * @param {'text'|'voice'} messageData.type
 * @param {string} messageData.participantId
 * @param {string} messageData.username
 * @param {string|null} [messageData.text]
 * @param {Object|null} [messageData.audio]
 * @returns {Promise<{ room: Object, message: Object, safeMessage: Object }>}
 */
async function addChatMessage(roomId, messageData) {
  const messageId = crypto.randomUUID()
  const message = {
    messageId,
    type:          messageData.type,
    participantId: messageData.participantId,
    username:      messageData.username,
    text:          messageData.text || null,
    audio: messageData.audio ? {
      url:      messageData.audio.url,
      publicId: messageData.audio.publicId,
      duration: messageData.audio.duration || null,
      mimeType: messageData.audio.mimeType || null,
      bytes:    messageData.audio.bytes || null,
    } : null,
    createdAt: new Date(),
  }

  const room = await Room.findOneAndUpdate(
    { roomId: roomId.toUpperCase() },
    {
      $push: {
        chatMessages: {
          $each: [message],
          $slice: -250,
        },
      },
    },
    { returnDocument: 'after' }
  )

  if (!room) throw new Error('Room not found.')

  return {
    room,
    message,
    safeMessage: room.toSafeChatMessage(message),
  }
}

/**
 * Get full safe chat history for a room.
 *
 * @param {string} roomId
 * @returns {Promise<Array>}
 */
async function getChatHistory(roomId) {
  const room = await Room.findOne({ roomId: roomId.toUpperCase() })
  if (!room) return []
  return room.toSafeChatMessages()
}

/**
 * Delete a room by roomId.
 */
async function deleteRoom(roomId) {
  const normId = roomId.toUpperCase()
  await voiceCleanupService.cleanupRoomAssets(normId)
  return await Room.deleteOne({ roomId: normId })
}

/**
 * Backward compatibility wrappers
 */
async function addParticipant(roomId, { socketId, username, role = 'participant' }) {
  // Generates dummy identity for backward compatibility if called directly
  const crypto = require('crypto')
  const identityHash = crypto.createHash('sha256').update(`guest:${socketId}`).digest('hex')
  const res = await joinOrAttachParticipant(roomId, { socketId, username, identityHash })
  return res.room
}

async function removeParticipant(roomId, socketId) {
  const result = await removeSocketFromParticipant(roomId, socketId)
  if (!result) return null
  if (result.allDisconnected) {
    return await finalizeParticipantLeave(roomId, result.participant.participantId)
  }
  return { room: result.room, leavingParticipant: null, newHost: null }
}

module.exports = {
  createRoom,
  findRoom,
  joinOrAttachParticipant,
  removeSocketFromParticipant,
  finalizeParticipantLeave,
  blockAndRemoveParticipant,
  addParticipant,
  removeParticipant,
  updateVideoState,
  updateParticipantRole,
  addToQueue,
  removeFromQueue,
  clearQueue,
  reorderQueue,
  popNextVideo,
  getAllRooms,
  deleteRoom,
  addChatMessage,
  getChatHistory,
}

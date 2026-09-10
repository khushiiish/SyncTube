const Room = require('../models/Room')
const RoomBlock = require('../models/RoomBlock')
const roomBlockService = require('./roomBlockService')
const roomSessionService = require('./roomSessionService')
const { generateRoomId } = require('../utils/generateRoomId')
const { nanoid } = require('nanoid')
const crypto = require('crypto')
const voiceCleanupService = require('./voiceCleanupService')
const { withRoomLock } = require('./roomMutationLock')

/**
 * Enforces that at most ONE participant in the room has role === 'host',
 * keeping room.hostParticipantId and participant roles strictly in lockstep.
 *
 * @param {Object} room - Mongoose room document
 * @returns {Object} room
 */
function enforceSingleHostInvariant(room) {
  if (!room || !Array.isArray(room.participants) || room.participants.length === 0) {
    return room
  }

  const hosts = room.participants.filter(p => p.role === 'host')

  if (room.hostParticipantId) {
    const canonicalHost = room.findParticipantById(room.hostParticipantId)
    if (canonicalHost) {
      // Canonical host must have role 'host'
      canonicalHost.role = 'host'
      // Demote all other participants who claim to be host
      let repaired = false
      room.participants.forEach(p => {
        if (p.participantId !== room.hostParticipantId && p.role === 'host') {
          p.role = 'participant'
          repaired = true
        }
      })
      if (repaired) {
        console.warn(`[RoomInvariant] Repaired duplicate host roles in room ${room.roomId}; canonical host is ${room.hostParticipantId}`)
      }
      return room
    }
  }

  // If hostParticipantId is missing or points to a non-existent participant:
  if (hosts.length === 1) {
    // Exactly one host exists: repair hostParticipantId
    room.hostParticipantId = hosts[0].participantId
    room.hostSocketId = hosts[0].primarySocketId || hosts[0].socketIds?.[0] || null
  } else if (hosts.length > 1) {
    // Multiple hosts exist and hostParticipantId was invalid: pick earliest joined deterministically
    const sortedHosts = [...hosts].sort((a, b) => new Date(a.joinedAt || 0) - new Date(b.joinedAt || 0))
    const canonical = sortedHosts[0]
    room.hostParticipantId = canonical.participantId
    room.hostSocketId = canonical.primarySocketId || canonical.socketIds?.[0] || null

    room.participants.forEach(p => {
      if (p.participantId !== canonical.participantId && p.role === 'host') {
        p.role = 'participant'
      }
    })
    console.warn(`[RoomInvariant] Repaired ${hosts.length} duplicate hosts in room ${room.roomId}; resolved to earliest host ${canonical.participantId}`)
  }

  return room
}

/**
 * roomService — business logic layer.
 * Controllers and socket handlers call these functions.
 * Keeps DB logic out of routes and socket handlers.
 *
 * Phase 4 Architecture:
 * - Single-collection RoomBlock enforces room-scoped participant bans.
 * - Single-active-tab policy per participant identity with authoritative takeover.
 * - Room mutation lock serializes join, takeover, and kick mutations per room.
 */

/**
 * Create a new room.
 * Ensures generated roomId has no collisions with active rooms or unexpired room blocks.
 */
async function createRoom({ username, roomName, createdByClerkUserId }) {
  let roomId, exists
  do {
    roomId = generateRoomId()
    const roomExists = await Room.exists({ roomId })
    const blockExists = await RoomBlock.exists({ roomId })
    exists = roomExists || blockExists
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
 * Checks:
 * 1. RoomBlock check: If identity is blocked from this specific room -> returns blocked: true.
 * 2. Active Tab check:
 *    - If participant exists and is active in another tab (activeTabId !== tabId and has active sockets):
 *      - If takeover !== true -> returns activeElsewhere: true.
 *      - If takeover === true -> replaces active connection, preserves participantId/role, returns takeover: true.
 *    - If same tab reconnect or no active sockets -> replaces socket seamlessly.
 * 3. New participant -> creates stable participant with activeTabId, assigns role.
 *
 * @param {string} roomId
 * @param {Object} params
 * @param {string} params.socketId
 * @param {string} params.username
 * @param {string} params.identityHash
 * @param {string|null} [params.clerkUserId]
 * @param {string|null} [params.tabId]
 * @param {boolean} [params.takeover=false]
 * @param {string[]} [params.activeSockets=[]] - Currently connected socket IDs in the server
 */
async function joinOrAttachParticipant(roomId, {
  socketId,
  username,
  identityHash,
  clerkUserId,
  tabId = null,
  sessionId = null,
  deviceInfo = null,
  takeover = false,
  activeSockets = [],
}) {
  const room = await Room.findOne({ roomId: roomId.toUpperCase() })
  if (!room) throw new Error('Room not found.')

  const roomExpiresAt = new Date(room.createdAt.getTime() + roomBlockService.ROOM_TTL_MS)

  // 1. Authoritative RoomBlock check (scoped by roomId + identityHash)
  let blocked = await roomBlockService.isBlocked(room.roomId, identityHash)

  // Legacy fallback: check embedded blockedParticipants in existing rooms
  if (!blocked && room.isIdentityBlocked(identityHash)) {
    await roomBlockService.blockIdentity({
      roomId: room.roomId,
      identityHash,
      expiresAt: roomExpiresAt,
    })
    blocked = true
  }

  if (blocked) {
    return {
      room,
      participant: null,
      isNewParticipant: false,
      isPrimary: false,
      blocked: true,
      activeElsewhere: false,
      takeover: false,
    }
  }

  // 2. Server-Authoritative Multi-Device Room Session Check
  const effectiveUserId = clerkUserId || identityHash
  let sessionResult = null
  let replacedSocketId = null

  if (takeover) {
    sessionResult = await roomSessionService.switchSession({
      roomId: room.roomId,
      userId: effectiveUserId,
      identityHash,
      newSessionId: sessionId || crypto.randomUUID(),
      newSocketId: socketId,
      newTabId: tabId,
      newDeviceInfo: deviceInfo,
      expiresAt: roomExpiresAt,
    })
    replacedSocketId = sessionResult.replacedSocketId
  } else {
    sessionResult = await roomSessionService.registerOrVerifySession({
      roomId: room.roomId,
      userId: effectiveUserId,
      identityHash,
      sessionId: sessionId || tabId || socketId,
      socketId,
      tabId,
      deviceInfo,
      expiresAt: roomExpiresAt,
      activeSockets,
    })

    if (sessionResult.isDuplicate) {
      return {
        room,
        participant: null,
        isNewParticipant: false,
        isPrimary: false,
        blocked: false,
        activeElsewhere: true,
        takeover: false,
        activeSession: sessionResult.activeSession,
      }
    }
  }

  // 3. Attach or create participant in Room document
  let participant = room.findParticipantByIdentityHash(identityHash)

  if (participant) {
    if (takeover) {
      const previousSocketIds = [...(participant.socketIds || [])]
      if (replacedSocketId && !previousSocketIds.includes(replacedSocketId)) {
        previousSocketIds.push(replacedSocketId)
      }

      participant.clerkUserId = effectiveUserId
      participant.activeSessionId = sessionResult.newSession.sessionId
      participant.activeTabId = tabId
      participant.socketIds = [socketId]
      participant.primarySocketId = socketId
      participant.status = 'online'

      if (participant.role === 'host') {
        room.hostParticipantId = participant.participantId
        room.hostSocketId = socketId
      }

      await room.save()

      return {
        room,
        participant,
        isNewParticipant: false,
        isPrimary: true,
        blocked: false,
        activeElsewhere: false,
        takeover: true,
        previousSocketIds,
      }
    }

    // Normal reconnect / recovery (same device/tab)
    participant.clerkUserId = effectiveUserId
    if (sessionResult.session?.sessionId || sessionId) {
      participant.activeSessionId = sessionResult.session?.sessionId || sessionId
    }
    if (tabId) {
      participant.activeTabId = tabId
    }

    if (!participant.socketIds) participant.socketIds = []
    if (!participant.socketIds.includes(socketId)) {
      participant.socketIds.push(socketId)
    }

    participant.primarySocketId = socketId
    participant.status = 'online'

    if (participant.role === 'host') {
      room.hostParticipantId = participant.participantId
      room.hostSocketId = socketId
    }

    await room.save()

    return {
      room,
      participant,
      isNewParticipant: false,
      isPrimary: true,
      blocked: false,
      activeElsewhere: false,
      takeover: false,
    }
  }

  // 4. New participant entering the room
  let assignedRole = 'participant'

  if (room.createdByClerkUserId) {
    if (clerkUserId && clerkUserId === room.createdByClerkUserId) {
      assignedRole = 'host'
    } else {
      assignedRole = 'participant'
    }
  } else {
    if (room.participants.length === 0) {
      assignedRole = 'host'
    }
  }

  const participantId = `part_${nanoid(10)}`
  const newParticipant = {
    participantId,
    identityHash,
    clerkUserId: effectiveUserId,
    activeSessionId: (sessionResult.newSession || sessionResult.session)?.sessionId || sessionId,
    username: username.trim().slice(0, 24),
    role: assignedRole,
    socketIds: [socketId],
    primarySocketId: socketId,
    activeTabId: tabId,
    joinedAt: new Date(),
    status: 'online',
  }

  room.participants.push(newParticipant)

  if (assignedRole === 'host') {
    room.hostParticipantId = participantId
    room.hostSocketId = socketId
  }

  enforceSingleHostInvariant(room)
  room.membershipVersion = (room.membershipVersion || 0) + 1

  await room.save()

  return {
    room,
    participant: newParticipant,
    isNewParticipant: true,
    isPrimary: true,
    blocked: false,
    activeElsewhere: false,
    takeover: false,
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
  return await withRoomLock(roomId, async () => {
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

    // Terminate session in roomSessionService
    if (leavingParticipant.clerkUserId) {
      await roomSessionService.terminateSession(room.roomId, leavingParticipant.clerkUserId)
    }

    // Delete empty rooms
    if (room.participants.length === 0) {
      await voiceCleanupService.cleanupRoomAssets(room.roomId)
      await roomBlockService.removeRoomBlocks(room.roomId)
      await roomSessionService.cleanupRoomSessions(room.roomId)
      await Room.deleteOne({ roomId: room.roomId })
      return { room: null, leavingParticipant, newHost: null }
    }

    enforceSingleHostInvariant(room)
    room.membershipVersion = (room.membershipVersion || 0) + 1

    await room.save()
    return { room, leavingParticipant, newHost }
  })
}

/**
 * Block an identity and remove participant from the room (Host kick action).
 *
 * CRITICAL ORDER OF OPERATIONS:
 * 1. Persist the RoomBlock record FIRST to eliminate the rejoin race window.
 * 2. Only after block is saved, remove participant from room.participants.
 * 3. Return target and its active sockets for immediate KICKED eviction.
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

  // 1. CREATE RoomBlock RECORD FIRST in dedicated collection
  const roomExpiresAt = new Date(room.createdAt.getTime() + roomBlockService.ROOM_TTL_MS)
  await roomBlockService.blockIdentity({
    roomId: room.roomId,
    identityHash: target.identityHash,
    blockedByParticipantId: blockedByParticipantId || null,
    reason: 'removed_by_host',
    expiresAt: roomExpiresAt,
  })

  // Collect all active sockets for kick notification
  const targetSockets = [...(target.socketIds || [])]
  if (target.primarySocketId && !targetSockets.includes(target.primarySocketId)) {
    targetSockets.push(target.primarySocketId)
  }

  // 2. Remove participant from Room
  room.participants = room.participants.filter(p => p.participantId !== targetParticipantId)

  // Transfer host if kicked participant was host
  if (room.hostParticipantId === targetParticipantId && room.participants.length > 0) {
    room.participants[0].role = 'host'
    room.hostParticipantId = room.participants[0].participantId
    room.hostSocketId = room.participants[0].primarySocketId || room.participants[0].socketIds?.[0] || null
  }

  enforceSingleHostInvariant(room)
  room.membershipVersion = (room.membershipVersion || 0) + 1

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
 * Atomically transfers host role from current host to target participant in a single locked mutation.
 *
 * @param {string} roomId
 * @param {string} currentHostParticipantId
 * @param {string} targetParticipantId
 * @returns {Promise<{ room: Object, oldHost: Object|null, newHost: Object }>}
 */
async function transferHost(roomId, currentHostParticipantId, targetParticipantId) {
  return await withRoomLock(roomId, async () => {
    const room = await Room.findOne({ roomId: roomId.toUpperCase() })
    if (!room) throw new Error('Room not found.')

    const target = room.findParticipantById(targetParticipantId)
    if (!target) throw new Error('Target participant not found.')

    const oldHost = (currentHostParticipantId ? room.findParticipantById(currentHostParticipantId) : null) ||
      room.participants.find(p => p.role === 'host' && p.participantId !== targetParticipantId) || null

    if (currentHostParticipantId && targetParticipantId === currentHostParticipantId) {
      return { room, oldHost: target, newHost: target }
    }

    // Demote all participants whose role is 'host'
    room.participants.forEach(p => {
      if (p.role === 'host') {
        p.role = 'participant'
      }
    })

    // Promote target
    target.role = 'host'
    room.hostParticipantId = target.participantId
    room.hostSocketId = target.primarySocketId || target.socketIds?.[0] || null

    enforceSingleHostInvariant(room)
    room.membershipVersion = (room.membershipVersion || 0) + 1

    await room.save()
    return { room, oldHost, newHost: target }
  })
}

/**
 * Update a participant's role (by stable participantId).
 */
async function updateParticipantRole(roomId, targetParticipantId, role) {
  return await withRoomLock(roomId, async () => {
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

    enforceSingleHostInvariant(room)
    room.membershipVersion = (room.membershipVersion || 0) + 1

    await room.save()
    return { room, participant }
  })
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
  await roomBlockService.removeRoomBlocks(normId)
  await roomSessionService.cleanupRoomSessions(normId)
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
  transferHost,
  enforceSingleHostInvariant,
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

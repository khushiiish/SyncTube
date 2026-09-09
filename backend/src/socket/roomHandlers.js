const mongoose = require('mongoose')
const { nanoid } = require('nanoid')
const roomService = require('../services/roomService')
const emailService = require('../services/emailService')
const { validateEmail } = require('../utils/validateEmail')
const { checkAndRecordInvite, rollbackInvite } = require('../services/inviteRateLimiter')
const { deriveIdentity } = require('../utils/identityService')
const disconnectGraceManager = require('../services/disconnectGraceManager')
const { uploadAudio, deleteAudio } = require('../services/voiceStorageService')
const { checkAndRecordVoice } = require('../services/voiceRateLimiter')
const { checkAndRecordChat } = require('../services/chatRateLimiter')
const { checkControlRate, clearControlRate } = require('../services/videoRateLimiter')
const { recordVoiceAsset } = require('../services/voiceCleanupService')
const { isCloudinaryConfigured } = require('../config/cloudinary')

/**
 * Socket event constants — single source of truth for event names.
 * Must match the frontend's EVENTS object in socketService.js.
 */
const EVENTS = {
  JOIN_ROOM:                  'join_room',
  LEAVE_ROOM:                 'leave_room',
  PLAY:                       'play',
  PAUSE:                      'pause',
  SEEK:                       'seek',
  CHANGE_VIDEO:               'change_video',
  ASSIGN_ROLE:                'assign_role',
  REMOVE_PARTICIPANT:         'remove_participant',
  TRANSFER_HOST:              'transfer_host',
  SEND_CHAT:                  'send_chat',
  SEND_VOICE_MESSAGE:         'send_voice_message',
  SEND_EMAIL_INVITE:          'send_email_invite',
  SYNC_REQUEST:               'sync_request',
  QUEUE_ADD:                  'queue_add',
  QUEUE_REMOVE:               'queue_remove',
  QUEUE_REORDER:              'queue_reorder',
  QUEUE_CLEAR:                'queue_clear',
  QUEUE_NEXT:                 'queue_next',
  QUEUE_SYNC:                 'queue_sync',
  USER_JOINED:                'user_joined',
  USER_LEFT:                  'user_left',
  SYNC_STATE:                 'sync_state',
  ROLE_UPDATED:               'role_updated',
  KICKED:                     'kicked',
  CHAT_MESSAGE:               'chat_message',
  ERROR:                      'error',
  PRIMARY_CONNECTION_CHANGED: 'primary_connection_changed',
}

/**
 * Validates that a socket is active and joined to the requested room.
 * Prevents cross-room action spoofing.
 */
function isSocketInRoom(socket, roomId) {
  if (!socket || !socket.roomId || !roomId) return false
  return socket.roomId.toUpperCase() === roomId.toUpperCase()
}

/**
 * registerRoomHandlers — attaches all room-scoped socket events.
 *
 * Phase 3 Security & Identity Architecture:
 * - Sockets represent transient connections, not user identities.
 * - Every client action maps socket.id to an active participant in MongoDB.
 * - Multi-tab connections belonging to the same participant share permissions, host state, and chat identity.
 * - Automatic playback heartbeats are sent solely by the primarySocketId.
 * - Kicked participants have their identityHash added to room.blockedParticipants; all open tabs are booted.
 *
 * @param {import('socket.io').Socket} socket
 * @param {import('socket.io').Server} io
 */
function registerRoomHandlers(socket, io) {
  // Check database status for all client-initiated events
  socket.use(([event, ...args], next) => {
    if (event !== 'disconnect' && mongoose.connection.readyState !== 1) {
      const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null
      if (cb) {
        cb({ success: false, code: 'DB_OFFLINE', message: 'Database connection is currently offline. Please ensure MongoDB is started.' })
      }
      socket.emit(EVENTS.ERROR, { message: 'Database connection is currently offline. Please ensure MongoDB is started.' })
      return
    }
    next()
  })

  /* -------------------------------------------------------
   * join_room
   * -------------------------------------------------------
   * 1. Validate inputs and derive server-side identityHash (Clerk or Guest UUID)
   * 2. Check room block list
   * 3. Attach socket to existing participant or create new participant
   * 4. Cancel any pending disconnect grace timer
   * 5. Respond with structured ack callback
   */
  socket.on(EVENTS.JOIN_ROOM, async (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {}
    const { roomId, username, guestDeviceId, clerkToken } = payload || {}

    try {
      if (!roomId || typeof roomId !== 'string') {
        return ack({ success: false, code: 'INVALID_ROOM', message: 'Room ID is required.' })
      }
      if (!username || typeof username !== 'string' || !username.trim()) {
        return ack({ success: false, code: 'INVALID_USERNAME', message: 'Username is required.' })
      }

      // 1. Derive authoritative identity hash
      let identity
      try {
        identity = await deriveIdentity({ guestDeviceId, clerkToken })
      } catch (authErr) {
        return ack({
          success: false,
          code: authErr.code || 'INVALID_AUTH',
          message: authErr.message || 'Identity verification failed.',
        })
      }

      // 2. Attach or create participant in room
      const result = await roomService.joinOrAttachParticipant(roomId, {
        socketId: socket.id,
        username: username.trim(),
        identityHash: identity.identityHash,
        clerkUserId: identity.clerkUserId,
      })

      if (result.blocked) {
        return ack({
          success: false,
          code: 'BANNED_FROM_ROOM',
          message: 'You were removed from this room and cannot rejoin.',
        })
      }

      const { room, participant, isNewParticipant, isPrimary } = result

      // 3. Cancel any pending disconnect grace period for this participant
      disconnectGraceManager.cancelDisconnectGrace(room.roomId, participant.participantId)

      // 4. Attach socket metadata
      socket.roomId = room.roomId
      socket.participantId = participant.participantId
      socket.username = participant.username
      socket.data = {
        roomId: room.roomId,
        participantId: participant.participantId,
        username: participant.username,
      }
      socket.join(room.roomId)

      // 5. Broadcast user_joined ONLY if this is a genuinely new participant
      if (isNewParticipant) {
        socket.to(room.roomId).emit(EVENTS.USER_JOINED, {
          participant: room.toSafeParticipant(participant),
        })
        io.emit('rooms_updated')
      }

      // 6. Send sync_state (full room state) to the newly connected socket
      socket.emit(EVENTS.SYNC_STATE, {
        room: {
          roomId:            room.roomId,
          roomName:          room.roomName,
          hostParticipantId: room.hostParticipantId,
          hostSocketId:      room.hostSocketId,
        },
        participants:             room.toSafeParticipants(),
        videoState:               room.videoState,
        queue:                    room.queue,
        chatMessages:             room.toSafeChatMessages(),
        currentUserRole:          participant.role,
        currentUserParticipantId: participant.participantId,
        isPrimaryConnection:      isPrimary,
      })

      console.log(`[Socket] ${participant.username} (${socket.id}) attached to ${participant.participantId} in room ${room.roomId} (new: ${isNewParticipant}, primary: ${isPrimary})`)

      return ack({
        success: true,
        participantId:       participant.participantId,
        username:            participant.username,
        role:                participant.role,
        isPrimaryConnection: isPrimary,
      })
    } catch (err) {
      console.error('[Socket] join_room error:', err.message)
      return ack({ success: false, code: 'JOIN_ERROR', message: err.message || 'Failed to join room.' })
    }
  })

  /* -------------------------------------------------------
   * leave_room (explicit user leave)
   * -------------------------------------------------------
   */
  socket.on(EVENTS.LEAVE_ROOM, async ({ roomId }) => {
    const targetRoomId = roomId || socket.roomId
    if (!targetRoomId) return

    try {
      const res = await roomService.removeSocketFromParticipant(targetRoomId, socket.id)
      socket.leave(targetRoomId)

      if (!res) return
      const { participant, remainingSockets, newPrimarySocketId, allDisconnected } = res

      if (!allDisconnected) {
        // Participant still has other tabs open
        if (newPrimarySocketId) {
          io.to(newPrimarySocketId).emit(EVENTS.PRIMARY_CONNECTION_CHANGED, { isPrimary: true })
        }
        return
      }

      // Final tab explicitly left — cancel any grace and finalize immediately
      disconnectGraceManager.cancelDisconnectGrace(targetRoomId, participant.participantId)
      const leaveRes = await roomService.finalizeParticipantLeave(targetRoomId, participant.participantId)
      if (!leaveRes) return

      const { leavingParticipant, newHost } = leaveRes

      if (leavingParticipant) {
        io.to(targetRoomId).emit(EVENTS.USER_LEFT, {
          participantId: leavingParticipant.participantId,
          username:      leavingParticipant.username,
        })
      }

      if (newHost) {
        io.to(targetRoomId).emit(EVENTS.ROLE_UPDATED, {
          participantId: newHost.participantId,
          role:          'host',
          username:      newHost.username,
        })
        if (newHost.primarySocketId) {
          io.to(newHost.primarySocketId).emit(EVENTS.PRIMARY_CONNECTION_CHANGED, { isPrimary: true })
        }
      }

      io.emit('rooms_updated')
    } catch (err) {
      console.error('[Socket] leave_room error:', err.message)
    }
  })

  /* -------------------------------------------------------
   * disconnect (unexpected network drop / tab close)
   * -------------------------------------------------------
   */
  socket.on('disconnect', async () => {
    clearControlRate(socket.id)
    const roomId = socket.roomId
    if (!roomId) return

    try {
      const res = await roomService.removeSocketFromParticipant(roomId, socket.id)
      if (!res) return

      const { participant, remainingSockets, newPrimarySocketId, allDisconnected } = res

      if (!allDisconnected) {
        // Other tabs remain open for this participant
        if (newPrimarySocketId) {
          io.to(newPrimarySocketId).emit(EVENTS.PRIMARY_CONNECTION_CHANGED, { isPrimary: true })
        }
        return
      }

      // All sockets disconnected for this participant — start 7-second grace timer
      disconnectGraceManager.scheduleDisconnectGrace({
        roomId,
        participantId: participant.participantId,
        graceMs: 7000,
        onExpire: async () => {
          const leaveRes = await roomService.finalizeParticipantLeave(roomId, participant.participantId)
          if (!leaveRes || leaveRes.cancelled) return

          const { leavingParticipant, newHost } = leaveRes

          if (leavingParticipant) {
            io.to(roomId).emit(EVENTS.USER_LEFT, {
              participantId: leavingParticipant.participantId,
              username:      leavingParticipant.username,
            })
          }

          if (newHost) {
            io.to(roomId).emit(EVENTS.ROLE_UPDATED, {
              participantId: newHost.participantId,
              role:          'host',
              username:      newHost.username,
            })
            if (newHost.primarySocketId) {
              io.to(newHost.primarySocketId).emit(EVENTS.PRIMARY_CONNECTION_CHANGED, { isPrimary: true })
            }
          }

          console.log(`[DisconnectGrace] Finalized leave for ${participant.username} (${participant.participantId})`)
          io.emit('rooms_updated')
        },
      })
    } catch (err) {
      console.error('[Socket] disconnect error:', err.message)
    }
  })

  /* -------------------------------------------------------
   * play — requires host or moderator
   * -------------------------------------------------------
   */
  socket.on(EVENTS.PLAY, async ({ roomId, currentTime }) => {
    try {
      if (!isSocketInRoom(socket, roomId)) return
      if (!checkControlRate(socket.id)) return

      const room = await roomService.findRoom(roomId)
      if (!room) return

      if (!room.hasRoleForSocket(socket.id, ['host', 'moderator'])) {
        socket.emit(EVENTS.ERROR, { message: 'Only the host or moderator can control playback.' })
        return
      }

      await roomService.updateVideoState(room.roomId, {
        isPlaying: true,
        currentTime: typeof currentTime === 'number' && !isNaN(currentTime) && currentTime >= 0 ? currentTime : 0,
      })

      io.to(room.roomId).emit(EVENTS.PLAY, { currentTime: currentTime ?? 0 })
    } catch (err) {
      console.error('[Socket] play error:', err.message)
    }
  })

  /* -------------------------------------------------------
   * pause — requires host or moderator
   * -------------------------------------------------------
   */
  socket.on(EVENTS.PAUSE, async ({ roomId, currentTime }) => {
    try {
      if (!isSocketInRoom(socket, roomId)) return
      if (!checkControlRate(socket.id)) return

      const room = await roomService.findRoom(roomId)
      if (!room) return

      if (!room.hasRoleForSocket(socket.id, ['host', 'moderator'])) {
        socket.emit(EVENTS.ERROR, { message: 'Only the host or moderator can control playback.' })
        return
      }

      await roomService.updateVideoState(room.roomId, {
        isPlaying: false,
        currentTime: typeof currentTime === 'number' && !isNaN(currentTime) && currentTime >= 0 ? currentTime : 0,
      })

      io.to(room.roomId).emit(EVENTS.PAUSE, { currentTime: currentTime ?? 0 })
    } catch (err) {
      console.error('[Socket] pause error:', err.message)
    }
  })

  /* -------------------------------------------------------
   * seek — requires host or moderator
   * -------------------------------------------------------
   */
  socket.on(EVENTS.SEEK, async ({ roomId, currentTime }) => {
    try {
      if (!isSocketInRoom(socket, roomId)) return
      if (!checkControlRate(socket.id)) return

      const room = await roomService.findRoom(roomId)
      if (!room) return

      if (!room.hasRoleForSocket(socket.id, ['host', 'moderator'])) {
        socket.emit(EVENTS.ERROR, { message: 'Only the host or moderator can seek.' })
        return
      }

      const validTime = typeof currentTime === 'number' && !isNaN(currentTime) && currentTime >= 0 ? currentTime : 0
      await roomService.updateVideoState(room.roomId, { currentTime: validTime })

      io.to(room.roomId).emit(EVENTS.SEEK, { currentTime: validTime })
    } catch (err) {
      console.error('[Socket] seek error:', err.message)
    }
  })

  /* -------------------------------------------------------
   * change_video — requires host or moderator
   * -------------------------------------------------------
   */
  socket.on(EVENTS.CHANGE_VIDEO, async ({ roomId, videoId, title }) => {
    try {
      if (!isSocketInRoom(socket, roomId)) return
      if (!checkControlRate(socket.id)) return

      if (!videoId || typeof videoId !== 'string' || !videoId.trim()) {
        socket.emit(EVENTS.ERROR, { message: 'Invalid video ID.' })
        return
      }

      const room = await roomService.findRoom(roomId)
      if (!room) return

      if (!room.hasRoleForSocket(socket.id, ['host', 'moderator'])) {
        socket.emit(EVENTS.ERROR, { message: 'Only the host or moderator can change the video.' })
        return
      }

      const cleanVideoId = videoId.trim().slice(0, 32)
      const cleanTitle = (title && typeof title === 'string') ? title.trim().slice(0, 150) : ''

      await roomService.updateVideoState(room.roomId, {
        videoId: cleanVideoId,
        title: cleanTitle,
        isPlaying: false,
        currentTime: 0,
      })

      io.to(room.roomId).emit(EVENTS.CHANGE_VIDEO, { videoId: cleanVideoId, title: cleanTitle })
    } catch (err) {
      console.error('[Socket] change_video error:', err.message)
    }
  })

  /* -------------------------------------------------------
   * assign_role — requires host only (targets targetParticipantId)
   * -------------------------------------------------------
   */
  socket.on(EVENTS.ASSIGN_ROLE, async ({ roomId, targetParticipantId, targetSocketId, role }) => {
    try {
      if (!isSocketInRoom(socket, roomId)) return

      const validRoles = ['moderator', 'participant', 'viewer']
      if (!validRoles.includes(role)) {
        socket.emit(EVENTS.ERROR, { message: 'Invalid role.' })
        return
      }

      const room = await roomService.findRoom(roomId)
      if (!room) return
      if (!room.hasRoleForSocket(socket.id, 'host')) {
        socket.emit(EVENTS.ERROR, { message: 'Only the host can assign roles.' })
        return
      }

      // Resolve target participant ID
      let participantId = targetParticipantId
      if (!participantId && targetSocketId) {
        participantId = room.findParticipantBySocket(targetSocketId)?.participantId
      }

      if (!participantId) {
        socket.emit(EVENTS.ERROR, { message: 'Participant not found.' })
        return
      }

      const { participant } = await roomService.updateParticipantRole(room.roomId, participantId, role)

      io.to(room.roomId).emit(EVENTS.ROLE_UPDATED, {
        participantId: participant.participantId,
        role,
        username:      participant.username,
      })
    } catch (err) {
      console.error('[Socket] assign_role error:', err.message)
      socket.emit(EVENTS.ERROR, { message: err.message })
    }
  })

  /* -------------------------------------------------------
   * transfer_host — requires host only (targets targetParticipantId)
   * -------------------------------------------------------
   */
  socket.on(EVENTS.TRANSFER_HOST, async ({ roomId, targetParticipantId, targetSocketId }) => {
    try {
      if (!isSocketInRoom(socket, roomId)) return

      const room = await roomService.findRoom(roomId)
      if (!room) return
      if (!room.hasRoleForSocket(socket.id, 'host')) {
        socket.emit(EVENTS.ERROR, { message: 'Only the host can transfer host role.' })
        return
      }

      const currentHost = room.findParticipantBySocket(socket.id)
      let newHostId = targetParticipantId
      if (!newHostId && targetSocketId) {
        newHostId = room.findParticipantBySocket(targetSocketId)?.participantId
      }

      if (!newHostId || newHostId === currentHost?.participantId) {
        socket.emit(EVENTS.ERROR, { message: 'Cannot transfer host to yourself or unknown participant.' })
        return
      }

      // Promote new host
      const { participant: newHost } = await roomService.updateParticipantRole(room.roomId, newHostId, 'host')

      // Demote old host to participant
      if (currentHost) {
        await roomService.updateParticipantRole(room.roomId, currentHost.participantId, 'participant')
      }

      // Notify room of both updates
      io.to(room.roomId).emit(EVENTS.ROLE_UPDATED, {
        participantId: newHost.participantId,
        role:          'host',
        username:      newHost.username,
      })

      if (currentHost) {
        io.to(room.roomId).emit(EVENTS.ROLE_UPDATED, {
          participantId: currentHost.participantId,
          role:          'participant',
          username:      currentHost.username,
        })
      }

      // If new host has an active primary socket, notify them
      if (newHost.primarySocketId) {
        io.to(newHost.primarySocketId).emit(EVENTS.PRIMARY_CONNECTION_CHANGED, { isPrimary: true })
      }
    } catch (err) {
      console.error('[Socket] transfer_host error:', err.message)
      socket.emit(EVENTS.ERROR, { message: err.message })
    }
  })

  /* -------------------------------------------------------
   * remove_participant — requires host only (kicks all participant connections & blocks identity)
   * -------------------------------------------------------
   */
  socket.on(EVENTS.REMOVE_PARTICIPANT, async ({ roomId, targetParticipantId, targetSocketId }) => {
    try {
      if (!isSocketInRoom(socket, roomId)) return

      const room = await roomService.findRoom(roomId)
      if (!room) return
      if (!room.hasRoleForSocket(socket.id, 'host')) {
        socket.emit(EVENTS.ERROR, { message: 'Only the host can remove participants.' })
        return
      }

      const hostParticipant = room.findParticipantBySocket(socket.id)
      let targetId = targetParticipantId
      if (!targetId && targetSocketId) {
        targetId = room.findParticipantBySocket(targetSocketId)?.participantId
      }

      if (!targetId) return
      if (hostParticipant && targetId === hostParticipant.participantId) {
        socket.emit(EVENTS.ERROR, { message: 'You cannot remove yourself.' })
        return
      }

      // Block identity and remove participant from DB
      const result = await roomService.blockAndRemoveParticipant(room.roomId, targetId, hostParticipant?.participantId)
      if (!result) return

      const { target, targetSockets } = result

      // 1. Notify and disconnect ALL sockets belonging to this participant
      targetSockets.forEach(sid => {
        io.to(sid).emit(EVENTS.KICKED, {
          roomId: room.roomId,
          reason: 'removed_by_host',
        })
        const targetSock = io.sockets.sockets.get(sid)
        if (targetSock) {
          targetSock.leave(room.roomId)
        }
      })

      // 2. Notify all remaining participants exactly once
      socket.to(room.roomId).emit(EVENTS.USER_LEFT, {
        participantId: target.participantId,
        username:      target.username,
      })

      io.emit('rooms_updated')
    } catch (err) {
      console.error('[Socket] remove_participant error:', err.message)
      socket.emit(EVENTS.ERROR, { message: err.message })
    }
  })

  /* -------------------------------------------------------
   * send_chat — identified by participantId (shared across all tabs of participant)
   * Persisted to MongoDB chatMessages (capped at 250) with abuse rate limiting
   * -------------------------------------------------------
   */
  socket.on(EVENTS.SEND_CHAT, async ({ roomId, text }) => {
    try {
      if (!isSocketInRoom(socket, roomId)) return
      if (!text?.trim() || text.length > 500) return

      const room = await roomService.findRoom(roomId)
      if (!room) return

      const participant = room.findParticipantBySocket(socket.id)
      if (!participant) return

      // Text chat rate limiting (max 20 messages per 10s per participant)
      const rateCheck = checkAndRecordChat(room.roomId, participant.participantId)
      if (!rateCheck.allowed) {
        socket.emit(EVENTS.ERROR, { message: rateCheck.message || 'You are sending messages too quickly.' })
        return
      }

      const { safeMessage } = await roomService.addChatMessage(room.roomId, {
        type:          'text',
        participantId: participant.participantId,
        username:      participant.username,
        text:          text.trim(),
      })

      io.to(room.roomId).emit(EVENTS.CHAT_MESSAGE, safeMessage)
    } catch (err) {
      console.error('[Socket] send_chat error:', err.message)
    }
  })

  /* -------------------------------------------------------
   * send_voice_message — binary audio upload to Cloudinary and room broadcast
   * -------------------------------------------------------
   */
  socket.on(EVENTS.SEND_VOICE_MESSAGE, async (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {}
    const { roomId, audioData, duration, mimeType } = payload || {}
    let uploadedPublicId = null

    try {
      if (!roomId || typeof roomId !== 'string') {
        return ack({ success: false, code: 'INVALID_ROOM', message: 'Room ID is required.' })
      }

      if (!isSocketInRoom(socket, roomId)) {
        return ack({ success: false, code: 'UNAUTHORIZED', message: 'You are not an active participant in this room.' })
      }

      // 1. Room and participant validation
      const room = await roomService.findRoom(roomId)
      if (!room) {
        return ack({ success: false, code: 'ROOM_NOT_FOUND', message: 'Room not found.' })
      }

      const participant = room.findParticipantBySocket(socket.id)
      if (!participant) {
        return ack({ success: false, code: 'UNAUTHORIZED', message: 'You are not an active participant in this room.' })
      }

      // 3. Audio data normalization
      if (!audioData) {
        return ack({ success: false, code: 'INVALID_AUDIO', message: 'No audio data provided.' })
      }

      let audioBuffer
      if (Buffer.isBuffer(audioData)) {
        audioBuffer = audioData
      } else if (audioData instanceof ArrayBuffer) {
        audioBuffer = Buffer.from(audioData)
      } else if (ArrayBuffer.isView(audioData)) {
        audioBuffer = Buffer.from(audioData.buffer, audioData.byteOffset, audioData.byteLength)
      } else if (typeof audioData === 'string') {
        audioBuffer = Buffer.from(audioData, 'base64')
      } else {
        audioBuffer = Buffer.from(audioData)
      }

      if (!audioBuffer || audioBuffer.length === 0) {
        return ack({ success: false, code: 'INVALID_AUDIO', message: 'Audio buffer is empty.' })
      }

      // 4. Audio buffer size limit (max 1.5 MB)
      const MAX_BYTES = 1.5 * 1024 * 1024
      if (audioBuffer.length > MAX_BYTES) {
        return ack({
          success: false,
          code:    'AUDIO_TOO_LARGE',
          message: 'Voice message exceeds 1.5 MB limit.',
        })
      }

      // 5. Duration limit (max 60 seconds, with small margin for encoding/headers)
      if (typeof duration === 'number' && duration > 65) {
        return ack({
          success: false,
          code:    'DURATION_EXCEEDED',
          message: 'Voice message cannot exceed 60 seconds.',
        })
      }

      // 6. MIME type validation
      const normalizedMime = (mimeType && typeof mimeType === 'string') ? mimeType.toLowerCase() : 'audio/webm'
      if (!normalizedMime.startsWith('audio/')) {
        return ack({
          success: false,
          code:    'INVALID_MIME_TYPE',
          message: 'Invalid audio format.',
        })
      }

      // 7. Rate limit check per participant in this room (10 per 5 min)
      const rateCheck = checkAndRecordVoice(room.roomId, participant.participantId)
      if (!rateCheck.allowed) {
        return ack({
          success: false,
          code:    'RATE_LIMITED',
          message: rateCheck.message || 'Too many voice messages. Please wait a few minutes.',
        })
      }

      // 8. Stream buffer directly to Cloudinary (resource_type: 'video')
      const uploadResult = await uploadAudio({
        buffer:   audioBuffer,
        roomId:   room.roomId,
        mimeType: normalizedMime,
      })
      uploadedPublicId = uploadResult?.publicId

      // 9. Record internal VoiceAsset for TTL and room-cleanup tracking
      await recordVoiceAsset({
        roomId:      room.roomId,
        publicId:    uploadResult.publicId,
        deleteAfter: new Date(Date.now() + 25 * 60 * 60 * 1000),
      })

      // 10. Persist safe chat message to MongoDB
      const calculatedDuration = typeof duration === 'number' && duration > 0
        ? Math.round(duration)
        : (uploadResult.duration || null)

      const { safeMessage } = await roomService.addChatMessage(room.roomId, {
        type:          'voice',
        participantId: participant.participantId,
        username:      participant.username,
        text:          null,
        audio: {
          url:      uploadResult.url,
          publicId: uploadResult.publicId,
          duration: calculatedDuration,
          mimeType: normalizedMime,
          bytes:    uploadResult.bytes || audioBuffer.length,
        },
      })

      // 11. Broadcast to room
      io.to(room.roomId).emit(EVENTS.CHAT_MESSAGE, safeMessage)

      return ack({
        success:   true,
        messageId: safeMessage.messageId,
        audioUrl:  safeMessage.audio?.url,
      })
    } catch (err) {
      if (uploadedPublicId) {
        deleteAudio(uploadedPublicId).catch(cleanupErr => {
          console.warn('[Socket] Failed to clean up orphan voice asset after error:', cleanupErr.message)
        })
      }
      console.error(`[Socket] send_voice_message error for socket ${socket.id}:`, err.message)
      return ack({
        success: false,
        code:    'UPLOAD_FAILED',
        message: err.message || 'Failed to process voice message.',
      })
    }
  })

  /* -------------------------------------------------------
   * sync_request — re-sends current state to requesting socket
   * -------------------------------------------------------
   */
  socket.on(EVENTS.SYNC_REQUEST, async ({ roomId }) => {
    try {
      if (!isSocketInRoom(socket, roomId)) return
      const room = await roomService.findRoom(roomId)
      if (!room) return
      const participant = room.findParticipantBySocket(socket.id)
      if (!participant) return

      const isPrimary = participant.primarySocketId === socket.id

      socket.emit(EVENTS.SYNC_STATE, {
        room: {
          roomId:            room.roomId,
          roomName:          room.roomName,
          hostParticipantId: room.hostParticipantId,
          hostSocketId:      room.hostSocketId,
        },
        participants:             room.toSafeParticipants(),
        videoState:               room.videoState,
        queue:                    room.queue,
        chatMessages:             room.toSafeChatMessages(),
        currentUserRole:          participant.role,
        currentUserParticipantId: participant.participantId,
        isPrimaryConnection:      isPrimary,
      })
    } catch (err) {
      console.error('[Socket] sync_request error:', err.message)
    }
  })

  /* -------------------------------------------------------
   * queue_add — requires host or moderator
   * -------------------------------------------------------
   */
  socket.on(EVENTS.QUEUE_ADD, async ({ roomId, videoId, title, thumbnail, duration }) => {
    try {
      if (!isSocketInRoom(socket, roomId)) return
      const room = await roomService.findRoom(roomId)
      if (!room) return
      if (!room.hasRoleForSocket(socket.id, ['host', 'moderator'])) {
        socket.emit(EVENTS.ERROR, { message: 'Only the host or moderator can add videos to the queue.' })
        return
      }

      const participant = room.findParticipantBySocket(socket.id)

      const updatedRoom = await roomService.addToQueue(roomId, {
        videoId,
        title,
        thumbnail,
        duration,
        addedBy:              participant?.username || 'Anonymous',
        addedByParticipantId: participant?.participantId || null,
      })

      // If no video is currently loaded, automatically pop and play the first item
      if (!updatedRoom.videoState.videoId) {
        const playedRoom = await roomService.popNextVideo(roomId)
        io.to(roomId).emit(EVENTS.SYNC_STATE, {
          videoState: playedRoom.videoState,
          queue:      playedRoom.queue,
        })
      } else {
        io.to(roomId).emit(EVENTS.QUEUE_SYNC, { queue: updatedRoom.queue })
      }
    } catch (err) {
      console.error('[Socket] queue_add error:', err.message)
      socket.emit(EVENTS.ERROR, { message: err.message })
    }
  })

  /* -------------------------------------------------------
   * queue_remove — host can remove any, moderator can remove own (by participantId)
   * -------------------------------------------------------
   */
  socket.on(EVENTS.QUEUE_REMOVE, async ({ roomId, queueItemId }) => {
    try {
      if (!isSocketInRoom(socket, roomId)) return
      const room = await roomService.findRoom(roomId)
      if (!room) return
      const participant = room.findParticipantBySocket(socket.id)
      if (!participant) return

      const item = room.queue.find(q => q._id.toString() === queueItemId)
      if (!item) {
        socket.emit(EVENTS.ERROR, { message: 'Queue item not found.' })
        return
      }

      const isHost = participant.role === 'host'
      const isMod = participant.role === 'moderator'
      const isOwnItem = item.addedByParticipantId
        ? item.addedByParticipantId === participant.participantId
        : item.addedBy === participant.username

      if (!isHost && !(isMod && isOwnItem)) {
        socket.emit(EVENTS.ERROR, { message: 'Only the host, or moderator who added the video, can remove it.' })
        return
      }

      const updatedRoom = await roomService.removeFromQueue(roomId, queueItemId)
      io.to(roomId).emit(EVENTS.QUEUE_SYNC, { queue: updatedRoom.queue })
    } catch (err) {
      console.error('[Socket] queue_remove error:', err.message)
      socket.emit(EVENTS.ERROR, { message: err.message })
    }
  })

  /* -------------------------------------------------------
   * queue_clear — requires host only
   * -------------------------------------------------------
   */
  socket.on(EVENTS.QUEUE_CLEAR, async ({ roomId }) => {
    try {
      if (!isSocketInRoom(socket, roomId)) return
      const room = await roomService.findRoom(roomId)
      if (!room) return
      if (!room.hasRoleForSocket(socket.id, 'host')) {
        socket.emit(EVENTS.ERROR, { message: 'Only the host can clear the queue.' })
        return
      }

      const updatedRoom = await roomService.clearQueue(roomId)
      io.to(roomId).emit(EVENTS.QUEUE_SYNC, { queue: updatedRoom.queue })
    } catch (err) {
      console.error('[Socket] queue_clear error:', err.message)
      socket.emit(EVENTS.ERROR, { message: err.message })
    }
  })

  /* -------------------------------------------------------
   * queue_reorder — requires host only
   * -------------------------------------------------------
   */
  socket.on(EVENTS.QUEUE_REORDER, async ({ roomId, newOrderIds }) => {
    try {
      if (!isSocketInRoom(socket, roomId)) return
      const room = await roomService.findRoom(roomId)
      if (!room) return
      if (!room.hasRoleForSocket(socket.id, 'host')) {
        socket.emit(EVENTS.ERROR, { message: 'Only the host can reorder the queue.' })
        return
      }

      const updatedRoom = await roomService.reorderQueue(roomId, newOrderIds)
      io.to(roomId).emit(EVENTS.QUEUE_SYNC, { queue: updatedRoom.queue })
    } catch (err) {
      console.error('[Socket] queue_reorder error:', err.message)
      socket.emit(EVENTS.ERROR, { message: err.message })
    }
  })

  /* -------------------------------------------------------
   * queue_next — pops next video in queue (requires host or mod)
   * -------------------------------------------------------
   */
  socket.on(EVENTS.QUEUE_NEXT, async ({ roomId, currentVideoId }) => {
    try {
      if (!isSocketInRoom(socket, roomId)) return
      const room = await roomService.findRoom(roomId)
      if (!room) return
      if (!room.hasRoleForSocket(socket.id, ['host', 'moderator'])) {
        socket.emit(EVENTS.ERROR, { message: 'Only the host or moderator can skip videos.' })
        return
      }

      if (currentVideoId && room.videoState.videoId !== currentVideoId) {
        return
      }

      const updatedRoom = await roomService.popNextVideo(roomId)
      io.to(roomId).emit(EVENTS.SYNC_STATE, {
        videoState: updatedRoom.videoState,
        queue:      updatedRoom.queue,
      })
    } catch (err) {
      console.error('[Socket] queue_next error:', err.message)
      socket.emit(EVENTS.ERROR, { message: err.message })
    }
  })

  /* -------------------------------------------------------
   * send_email_invite — sends email invitation to a recipient
   * -------------------------------------------------------
   */
  socket.on(EVENTS.SEND_EMAIL_INVITE, async ({ roomId, recipientEmail }, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {}

    try {
      if (!roomId || typeof roomId !== 'string') {
        return ack({ success: false, code: 'INVALID_ROOM', message: 'Room ID is required.' })
      }

      if (!isSocketInRoom(socket, roomId)) {
        return ack({
          success: false,
          code:    'UNAUTHORIZED',
          message: 'You must be an active participant in the room to send invitations.',
        })
      }

      // 1. Email format validation
      const { valid, normalizedEmail, error: emailError } = validateEmail(recipientEmail)
      if (!valid) {
        return ack({ success: false, code: 'INVALID_EMAIL', message: emailError || 'Please enter a valid email address.' })
      }

      // 2. Fetch room from database
      const room = await roomService.findRoom(roomId)
      if (!room) {
        return ack({ success: false, code: 'ROOM_NOT_FOUND', message: 'Room not found or has expired.' })
      }

      // 3. Socket membership authorization: verify connected socket belongs to an active participant
      const participant = room.findParticipantBySocket(socket.id)
      if (!participant) {
        return ack({ success: false, code: 'UNAUTHORIZED', message: 'You must be an active participant in the room to send invitations.' })
      }

      // 4. Rate limiting check
      const rateLimitCheck = checkAndRecordInvite(socket.id, room.roomId, normalizedEmail)
      if (!rateLimitCheck.allowed) {
        return ack({
          success: false,
          code:    rateLimitCheck.code || 'RATE_LIMITED',
          remainingSeconds: rateLimitCheck.remainingSeconds,
          message: rateLimitCheck.message || 'Too many invitations. Please wait before trying again.',
        })
      }

      // 5. Dispatch email with server-authoritative room and inviter details
      await emailService.sendRoomInvite({
        to:          normalizedEmail,
        roomName:    room.roomName,
        roomId:      room.roomId,
        inviterName: participant.username,
      })

      return ack({
        success: true,
        message: 'Invitation sent successfully.',
      })
    } catch (err) {
      console.warn(`[Socket] send_email_invite error for socket ${socket.id}:`, err.message)

      // Roll back cooldown and attempt counter so user isn't locked out after delivery failure
      try {
        if (room?.roomId && normalizedEmail) {
          rollbackInvite(socket.id, room.roomId, normalizedEmail)
        }
      } catch (_) {}

      const isUnavailable = err.message && err.message.includes('unavailable')
      return ack({
        success: false,
        code:    isUnavailable ? 'SERVICE_UNAVAILABLE' : 'SEND_FAILED',
        message: isUnavailable
          ? 'Email invitations are currently unavailable on this server.'
          : 'Could not send invitation. Please try again later.',
      })
    }
  })
}

module.exports = { registerRoomHandlers }

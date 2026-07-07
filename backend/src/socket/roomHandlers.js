const mongoose = require('mongoose')
const roomService = require('../services/roomService')

/**
 * Socket event constants — single source of truth for event names.
 * Must match the frontend's EVENTS object in socketService.js.
 */
const EVENTS = {
  JOIN_ROOM:           'join_room',
  LEAVE_ROOM:          'leave_room',
  PLAY:                'play',
  PAUSE:               'pause',
  SEEK:                'seek',
  CHANGE_VIDEO:        'change_video',
  ASSIGN_ROLE:         'assign_role',
  REMOVE_PARTICIPANT:  'remove_participant',
  TRANSFER_HOST:       'transfer_host',
  SEND_CHAT:           'send_chat',
  SYNC_REQUEST:        'sync_request',
  USER_JOINED:         'user_joined',
  USER_LEFT:           'user_left',
  SYNC_STATE:          'sync_state',
  ROLE_UPDATED:        'role_updated',
  KICKED:              'kicked',
  CHAT_MESSAGE:        'chat_message',
  ERROR:               'error',
}

/**
 * registerRoomHandlers — attaches all room-scoped socket events.
 *
 * Security model:
 * - Every event validates the emitter's role in the DB.
 * - Frontend roles are NEVER trusted — always re-validated server-side.
 * - Unauthorized attempts silently fail or return an error event.
 *
 * @param {import('socket.io').Socket} socket
 * @param {import('socket.io').Server} io
 */
function registerRoomHandlers(socket, io) {
  // Check database status for all client-initiated events
  socket.use(([event, ...args], next) => {
    if (event !== 'disconnect' && mongoose.connection.readyState !== 1) {
      socket.emit(EVENTS.ERROR, { message: 'Database connection is currently offline. Please ensure MongoDB is started.' })
      return
    }
    next()
  })

  /* -------------------------------------------------------
   * join_room
   * -------------------------------------------------------
   * 1. Add participant to DB
   * 2. Join socket.io room
   * 3. Broadcast user_joined to others
   * 4. Send sync_state (full room state) to the new joiner
   */
  socket.on(EVENTS.JOIN_ROOM, async ({ roomId, username }) => {
    try {
      if (!roomId || !username) return

      const room = await roomService.addParticipant(roomId, {
        socketId: socket.id,
        username: username.trim().slice(0, 24),
      })

      if (!room) {
        socket.emit(EVENTS.ERROR, { message: 'Room not found.' })
        return
      }

      // Track which room this socket is in
      socket.roomId = roomId
      socket.username = username
      socket.join(roomId)

      const participant = room.findParticipant(socket.id)

      // Notify others
      socket.to(roomId).emit(EVENTS.USER_JOINED, { participant })

      // Send full state to the new joiner
      socket.emit(EVENTS.SYNC_STATE, {
        room: {
          roomId:       room.roomId,
          roomName:     room.roomName,
          hostSocketId: room.hostSocketId,
        },
        participants: room.participants,
        videoState:   room.videoState,
        currentUserRole: participant?.role || 'participant',
      })

      console.log(`[Socket] ${username} (${socket.id}) joined room ${roomId}`)
    } catch (err) {
      console.error('[Socket] join_room error:', err.message)
      socket.emit(EVENTS.ERROR, { message: err.message })
    }
  })

  /* -------------------------------------------------------
   * leave_room (explicit leave)
   * -------------------------------------------------------
   */
  socket.on(EVENTS.LEAVE_ROOM, async ({ roomId }) => {
    await handleLeave(socket, io, roomId)
  })

  /* -------------------------------------------------------
   * disconnect (tab close / network drop)
   * -------------------------------------------------------
   */
  socket.on('disconnect', async () => {
    if (socket.roomId) {
      await handleLeave(socket, io, socket.roomId)
    }
  })

  /* -------------------------------------------------------
   * play — requires host or moderator
   * -------------------------------------------------------
   */
  socket.on(EVENTS.PLAY, async ({ roomId, currentTime }) => {
    try {
      const room = await roomService.updateVideoState(roomId, {
        isPlaying: true,
        currentTime: currentTime ?? 0,
      })
      if (!room) return

      // Server-side permission check
      if (!room.hasRole(socket.id, ['host', 'moderator'])) {
        socket.emit(EVENTS.ERROR, { message: 'Only the host or moderator can control playback.' })
        return
      }

      // Broadcast to everyone in the room (including sender)
      io.to(roomId).emit(EVENTS.PLAY, { currentTime: currentTime ?? 0 })
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
      const room = await roomService.updateVideoState(roomId, {
        isPlaying: false,
        currentTime: currentTime ?? 0,
      })
      if (!room) return

      if (!room.hasRole(socket.id, ['host', 'moderator'])) {
        socket.emit(EVENTS.ERROR, { message: 'Only the host or moderator can control playback.' })
        return
      }

      io.to(roomId).emit(EVENTS.PAUSE, { currentTime: currentTime ?? 0 })
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
      const room = await roomService.updateVideoState(roomId, { currentTime })
      if (!room) return

      if (!room.hasRole(socket.id, ['host', 'moderator'])) {
        socket.emit(EVENTS.ERROR, { message: 'Only the host or moderator can seek.' })
        return
      }

      io.to(roomId).emit(EVENTS.SEEK, { currentTime })
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
      const room = await roomService.updateVideoState(roomId, {
        videoId,
        title: title || '',
        isPlaying: false,
        currentTime: 0,
      })
      if (!room) return

      if (!room.hasRole(socket.id, ['host', 'moderator'])) {
        socket.emit(EVENTS.ERROR, { message: 'Only the host or moderator can change the video.' })
        return
      }

      io.to(roomId).emit(EVENTS.CHANGE_VIDEO, { videoId, title })
    } catch (err) {
      console.error('[Socket] change_video error:', err.message)
    }
  })

  /* -------------------------------------------------------
   * assign_role — requires host only
   * -------------------------------------------------------
   */
  socket.on(EVENTS.ASSIGN_ROLE, async ({ roomId, targetSocketId, role }) => {
    try {
      const validRoles = ['moderator', 'participant', 'viewer']
      if (!validRoles.includes(role)) {
        socket.emit(EVENTS.ERROR, { message: 'Invalid role.' })
        return
      }

      const room = await roomService.findRoom(roomId)
      if (!room.hasRole(socket.id, 'host')) {
        socket.emit(EVENTS.ERROR, { message: 'Only the host can assign roles.' })
        return
      }

      const { participant } = await roomService.updateParticipantRole(roomId, targetSocketId, role)

      io.to(roomId).emit(EVENTS.ROLE_UPDATED, {
        socketId: targetSocketId,
        role,
        username: participant.username,
      })
    } catch (err) {
      console.error('[Socket] assign_role error:', err.message)
      socket.emit(EVENTS.ERROR, { message: err.message })
    }
  })

  /* -------------------------------------------------------
   * transfer_host — requires host only
   * -------------------------------------------------------
   */
  socket.on(EVENTS.TRANSFER_HOST, async ({ roomId, targetSocketId }) => {
    try {
      const room = await roomService.findRoom(roomId)
      if (!room.hasRole(socket.id, 'host')) {
        socket.emit(EVENTS.ERROR, { message: 'Only the host can transfer host role.' })
        return
      }

      const { participant } = await roomService.updateParticipantRole(roomId, targetSocketId, 'host')

      io.to(roomId).emit(EVENTS.ROLE_UPDATED, {
        socketId: targetSocketId,
        role: 'host',
        username: participant.username,
      })

      // Also demote old host (they become participant)
      await roomService.updateParticipantRole(roomId, socket.id, 'participant')
      const oldHostParticipant = room.findParticipant(socket.id)
      io.to(roomId).emit(EVENTS.ROLE_UPDATED, {
        socketId: socket.id,
        role: 'participant',
        username: oldHostParticipant?.username || '',
      })
    } catch (err) {
      console.error('[Socket] transfer_host error:', err.message)
      socket.emit(EVENTS.ERROR, { message: err.message })
    }
  })

  /* -------------------------------------------------------
   * remove_participant — requires host only
   * -------------------------------------------------------
   */
  socket.on(EVENTS.REMOVE_PARTICIPANT, async ({ roomId, targetSocketId }) => {
    try {
      const room = await roomService.findRoom(roomId)
      if (!room.hasRole(socket.id, 'host')) {
        socket.emit(EVENTS.ERROR, { message: 'Only the host can remove participants.' })
        return
      }
      if (targetSocketId === socket.id) {
        socket.emit(EVENTS.ERROR, { message: 'You cannot remove yourself.' })
        return
      }

      const target = room.findParticipant(targetSocketId)
      if (!target) return

      await roomService.removeParticipant(roomId, targetSocketId)

      // Notify the kicked user
      io.to(targetSocketId).emit(EVENTS.KICKED)

      // Notify everyone else
      socket.to(roomId).emit(EVENTS.USER_LEFT, {
        socketId: targetSocketId,
        username: target.username,
      })
    } catch (err) {
      console.error('[Socket] remove_participant error:', err.message)
      socket.emit(EVENTS.ERROR, { message: err.message })
    }
  })

  /* -------------------------------------------------------
   * send_chat — any participant can chat
   * -------------------------------------------------------
   */
  socket.on(EVENTS.SEND_CHAT, async ({ roomId, text }) => {
    try {
      if (!text?.trim() || text.length > 500) return

      const room = await roomService.findRoom(roomId)
      const participant = room.findParticipant(socket.id)
      if (!participant) return

      const message = {
        id:        `${socket.id}-${Date.now()}`,
        socketId:  socket.id,
        username:  participant.username,
        text:      text.trim(),
        timestamp: new Date().toISOString(),
      }

      // Broadcast to all in room (including sender, for consistency)
      io.to(roomId).emit(EVENTS.CHAT_MESSAGE, message)
    } catch (err) {
      console.error('[Socket] send_chat error:', err.message)
    }
  })

  /* -------------------------------------------------------
   * sync_request — re-sends current state to requesting socket
   * -------------------------------------------------------
   */
  socket.on(EVENTS.SYNC_REQUEST, async ({ roomId }) => {
    try {
      const room = await roomService.findRoom(roomId)
      const participant = room.findParticipant(socket.id)

      socket.emit(EVENTS.SYNC_STATE, {
        room: {
          roomId:       room.roomId,
          roomName:     room.roomName,
          hostSocketId: room.hostSocketId,
        },
        participants: room.participants,
        videoState:   room.videoState,
        currentUserRole: participant?.role || 'participant',
      })
    } catch (err) {
      console.error('[Socket] sync_request error:', err.message)
    }
  })
}

/**
 * handleLeave — common logic for explicit leave and disconnect.
 */
async function handleLeave(socket, io, roomId) {
  try {
    const result = await roomService.removeParticipant(roomId, socket.id)
    if (!result) return

    const { leavingParticipant, newHost } = result

    socket.leave(roomId)

    // Notify remaining participants
    io.to(roomId).emit(EVENTS.USER_LEFT, {
      socketId: socket.id,
      username: leavingParticipant?.username || 'Someone',
    })

    // Notify new host if host transferred automatically
    if (newHost) {
      io.to(roomId).emit(EVENTS.ROLE_UPDATED, {
        socketId: newHost.socketId,
        role:     'host',
        username: newHost.username,
      })
    }

    console.log(`[Socket] ${socket.username || socket.id} left room ${roomId}`)
  } catch (err) {
    console.error('[Socket] handleLeave error:', err.message)
  }
}

module.exports = { registerRoomHandlers }

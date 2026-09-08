const roomService = require('../services/roomService')

/**
 * POST /api/rooms/create
 * Creates a new room and returns it.
 */
async function createRoom(req, res, next) {
  try {
    const { username, roomName } = req.body

    if (!username?.trim())  return res.status(400).json({ message: 'Username is required.' })
    if (!roomName?.trim())  return res.status(400).json({ message: 'Room name is required.' })
    if (username.length > 24) return res.status(400).json({ message: 'Username too long (max 24).' })
    if (roomName.length > 60) return res.status(400).json({ message: 'Room name too long (max 60).' })

    // Verified Clerk user ID from authentication middleware
    const auth = req.auth || {}
    const createdByClerkUserId = auth.userId || null

    const room = await roomService.createRoom({
      username: username.trim(),
      roomName: roomName.trim(),
      createdByClerkUserId,
    })

    return res.status(201).json({
      success: true,
      room: {
        roomId:    room.roomId,
        roomName:  room.roomName,
        createdAt: room.createdAt,
      },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/rooms/join
 * Validates a room exists and returns its current state.
 */
async function joinRoom(req, res, next) {
  try {
    const { username, roomId } = req.body

    if (!username?.trim()) return res.status(400).json({ message: 'Username is required.' })
    if (!roomId?.trim())   return res.status(400).json({ message: 'Room code is required.' })

    const room = await roomService.findRoom(roomId.trim())

    return res.status(200).json({
      success: true,
      room: {
        roomId:      room.roomId,
        roomName:    room.roomName,
        videoState:  room.videoState,
        hostSocketId: room.hostSocketId,
        participantCount: room.participants.length,
      },
    })
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ message: err.message })
    }
    next(err)
  }
}

/**
 * GET /api/rooms/:id
 * Fetch full room details.
 */
async function getRoom(req, res, next) {
  try {
    const room = await roomService.findRoom(req.params.id)

    return res.status(200).json({
      success: true,
      room: {
        roomId:               room.roomId,
        roomName:             room.roomName,
        hostParticipantId:    room.hostParticipantId,
        createdByClerkUserId: room.createdByClerkUserId,
        videoState:           room.videoState,
        participants:         room.toSafeParticipants ? room.toSafeParticipants() : (room.participants ? room.participants.map(p => ({
          participantId: p.participantId || p.socketId,
          username:      p.username,
          role:          p.role,
          status:        p.status,
        })) : []),
        participantCount:     room.participants ? room.participants.length : 0,
        createdAt:            room.createdAt,
      },
    })
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ message: err.message })
    }
    next(err)
  }
}

/**
 * GET /api/rooms
 * List all active rooms.
 */
async function getRooms(req, res, next) {
  try {
    const rooms = await roomService.getAllRooms()
    
    const mappedRooms = rooms.map(room => {
      const hostParticipant = room.participants.find(p => p.role === 'host')
      const hostName = hostParticipant ? hostParticipant.username : 'Unknown'
      
      let status = 'Active'
      if (room.participants.length === 0) {
        status = 'Empty'
      } else if (room.videoState?.videoId) {
        status = room.videoState.isPlaying ? 'Playing' : 'Waiting'
      } else {
        status = 'Waiting'
      }

      return {
        roomId:               room.roomId,
        roomName:             room.roomName,
        hostName,
        hostParticipantId:    room.hostParticipantId,
        createdByClerkUserId: room.createdByClerkUserId,
        participantCount:     room.participants.length,
        currentVideoTitle:    room.videoState?.title || '',
        currentVideoId:       room.videoState?.videoId || null,
        createdAt:            room.createdAt,
        status,
      }
    })

    return res.status(200).json({
      success: true,
      rooms: mappedRooms,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * DELETE /api/rooms/:id
 * Delete a room (only by its authenticated creator).
 */
async function deleteRoom(req, res, next) {
  try {
    const roomId = req.params.id
    const clerkUserId = req.auth?.userId

    if (!clerkUserId) {
      return res.status(401).json({ message: 'Authentication is required to delete a room.' })
    }

    const room = await roomService.findRoom(roomId)
    if (!room) {
      return res.status(404).json({ message: 'Room not found.' })
    }

    // Verify that the authenticated Clerk user is the verified creator
    if (room.createdByClerkUserId !== clerkUserId) {
      return res.status(403).json({ message: 'Only the creator of this room is authorized to delete it.' })
    }

    // Kick all clients currently inside the room
    const io = req.app?.get?.('io')
    if (io) {
      io.to(roomId.toUpperCase()).emit('kicked')
    }

    await roomService.deleteRoom(roomId)

    // Notify all dashboard pages that the rooms list updated
    if (io) {
      io.emit('rooms_updated')
    }

    return res.status(200).json({
      success: true,
      message: 'Room deleted successfully.',
    })
  } catch (err) {
    if (err.message && err.message.includes('not found')) {
      return res.status(404).json({ message: err.message })
    }
    next(err)
  }
}

module.exports = { createRoom, joinRoom, getRoom, getRooms, deleteRoom }

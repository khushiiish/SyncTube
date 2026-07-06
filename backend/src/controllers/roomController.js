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

    const room = await roomService.createRoom({
      username: username.trim(),
      roomName: roomName.trim(),
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
        roomId:       room.roomId,
        roomName:     room.roomName,
        hostSocketId: room.hostSocketId,
        videoState:   room.videoState,
        participants: room.participants.map(p => ({
          socketId: p.socketId,
          username: p.username,
          role:     p.role,
          status:   p.status,
        })),
        participantCount: room.participants.length,
        createdAt:    room.createdAt,
      },
    })
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ message: err.message })
    }
    next(err)
  }
}

module.exports = { createRoom, joinRoom, getRoom }

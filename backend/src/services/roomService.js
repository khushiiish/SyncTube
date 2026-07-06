const Room = require('../models/Room')
const { generateRoomId } = require('../utils/generateRoomId')

/**
 * roomService — business logic layer.
 * Controllers and socket handlers call these functions.
 * Keeps DB logic out of routes and socket handlers.
 */

/**
 * Create a new room.
 */
async function createRoom({ username, roomName }) {
  // Generate a unique roomId (retry if collision)
  let roomId, exists
  do {
    roomId = generateRoomId()
    exists = await Room.exists({ roomId })
  } while (exists)

  const room = new Room({
    roomId,
    roomName: roomName.trim(),
    participants: [], // Host will be added when they join via socket
    videoState: {
      videoId: null,
      isPlaying: false,
      currentTime: 0,
    },
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
 * Add a participant to a room (idempotent — won't duplicate).
 */
async function addParticipant(roomId, { socketId, username, role = 'participant' }) {
  const room = await Room.findOne({ roomId })
  if (!room) throw new Error('Room not found.')

  // Check if already in room (reconnect scenario)
  const existing = room.participants.find(p => p.socketId === socketId)
  if (existing) return room

  // Set first participant as host if room is empty
  const assignedRole = room.participants.length === 0 ? 'host' : role

  room.participants.push({ socketId, username, role: assignedRole })
  if (assignedRole === 'host') {
    room.hostSocketId = socketId
  }

  await room.save()
  return room
}

/**
 * Remove a participant from a room.
 * If the host leaves, transfer host to the next participant (FIFO).
 */
async function removeParticipant(roomId, socketId) {
  const room = await Room.findOne({ roomId })
  if (!room) return null

  const leavingParticipant = room.participants.find(p => p.socketId === socketId)
  room.participants = room.participants.filter(p => p.socketId !== socketId)

  // Transfer host if needed
  let newHost = null
  if (leavingParticipant?.role === 'host' && room.participants.length > 0) {
    room.participants[0].role = 'host'
    room.hostSocketId = room.participants[0].socketId
    newHost = room.participants[0]
  }

  // Delete empty rooms
  if (room.participants.length === 0) {
    await Room.deleteOne({ roomId })
    return { room: null, leavingParticipant, newHost }
  }

  await room.save()
  return { room, leavingParticipant, newHost }
}

/**
 * Update playback state.
 */
async function updateVideoState(roomId, videoStateUpdates) {
  const room = await Room.findOneAndUpdate(
    { roomId },
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
 * Update a participant's role.
 */
async function updateParticipantRole(roomId, targetSocketId, role) {
  const room = await Room.findOne({ roomId })
  if (!room) throw new Error('Room not found.')

  const participant = room.participants.find(p => p.socketId === targetSocketId)
  if (!participant) throw new Error('Participant not found.')

  participant.role = role
  if (role === 'host') {
    // Demote previous host
    room.participants.forEach(p => {
      if (p.socketId !== targetSocketId && p.role === 'host') {
        p.role = 'participant'
      }
    })
    room.hostSocketId = targetSocketId
  }

  await room.save()
  return { room, participant }
}

module.exports = {
  createRoom,
  findRoom,
  addParticipant,
  removeParticipant,
  updateVideoState,
  updateParticipantRole,
}

/**
 * liveVoiceService.js — In-memory registry for real-time WebRTC Live Voice participants.
 *
 * Tracks active live voice connections per room:
 * Map<roomId, Map<socketId, { socketId, participantId, username, isMuted, joinedAt }>>
 *
 * - Ephemeral, in-memory management: no database writes for transient audio sessions
 * - Supports instant querying of room voice peers for WebRTC mesh signaling
 * - Handles mute/unmute state updates and automated cleanup
 */
class LiveVoiceService {
  constructor() {
    this.rooms = new Map()
  }

  /**
   * Get all active live-voice participants in a room.
   *
   * @param {string} roomId
   * @returns {Array<{ socketId: string, participantId: string, username: string, isMuted: boolean, joinedAt: number }>}
   */
  getParticipants(roomId) {
    const normRoomId = (roomId || '').toUpperCase().trim()
    const roomMap = this.rooms.get(normRoomId)
    if (!roomMap) return []
    return Array.from(roomMap.values())
  }

  /**
   * Add a participant to a room's active live-voice session.
   *
   * @param {string} roomId
   * @param {string} socketId
   * @param {Object} data
   * @param {string} data.participantId
   * @param {string} data.username
   * @param {boolean} [data.isMuted=false]
   * @returns {Object} participant
   */
  addParticipant(roomId, socketId, { participantId, username, isMuted = false }) {
    const normRoomId = (roomId || '').toUpperCase().trim()
    if (!this.rooms.has(normRoomId)) {
      this.rooms.set(normRoomId, new Map())
    }
    const participant = {
      socketId,
      participantId,
      username,
      isMuted: Boolean(isMuted),
      joinedAt: Date.now(),
    }
    this.rooms.get(normRoomId).set(socketId, participant)
    return participant
  }

  /**
   * Remove a participant from a room's live-voice session.
   *
   * @param {string} roomId
   * @param {string} socketId
   * @returns {Object|null} removed participant
   */
  removeParticipant(roomId, socketId) {
    const normRoomId = (roomId || '').toUpperCase().trim()
    const roomMap = this.rooms.get(normRoomId)
    if (!roomMap) return null
    const removed = roomMap.get(socketId) || null
    roomMap.delete(socketId)
    if (roomMap.size === 0) {
      this.rooms.delete(normRoomId)
    }
    return removed
  }

  /**
   * Remove a socket from any room it is currently in (e.g. on disconnect).
   *
   * @param {string} socketId
   * @returns {Array<{ roomId: string, participant: Object }>}
   */
  removeSocketFromAllRooms(socketId) {
    const results = []
    for (const [roomId, roomMap] of this.rooms.entries()) {
      if (roomMap.has(socketId)) {
        const removed = roomMap.get(socketId)
        roomMap.delete(socketId)
        if (roomMap.size === 0) {
          this.rooms.delete(roomId)
        }
        results.push({ roomId, participant: removed })
      }
    }
    return results
  }

  /**
   * Update participant mute status.
   *
   * @param {string} roomId
   * @param {string} socketId
   * @param {boolean} isMuted
   * @returns {Object|null} updated participant
   */
  setMute(roomId, socketId, isMuted) {
    const normRoomId = (roomId || '').toUpperCase().trim()
    const roomMap = this.rooms.get(normRoomId)
    if (!roomMap || !roomMap.has(socketId)) return null
    const p = roomMap.get(socketId)
    p.isMuted = Boolean(isMuted)
    return p
  }

  /**
   * Check if a socket is currently in live-voice.
   *
   * @param {string} roomId
   * @param {string} socketId
   * @returns {boolean}
   */
  isParticipantInVoice(roomId, socketId) {
    const normRoomId = (roomId || '').toUpperCase().trim()
    const roomMap = this.rooms.get(normRoomId)
    return Boolean(roomMap && roomMap.has(socketId))
  }
}

module.exports = new LiveVoiceService()

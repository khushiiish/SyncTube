/**
 * socketService.js — Centralized socket event emitters.
 *
 * All socket.emit() calls are funneled through here so that:
 * 1. Event names are in one place (no typos across components)
 * 2. Payload shapes are documented
 * 3. Business logic is separated from UI components
 */

export const EVENTS = {
  // Client → Server
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

  // Server → Client
  USER_JOINED:                'user_joined',
  USER_LEFT:                  'user_left',
  SYNC_STATE:                 'sync_state',
  ROLE_UPDATED:               'role_updated',
  KICKED:                     'kicked',
  ROOM_TAKEN_OVER:            'room_taken_over',
  PARTICIPANTS_SYNC:          'participants_sync',
  CHAT_MESSAGE:               'chat_message',
  ERROR:                      'error',
  QUEUE_SYNC:                 'queue_sync',
  PRIMARY_CONNECTION_CHANGED: 'primary_connection_changed',
}

/**
 * Join a room after socket connects.
 *
 * @param {import('socket.io-client').Socket} socket
 * @param {Object} payload
 * @param {string} payload.roomId
 * @param {string} payload.username
 * @param {string} [payload.guestDeviceId]
 * @param {string|null} [payload.clerkToken]
 * @param {string|null} [payload.tabId]
 * @param {boolean} [payload.takeover=false]
 * @param {Function} [callback] - Structured ack callback ({ success, participantId, role, isPrimaryConnection, code, message })
 */
export function emitJoinRoom(socket, { roomId, username, guestDeviceId, clerkToken, tabId, sessionId, deviceInfo, takeover = false }, callback) {
  if (!socket) return
  socket.emit(EVENTS.JOIN_ROOM, { roomId, username, guestDeviceId, clerkToken, tabId, sessionId, deviceInfo, takeover }, callback)
}

export function emitLeaveRoom(socket, { roomId }) {
  if (!socket) return
  socket.emit(EVENTS.LEAVE_ROOM, { roomId })
}

export function emitPlay(socket, { roomId, currentTime }) {
  if (!socket) return
  socket.emit(EVENTS.PLAY, { roomId, currentTime })
}

export function emitPause(socket, { roomId, currentTime }) {
  if (!socket) return
  socket.emit(EVENTS.PAUSE, { roomId, currentTime })
}

export function emitSeek(socket, { roomId, currentTime }) {
  if (!socket) return
  socket.emit(EVENTS.SEEK, { roomId, currentTime })
}

export function emitChangeVideo(socket, { roomId, videoId, title }) {
  if (!socket) return
  socket.emit(EVENTS.CHANGE_VIDEO, { roomId, videoId, title })
}

export function emitAssignRole(socket, { roomId, targetParticipantId, role }) {
  if (!socket) return
  socket.emit(EVENTS.ASSIGN_ROLE, { roomId, targetParticipantId, role })
}

export function emitRemoveParticipant(socket, { roomId, targetParticipantId }) {
  if (!socket) return
  socket.emit(EVENTS.REMOVE_PARTICIPANT, { roomId, targetParticipantId })
}

export function emitTransferHost(socket, { roomId, targetParticipantId }) {
  if (!socket) return
  socket.emit(EVENTS.TRANSFER_HOST, { roomId, targetParticipantId })
}

export function emitSendChat(socket, { roomId, text }) {
  if (!socket) return
  socket.emit(EVENTS.SEND_CHAT, { roomId, text })
}

/**
 * Send a voice message (audio blob / arraybuffer + duration + mimeType).
 * @param {import('socket.io-client').Socket} socket
 * @param {{ roomId: string, audioData: Blob|ArrayBuffer, duration: number, mimeType: string }} payload
 * @param {(response: { success: boolean, message?: string, code?: string, messageId?: string, audioUrl?: string }) => void} [callback]
 */
export function emitSendVoiceMessage(socket, { roomId, audioData, duration, mimeType }, callback) {
  if (!socket) return
  socket.emit(EVENTS.SEND_VOICE_MESSAGE, { roomId, audioData, duration, mimeType }, callback)
}

/**
 * Send an email invitation for the room.
 * @param {import('socket.io-client').Socket} socket
 * @param {{ roomId: string, recipientEmail: string }} payload
 * @param {(response: { success: boolean, message?: string, code?: string }) => void} callback
 */
export function emitSendEmailInvite(socket, { roomId, recipientEmail }, callback) {
  if (!socket) return
  socket.emit(EVENTS.SEND_EMAIL_INVITE, { roomId, recipientEmail }, callback)
}

export function emitSyncRequest(socket, { roomId }) {
  if (!socket) return
  socket.emit(EVENTS.SYNC_REQUEST, { roomId })
}

export function emitQueueAdd(socket, { roomId, videoId, title, thumbnail, duration }) {
  if (!socket) return
  socket.emit('queue_add', { roomId, videoId, title, thumbnail, duration })
}

export function emitQueueRemove(socket, { roomId, queueItemId }) {
  if (!socket) return
  socket.emit('queue_remove', { roomId, queueItemId })
}

export function emitQueueClear(socket, { roomId }) {
  if (!socket) return
  socket.emit('queue_clear', { roomId })
}

export function emitQueueReorder(socket, { roomId, newOrderIds }) {
  if (!socket) return
  socket.emit('queue_reorder', { roomId, newOrderIds })
}

export function emitQueueNext(socket, { roomId, currentVideoId }) {
  if (!socket) return
  socket.emit('queue_next', { roomId, currentVideoId })
}

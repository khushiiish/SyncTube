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
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  PLAY: 'play',
  PAUSE: 'pause',
  SEEK: 'seek',
  CHANGE_VIDEO: 'change_video',
  ASSIGN_ROLE: 'assign_role',
  REMOVE_PARTICIPANT: 'remove_participant',
  TRANSFER_HOST: 'transfer_host',
  SEND_CHAT: 'send_chat',
  SYNC_REQUEST: 'sync_request',

  // Server → Client
  USER_JOINED: 'user_joined',
  USER_LEFT: 'user_left',
  SYNC_STATE: 'sync_state',
  ROLE_UPDATED: 'role_updated',
  KICKED: 'kicked',
  CHAT_MESSAGE: 'chat_message',
  ERROR: 'error',
  QUEUE_SYNC: 'queue_sync',
}

/**
 * Join a room after socket connects.
 * @param {import('socket.io-client').Socket} socket
 * @param {{ roomId: string, username: string }} payload
 */
export function emitJoinRoom(socket, { roomId, username }) {
  socket.emit(EVENTS.JOIN_ROOM, { roomId, username })
}

export function emitLeaveRoom(socket, { roomId }) {
  socket.emit(EVENTS.LEAVE_ROOM, { roomId })
}

export function emitPlay(socket, { roomId, currentTime }) {
  socket.emit(EVENTS.PLAY, { roomId, currentTime })
}

export function emitPause(socket, { roomId, currentTime }) {
  socket.emit(EVENTS.PAUSE, { roomId, currentTime })
}

export function emitSeek(socket, { roomId, currentTime }) {
  socket.emit(EVENTS.SEEK, { roomId, currentTime })
}

export function emitChangeVideo(socket, { roomId, videoId, title }) {
  socket.emit(EVENTS.CHANGE_VIDEO, { roomId, videoId, title })
}

export function emitAssignRole(socket, { roomId, targetSocketId, role }) {
  socket.emit(EVENTS.ASSIGN_ROLE, { roomId, targetSocketId, role })
}

export function emitRemoveParticipant(socket, { roomId, targetSocketId }) {
  socket.emit(EVENTS.REMOVE_PARTICIPANT, { roomId, targetSocketId })
}

export function emitTransferHost(socket, { roomId, targetSocketId }) {
  socket.emit(EVENTS.TRANSFER_HOST, { roomId, targetSocketId })
}

export function emitSendChat(socket, { roomId, text }) {
  socket.emit(EVENTS.SEND_CHAT, { roomId, text })
}

export function emitSyncRequest(socket, { roomId }) {
  socket.emit(EVENTS.SYNC_REQUEST, { roomId })
}

export function emitQueueAdd(socket, { roomId, videoId, title, thumbnail, duration }) {
  socket.emit('queue_add', { roomId, videoId, title, thumbnail, duration })
}

export function emitQueueRemove(socket, { roomId, queueItemId }) {
  socket.emit('queue_remove', { roomId, queueItemId })
}

export function emitQueueClear(socket, { roomId }) {
  socket.emit('queue_clear', { roomId })
}

export function emitQueueReorder(socket, { roomId, newOrderIds }) {
  socket.emit('queue_reorder', { roomId, newOrderIds })
}

export function emitQueueNext(socket, { roomId, currentVideoId }) {
  socket.emit('queue_next', { roomId, currentVideoId })
}

const RoomSession = require('../models/RoomSession')

const ROOM_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Parses user-agent header into a friendly device string.
 *
 * @param {string|undefined} userAgent
 * @returns {string}
 */
function parseFriendlyDeviceInfo(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') return 'Unknown Device'
  const ua = userAgent.toLowerCase()

  let platform = 'Desktop'
  if (/mobile|android|iphone|ipad|ipod|blackberry|opera mini|iemobile/i.test(ua)) {
    platform = 'Mobile'
  } else if (/tablet|ipad/i.test(ua)) {
    platform = 'Tablet'
  }

  let browser = 'Browser'
  if (ua.includes('edg/')) browser = 'Edge'
  else if (ua.includes('chrome/')) browser = 'Chrome'
  else if (ua.includes('safari/') && !ua.includes('chrome')) browser = 'Safari'
  else if (ua.includes('firefox/')) browser = 'Firefox'

  let os = ''
  if (ua.includes('windows')) os = 'Windows'
  else if (ua.includes('macintosh') || ua.includes('mac os')) os = 'Mac'
  else if (ua.includes('android')) os = 'Android'
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS'
  else if (ua.includes('linux')) os = 'Linux'

  const details = [browser, os].filter(Boolean).join(' on ')
  return details ? `${platform} (${details})` : platform
}

/**
 * Fetch the currently active session for an authenticated user in a room.
 *
 * @param {string} roomId
 * @param {string} userId
 * @returns {Promise<Object|null>}
 */
async function getActiveSession(roomId, userId) {
  if (!roomId || !userId) return null
  return await RoomSession.findOne({
    roomId: roomId.toUpperCase().trim(),
    userId,
    status: 'active',
  })
}

/**
 * Register a new active session or verify existing active session.
 *
 * Checks:
 * 1. If an active session exists for this (roomId, userId):
 *    - If its socket is no longer active in activeSockets (dead socket) -> marks stale session terminated and creates new active session.
 *    - If its socket is active and sessionId/tabId matches -> reconnect on same device, update socketId.
 *    - If its socket is active and sessionId/tabId differs -> collision (another device or tab is already active), returns isDuplicate: true.
 * 2. If no active session exists -> creates active session.
 *
 * @param {Object} params
 * @param {string} params.roomId
 * @param {string} params.userId
 * @param {string} params.identityHash
 * @param {string} params.sessionId
 * @param {string} params.socketId
 * @param {string|null} [params.tabId]
 * @param {string|null} [params.deviceInfo]
 * @param {Date} [params.expiresAt]
 * @param {string[]} [params.activeSockets=[]]
 * @returns {Promise<{ success: boolean, session?: Object, isDuplicate?: boolean, activeSession?: Object, isReconnect?: boolean }>}
 */
async function registerOrVerifySession({
  roomId,
  userId,
  identityHash,
  sessionId,
  socketId,
  tabId = null,
  deviceInfo = null,
  expiresAt = null,
  activeSockets = [],
}) {
  const normRoomId = roomId.toUpperCase().trim()
  const sessionExpiry = expiresAt || new Date(Date.now() + ROOM_TTL_MS)
  const safeDeviceInfo = deviceInfo || 'Unknown Device'

  // 1. Check for an existing active session for this user in this room
  const existing = await RoomSession.findOne({
    roomId: normRoomId,
    userId,
    status: 'active',
  })

  if (existing) {
    const isSocketAlive = existing.socketId &&
      Array.isArray(activeSockets) &&
      activeSockets.includes(existing.socketId)

    // A. Dead socket recovery: if the old socket is no longer connected, clean up stale session
    if (!isSocketAlive) {
      await RoomSession.updateOne(
        { _id: existing._id },
        { status: 'terminated', lastActiveAt: new Date() }
      )

      try {
        const newSession = await RoomSession.create({
          roomId: normRoomId,
          userId,
          identityHash,
          sessionId,
          socketId,
          tabId,
          deviceInfo: safeDeviceInfo,
          status: 'active',
          expiresAt: sessionExpiry,
        })
        return { success: true, session: newSession, isNewSession: true }
      } catch (err) {
        if (err.code === 11000) {
          if (err.message && err.message.includes('sessionId_1')) {
            console.warn('[RoomSession] Caught stale unique sessionId_1 index error. Auto-repairing...')
            await RoomSession.repairIndexes().catch(() => {})
            try {
              const retrySession = await RoomSession.create({
                roomId: normRoomId,
                userId,
                identityHash,
                sessionId,
                socketId,
                tabId,
                deviceInfo: safeDeviceInfo,
                status: 'active',
                expiresAt: sessionExpiry,
              })
              return { success: true, session: retrySession, isNewSession: true }
            } catch (retryErr) {
              if (retryErr.code === 11000) {
                const concurrent = await getActiveSession(normRoomId, userId)
                return { success: false, isDuplicate: true, activeSession: concurrent }
              }
              throw retryErr
            }
          }
          const concurrent = await getActiveSession(normRoomId, userId)
          return { success: false, isDuplicate: true, activeSession: concurrent }
        }
        throw err
      }
    }

    // B. Reconnection on same device/tab
    const isSameSession = (sessionId && existing.sessionId === sessionId) ||
      (tabId && existing.tabId && existing.tabId === tabId)

    if (isSameSession) {
      existing.socketId = socketId
      if (sessionId) existing.sessionId = sessionId
      if (tabId) existing.tabId = tabId
      existing.lastActiveAt = new Date()
      await existing.save()
      return { success: true, session: existing, isReconnect: true }
    }

    // C. Collision: Account is active on another device or tab
    return {
      success: false,
      isDuplicate: true,
      activeSession: existing,
    }
  }

  // 2. No active session exists -> create new active session
  try {
    const session = await RoomSession.create({
      roomId: normRoomId,
      userId,
      identityHash,
      sessionId,
      socketId,
      tabId,
      deviceInfo: safeDeviceInfo,
      status: 'active',
      expiresAt: sessionExpiry,
    })
    return { success: true, session, isNewSession: true }
  } catch (err) {
    // Handle concurrent join race condition (caught by compound unique index)
    if (err.code === 11000) {
      if (err.message && err.message.includes('sessionId_1')) {
        console.warn('[RoomSession] Caught stale unique sessionId_1 index error. Auto-repairing...')
        await RoomSession.repairIndexes().catch(() => {})
        try {
          const retrySession = await RoomSession.create({
            roomId: normRoomId,
            userId,
            identityHash,
            sessionId,
            socketId,
            tabId,
            deviceInfo: safeDeviceInfo,
            status: 'active',
            expiresAt: sessionExpiry,
          })
          return { success: true, session: retrySession, isNewSession: true }
        } catch (retryErr) {
          if (retryErr.code === 11000) {
            const concurrent = await getActiveSession(normRoomId, userId)
            return { success: false, isDuplicate: true, activeSession: concurrent }
          }
          throw retryErr
        }
      }
      const concurrent = await getActiveSession(normRoomId, userId)
      return { success: false, isDuplicate: true, activeSession: concurrent }
    }
    throw err
  }
}

/**
 * Authoritatively switch the active session for an account in a room ("Switch Here").
 *
 * 1. Atomically marks the previous active session as 'replaced'.
 * 2. Creates the new active session for the requesting device.
 * 3. Returns the replaced session's socketId so the server can evict the old device.
 *
 * @param {Object} params
 * @param {string} params.roomId
 * @param {string} params.userId
 * @param {string} params.identityHash
 * @param {string} params.newSessionId
 * @param {string} params.newSocketId
 * @param {string|null} [params.newTabId]
 * @param {string|null} [params.newDeviceInfo]
 * @param {Date} [params.expiresAt]
 * @returns {Promise<{ success: boolean, newSession: Object, replacedSocketId: string|null, replacedSessionId: string|null }>}
 */
async function switchSession({
  roomId,
  userId,
  identityHash,
  newSessionId,
  newSocketId,
  newTabId = null,
  newDeviceInfo = null,
  expiresAt = null,
}) {
  const normRoomId = roomId.toUpperCase().trim()
  const sessionExpiry = expiresAt || new Date(Date.now() + ROOM_TTL_MS)
  const safeDeviceInfo = newDeviceInfo || 'Unknown Device'

  // 1. Mark existing active session as 'replaced'
  const oldSession = await RoomSession.findOneAndUpdate(
    { roomId: normRoomId, userId, status: 'active' },
    { status: 'replaced', lastActiveAt: new Date() },
    { returnDocument: 'before' }
  )

  // 2. Create the new active session
  let newSession
  try {
    newSession = await RoomSession.create({
      roomId: normRoomId,
      userId,
      identityHash,
      sessionId: newSessionId,
      socketId: newSocketId,
      tabId: newTabId,
      deviceInfo: safeDeviceInfo,
      status: 'active',
      expiresAt: sessionExpiry,
    })
  } catch (err) {
    if (err.code === 11000 && err.message && err.message.includes('sessionId_1')) {
      console.warn('[RoomSession] Caught stale unique sessionId_1 index error in switchSession. Auto-repairing...')
      await RoomSession.repairIndexes().catch(() => {})
      newSession = await RoomSession.create({
        roomId: normRoomId,
        userId,
        identityHash,
        sessionId: newSessionId,
        socketId: newSocketId,
        tabId: newTabId,
        deviceInfo: safeDeviceInfo,
        status: 'active',
        expiresAt: sessionExpiry,
      })
    } else {
      throw err
    }
  }

  return {
    success: true,
    newSession,
    replacedSocketId: oldSession ? oldSession.socketId : null,
    replacedSessionId: oldSession ? oldSession.sessionId : null,
    replacedDeviceInfo: oldSession ? oldSession.deviceInfo : null,
  }
}

/**
 * Terminate an active room session (e.g. on explicit leave or final disconnect grace expiry).
 *
 * @param {string} roomId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function terminateSession(roomId, userId) {
  if (!roomId || !userId) return false
  const res = await RoomSession.updateMany(
    { roomId: roomId.toUpperCase().trim(), userId, status: 'active' },
    { status: 'terminated', lastActiveAt: new Date() }
  )
  return res.modifiedCount > 0
}

/**
 * Terminate an active room session by socketId.
 *
 * @param {string} socketId
 * @returns {Promise<Object|null>}
 */
async function terminateSessionBySocketId(socketId) {
  if (!socketId) return null
  return await RoomSession.findOneAndUpdate(
    { socketId, status: 'active' },
    { status: 'terminated', lastActiveAt: new Date() }
  )
}

/**
 * Delete all session records for a room (called on room deletion/cleanup).
 *
 * @param {string} roomId
 */
async function cleanupRoomSessions(roomId) {
  if (!roomId) return
  await RoomSession.deleteMany({ roomId: roomId.toUpperCase().trim() })
}

module.exports = {
  ROOM_TTL_MS,
  parseFriendlyDeviceInfo,
  getActiveSession,
  registerOrVerifySession,
  switchSession,
  terminateSession,
  terminateSessionBySocketId,
  cleanupRoomSessions,
}

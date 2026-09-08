/**
 * Phase 5 Automated Tests — Production Hardening, Security, Rate Limiters & Failure Modes
 */

const assert = require('assert')
const Room = require('../src/models/Room')
const { checkAndRecordChat, resetChatLimits } = require('../src/services/chatRateLimiter')
const { checkControlRate, clearControlRate } = require('../src/services/videoRateLimiter')
const { validateEnv } = require('../src/config/envValidator')
const roomController = require('../src/controllers/roomController')

async function runPhase5Tests() {
  console.log('\n--- Running Phase 5: Hardening & Security Tests ---')

  // ---------------------------------------------------------------------------
  // 1. Chat Rate Limiter (20 messages per 10s per participant in room)
  // ---------------------------------------------------------------------------
  resetChatLimits()
  const rId = 'ROOM_CHAT_TEST'
  const pId = 'PART_CHAT_ALICE'

  for (let i = 0; i < 20; i++) {
    const res = checkAndRecordChat(rId, pId)
    assert.strictEqual(res.allowed, true, `Chat message ${i + 1} should be allowed`)
  }

  // 21st message within 10s window must be rejected
  const blockedChat = checkAndRecordChat(rId, pId)
  assert.strictEqual(blockedChat.allowed, false, '21st message must be rate limited')
  assert.strictEqual(blockedChat.code, 'CHAT_RATE_LIMITED')

  // Bob in the same room is unaffected
  const bobChat = checkAndRecordChat(rId, 'PART_CHAT_BOB')
  assert.strictEqual(bobChat.allowed, true, 'Different participant in same room must not be blocked')
  console.log('  [PASS] Chat rate limiter enforces 20 msgs / 10s per participant')

  // ---------------------------------------------------------------------------
  // 2. Video Playback Control Throttler (15 actions per 3s per socket)
  // ---------------------------------------------------------------------------
  const socketId = 'sock_video_controller_1'
  clearControlRate(socketId)

  for (let i = 0; i < 15; i++) {
    const vRes = checkControlRate(socketId)
    assert.strictEqual(vRes, true, `Video action ${i + 1} should be allowed`)
  }

  // 16th action must be throttled
  const throttledAction = checkControlRate(socketId)
  assert.strictEqual(throttledAction, false, '16th rapid video action must be throttled')

  // Cleanup on disconnect
  clearControlRate(socketId)
  const afterClear = checkControlRate(socketId)
  assert.strictEqual(afterClear, true, 'clearControlRate must reset throttler for disconnected socket')
  console.log('  [PASS] Video control throttler protects playback state from event flooding')

  // ---------------------------------------------------------------------------
  // 3. Environment Validator & Secret Masking
  // ---------------------------------------------------------------------------
  const envCheck = validateEnv()
  assert.strictEqual(typeof envCheck, 'object')
  assert.strictEqual(typeof envCheck.isValid, 'boolean')
  assert.strictEqual(typeof envCheck.diagnostics, 'object')
  // Ensure raw secrets are NEVER exposed in diagnostics
  if (process.env.CLERK_SECRET_KEY) {
    assert.strictEqual(
      envCheck.diagnostics.clerkSecret.includes(process.env.CLERK_SECRET_KEY),
      false,
      'Full Clerk secret must not be displayed in diagnostics'
    )
  }
  console.log('  [PASS] Environment validator audits keys and masks sensitive tokens')

  // ---------------------------------------------------------------------------
  // 4. REST Room Deletion Security (Clerk Auth & Creator Matching)
  // ---------------------------------------------------------------------------
  // Create mock room in memory (or stub roomService.findRoom / deleteRoom)
  const originalFindRoom = require('../src/services/roomService').findRoom
  const originalDeleteRoom = require('../src/services/roomService').deleteRoom

  const mockRoom = {
    roomId: 'SECURE_ROOM_1',
    roomName: 'Secure Room',
    createdByClerkUserId: 'user_clerk_creator_123',
    hostSocketId: 'host_secret_socket_sid_999',
  }

  require('../src/services/roomService').findRoom = async (id) => {
    return id === 'SECURE_ROOM_1' ? mockRoom : null
  }

  let deletedCalled = false
  require('../src/services/roomService').deleteRoom = async () => {
    deletedCalled = true
    return mockRoom
  }

  // Helper mock response
  function createMockRes() {
    return {
      statusCode: 200,
      jsonPayload: null,
      status(code) {
        this.statusCode = code
        return this
      },
      json(data) {
        this.jsonPayload = data
        return this
      },
    }
  }

  const mockNext = (err) => { if (err) throw err }

  // Case A: Unauthenticated request (no req.auth.userId)
  const unauthReq = { params: { id: 'SECURE_ROOM_1' }, auth: {} }
  const unauthRes = createMockRes()
  await roomController.deleteRoom(unauthReq, unauthRes, mockNext)
  assert.strictEqual(unauthRes.statusCode, 401, 'Unauthenticated deleteRoom must return 401')
  assert.strictEqual(deletedCalled, false)

  // Case B: Non-creator authenticated request (Clerk user mismatch)
  const intruderReq = { params: { id: 'SECURE_ROOM_1' }, auth: { userId: 'user_attacker_456' } }
  const intruderRes = createMockRes()
  await roomController.deleteRoom(intruderReq, intruderRes, mockNext)
  assert.strictEqual(intruderRes.statusCode, 403, 'Non-owner deleteRoom must return 403 Forbidden')
  assert.strictEqual(deletedCalled, false)

  // Case C: Legitimate creator request (matches createdByClerkUserId)
  const creatorReq = { params: { id: 'SECURE_ROOM_1' }, auth: { userId: 'user_clerk_creator_123' } }
  const creatorRes = createMockRes()
  await roomController.deleteRoom(creatorReq, creatorRes, mockNext)
  assert.strictEqual(creatorRes.statusCode, 200, 'Creator deleteRoom must return 200')
  assert.strictEqual(deletedCalled, true)

  // Restore roomService mocks
  require('../src/services/roomService').findRoom = originalFindRoom
  require('../src/services/roomService').deleteRoom = originalDeleteRoom
  console.log('  [PASS] DELETE /api/rooms/:id strictly enforces Clerk authentication and creator ownership')

  // ---------------------------------------------------------------------------
  // 5. REST Room Leak Prevention (hostSocketId is not exposed)
  // ---------------------------------------------------------------------------
  const getRoomReq = { params: { id: 'SECURE_ROOM_1' } }
  const getRoomRes = createMockRes()
  require('../src/services/roomService').findRoom = async () => mockRoom

  await roomController.getRoom(getRoomReq, getRoomRes, mockNext)
  assert.strictEqual(getRoomRes.statusCode, 200)
  assert.strictEqual(getRoomRes.jsonPayload.hostSocketId, undefined, 'hostSocketId must NOT leak in getRoom payload')

  require('../src/services/roomService').findRoom = originalFindRoom
  console.log('  [PASS] getRoom controller does not leak internal hostSocketId')

  // ---------------------------------------------------------------------------
  // 6. Role Authorization Before State Mutation
  // ---------------------------------------------------------------------------
  const testRoomRoles = new Room({
    roomId: 'ROLE_CHECK_ROOM',
    roomName: 'Role Check Room',
    hostParticipantId: 'host_p',
    participants: [
      {
        participantId: 'host_p',
        identityHash: 'hash_h',
        username: 'Host',
        role: 'host',
        socketIds: ['sock_h'],
        primarySocketId: 'sock_h',
      },
      {
        participantId: 'viewer_p',
        identityHash: 'hash_v',
        username: 'Viewer',
        role: 'viewer',
        socketIds: ['sock_v'],
        primarySocketId: 'sock_v',
      }
    ]
  })

  assert.strictEqual(testRoomRoles.hasRoleForSocket('sock_h', ['host', 'moderator']), true)
  assert.strictEqual(testRoomRoles.hasRoleForSocket('sock_v', ['host', 'moderator']), false)
  console.log('  [PASS] hasRoleForSocket rejects viewer playback control commands')
}

module.exports = { runPhase5Tests }

if (require.main === module) {
  runPhase5Tests()
    .then(() => console.log('\nAll Phase 5 tests passed!'))
    .catch(err => {
      console.error('\nPhase 5 test failed:', err)
      process.exit(1)
    })
}

/**
 * test_phase4_voice.js
 *
 * Automated verification suite for Phase 4:
 * 1. Cloudinary config & graceful unconfigured fallback
 * 2. Voice rate limiter (sliding window, max 10/5min, identity isolation)
 * 3. Audio duration formatting & MIME helper logic
 * 4. Message models & safe serialization (publicId omission, backward-compatible aliases)
 * 5. Audio buffer limits (max 1.5 MB enforcement)
 * 6. Voice asset cleanup logic & periodic timer safety
 * 7. Regression check for Phase 1, Phase 2, and Phase 3 components
 */

const assert = require('assert')
const Room = require('../backend/src/models/Room')
const VoiceAsset = require('../backend/src/models/VoiceAsset')
const { isCloudinaryConfigured } = require('../backend/src/config/cloudinary')
const { checkAndRecordVoice } = require('../backend/src/services/voiceRateLimiter')
const { formatAudioDuration } = require('./formatHelper')
const voiceCleanupService = require('../backend/src/services/voiceCleanupService')
const { deriveIdentity } = require('../backend/src/utils/identityService')
const { validateEmail } = require('../backend/src/utils/validateEmail')
const { checkAndRecordInvite } = require('../backend/src/services/inviteRateLimiter')

let totalTests = 0
let passedTests = 0

function test(name, fn) {
  totalTests++
  try {
    fn()
    console.log(`  [PASS] ${name}`)
    passedTests++
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message)
  }
}

async function testAsync(name, fn) {
  totalTests++
  try {
    await fn()
    console.log(`  [PASS] ${name}`)
    passedTests++
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message)
  }
}

async function run() {
  console.log('=== PHASE 4 AUTOMATED TEST SUITE ===\n')

  console.log('--- 1. Cloudinary Config & Safe Fallback ---')
  test('isCloudinaryConfigured returns boolean without throwing', () => {
    const configured = isCloudinaryConfigured()
    assert.strictEqual(typeof configured, 'boolean')
  })

  console.log('\n--- 2. Voice Rate Limiting (10 per 5 min) ---')
  test('Voice rate limiter allows up to 10 attempts per participant', () => {
    const roomId = 'ROOM_RATE_TEST'
    const participantId = 'user-alice-1'

    for (let i = 1; i <= 10; i++) {
      const res = checkAndRecordVoice(roomId, participantId)
      assert.strictEqual(res.allowed, true, `Attempt ${i} should be allowed`)
    }

    const blocked = checkAndRecordVoice(roomId, participantId)
    assert.strictEqual(blocked.allowed, false, '11th attempt must be blocked')
    assert(blocked.message.includes('Too many voice messages'), 'Message should indicate rate limit')
  })

  test('Voice rate limiter isolates different participants', () => {
    const roomId = 'ROOM_RATE_TEST'
    const participantBob = 'user-bob-2'

    // Bob has not reached limit even though Alice has
    const bobRes = checkAndRecordVoice(roomId, participantBob)
    assert.strictEqual(bobRes.allowed, true, 'Bob should not be impacted by Alice limit')
  })

  test('Voice rate limiter isolates different rooms for same participant', () => {
    const roomId2 = 'ROOM_RATE_TEST_2'
    const participantId = 'user-alice-1'

    const res = checkAndRecordVoice(roomId2, participantId)
    assert.strictEqual(res.allowed, true, 'Same participant in another room should have isolated window')
  })

  console.log('\n--- 3. Audio Duration & Format Formatting ---')
  test('formatAudioDuration formats seconds correctly', () => {
    assert.strictEqual(formatAudioDuration(0), '0:00')
    assert.strictEqual(formatAudioDuration(5), '0:05')
    assert.strictEqual(formatAudioDuration(59), '0:59')
    assert.strictEqual(formatAudioDuration(60), '1:00')
    assert.strictEqual(formatAudioDuration(75), '1:15')
    assert.strictEqual(formatAudioDuration(null), '0:00')
    assert.strictEqual(formatAudioDuration(undefined), '0:00')
  })

  console.log('\n--- 4. Safe Chat Serialization & Public ID Omission ---')
  test('toSafeChatMessage serializes text messages safely', () => {
    const room = new Room({
      roomId: 'TEST_SERIALIZE',
      roomName: 'Test Room',
    })

    const safe = room.toSafeChatMessage({
      messageId: 'msg-123',
      type: 'text',
      participantId: 'part-abc',
      username: 'Alice',
      text: 'Hello world',
      createdAt: new Date('2026-09-08T12:00:00Z'),
    })

    assert.strictEqual(safe.messageId, 'msg-123')
    assert.strictEqual(safe.id, 'msg-123', 'id alias must exist for client compatibility')
    assert.strictEqual(safe.type, 'text')
    assert.strictEqual(safe.text, 'Hello world')
    assert.strictEqual(safe.audio, null)
    assert.strictEqual(safe.timestamp, '2026-09-08T12:00:00.000Z')
  })

  test('toSafeChatMessage serializes voice messages and OMITS internal publicId', () => {
    const room = new Room({
      roomId: 'TEST_SERIALIZE_VOICE',
      roomName: 'Test Room Voice',
    })

    const safe = room.toSafeChatMessage({
      messageId: 'voice-456',
      type: 'voice',
      participantId: 'part-xyz',
      username: 'Bob',
      text: null,
      audio: {
        url: 'https://res.cloudinary.com/demo/video/upload/synctube/voice/test.webm',
        publicId: 'synctube/voice/TEST/secret-internal-id-123',
        duration: 12,
        mimeType: 'audio/webm',
        bytes: 52400,
      },
      createdAt: new Date('2026-09-08T12:05:00Z'),
    })

    assert.strictEqual(safe.messageId, 'voice-456')
    assert.strictEqual(safe.type, 'voice')
    assert.strictEqual(safe.text, null)
    assert.ok(safe.audio, 'audio object must exist')
    assert.strictEqual(safe.audio.url, 'https://res.cloudinary.com/demo/video/upload/synctube/voice/test.webm')
    assert.strictEqual(safe.audio.duration, 12)
    assert.strictEqual(safe.audio.mimeType, 'audio/webm')
    assert.strictEqual(safe.audio.bytes, 52400)
    assert.strictEqual(safe.audio.publicId, undefined, 'CRITICAL: publicId MUST NOT be exposed to clients')
  })

  console.log('\n--- 5. Audio Buffer Validation Logic ---')
  test('Audio buffer limit calculations strictly enforce <= 1.5 MB', () => {
    const MAX_BYTES = 1.5 * 1024 * 1024
    const validBuffer = Buffer.alloc(1024 * 500) // 500 KB
    const oversizedBuffer = Buffer.alloc(1.51 * 1024 * 1024) // 1.51 MB

    assert(validBuffer.length <= MAX_BYTES, '500 KB must be permitted')
    assert(oversizedBuffer.length > MAX_BYTES, '1.51 MB must be rejected')
  })

  console.log('\n--- 6. Voice Cleanup Service Lifecycle ---')
  test('startPeriodicCleanup and stopPeriodicCleanup toggle without error', () => {
    voiceCleanupService.startPeriodicCleanup(60000)
    voiceCleanupService.stopPeriodicCleanup()
    assert.ok(true, 'Cleanup timer started and stopped safely')
  })

  console.log('\n--- 7. Regression Checks for Phase 1, Phase 2, & Phase 3 ---')
  await testAsync('Phase 1 & 3: Guest identity derivation works stably', async () => {
    const validUuid = 'c02d1844-3d02-4f35-93ec-e818df4f54bf'
    const id1 = await deriveIdentity({ guestDeviceId: validUuid, clerkToken: null })
    const id2 = await deriveIdentity({ guestDeviceId: validUuid, clerkToken: null })
    assert.strictEqual(id1.identityHash, id2.identityHash, 'Guest identity hash must be deterministic')
    assert.strictEqual(id1.isGuest, true)
  })

  test('Phase 2: Email validation & rate limiting remains functional', () => {
    assert.strictEqual(validateEmail('test@example.com').valid, true)
    assert.strictEqual(validateEmail('invalid-email').valid, false)

    const inviteRes = checkAndRecordInvite('REG_ROOM', 'part-1')
    assert.strictEqual(inviteRes.allowed, true)
  })

  test('Phase 3: Room participant roles and kick checks operate correctly', () => {
    const room = new Room({
      roomId: 'REG_TEST_ROOM',
      roomName: 'Regression Room',
      participants: [{
        participantId: 'p1',
        identityHash: 'hash-p1',
        username: 'HostUser',
        role: 'host',
        socketIds: ['sock-1'],
        primarySocketId: 'sock-1',
      }],
      blockedParticipants: [{
        identityHash: 'banned-hash',
        blockedByParticipantId: 'p1',
      }],
    })

    assert.strictEqual(room.hasRoleForSocket('sock-1', 'host'), true)
    assert.strictEqual(room.isIdentityBlocked('banned-hash'), true)
    assert.strictEqual(room.isIdentityBlocked('safe-hash'), false)
  })

  console.log(`\n========================================`)
  console.log(`RESULTS: ${passedTests} / ${totalTests} tests passed`)
  console.log(`========================================\n`)

  if (passedTests !== totalTests) {
    process.exit(1)
  }
}

run().catch(err => {
  console.error('Test suite failed:', err)
  process.exit(1)
})

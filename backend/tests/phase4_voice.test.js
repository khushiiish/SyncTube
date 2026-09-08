/**
 * Phase 4 Automated Tests — Voice Messaging, Storage & Cleanup
 */

const assert = require('assert')
const { isCloudinaryConfigured } = require('../src/config/cloudinary')
const { checkAndRecordVoice } = require('../src/services/voiceRateLimiter')
const Room = require('../src/models/Room')
const VoiceAsset = require('../src/models/VoiceAsset')

function formatAudioDuration(seconds) {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) return '0:00'
  const totalSecs = Math.round(seconds)
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

async function runPhase4Tests() {
  console.log('\n--- Running Phase 4: Voice Messaging & Cloudinary Tests ---')

  // 1. Cloudinary Config & Fallback
  const configured = isCloudinaryConfigured()
  assert.strictEqual(typeof configured, 'boolean')
  console.log(`  [PASS] Cloudinary configuration status detected: ${configured}`)

  // 2. Voice Rate Limiting (10 per 5 min)
  const roomId = 'ROOM_VOICE_TEST_' + Date.now()
  const participantId = 'part_voice_user'

  for (let i = 0; i < 10; i++) {
    const res = checkAndRecordVoice(roomId, participantId)
    assert.strictEqual(res.allowed, true, `Attempt ${i + 1} should be allowed`)
  }

  // 11th attempt must be rejected
  const throttled = checkAndRecordVoice(roomId, participantId)
  assert.strictEqual(throttled.allowed, false, '11th attempt within 5 minutes must be rate-limited')
  assert.strictEqual(throttled.code, 'RATE_LIMITED')

  // Different participant in same room is unaffected
  const otherUser = checkAndRecordVoice(roomId, 'part_other_user')
  assert.strictEqual(otherUser.allowed, true, 'Different participant in same room must not be blocked')
  console.log('  [PASS] checkAndRecordVoice enforces 10/5min quota with participant isolation')

  // 3. Audio Duration Formatting
  assert.strictEqual(formatAudioDuration(0), '0:00')
  assert.strictEqual(formatAudioDuration(5), '0:05')
  assert.strictEqual(formatAudioDuration(59), '0:59')
  assert.strictEqual(formatAudioDuration(60), '1:00')
  assert.strictEqual(formatAudioDuration(125), '2:05')
  assert.strictEqual(formatAudioDuration(-5), '0:00')
  assert.strictEqual(formatAudioDuration(null), '0:00')
  console.log('  [PASS] Audio duration formatting handles seconds and boundary values')

  // 4. Safe Chat Message Serialization (Cloudinary publicId omission)
  const testRoom = new Room({
    roomId: 'TEST_ROOM_VOICE',
    roomName: 'Voice Test Room',
    chatMessages: [
      {
        messageId: 'msg-text-1',
        type: 'text',
        participantId: 'p1',
        username: 'Alice',
        text: 'Hello world',
        createdAt: new Date(),
      },
      {
        messageId: 'msg-voice-1',
        type: 'voice',
        participantId: 'p1',
        username: 'Alice',
        text: null,
        audio: {
          url: 'https://res.cloudinary.com/demo/video/upload/sample.webm',
          publicId: 'synctube/voice/SECRET_PUBLIC_ID_123',
          duration: 12,
          mimeType: 'audio/webm',
          bytes: 45000,
        },
        createdAt: new Date(),
      }
    ],
  })

  const safeMsgs = testRoom.toSafeChatMessages()
  assert.strictEqual(safeMsgs.length, 2)
  assert.strictEqual(safeMsgs[0].text, 'Hello world')
  assert.strictEqual(safeMsgs[1].type, 'voice')
  assert.strictEqual(safeMsgs[1].audio.url, 'https://res.cloudinary.com/demo/video/upload/sample.webm')
  assert.strictEqual(safeMsgs[1].audio.duration, 12)
  assert.strictEqual(safeMsgs[1].audio.publicId, undefined, 'CRITICAL: publicId must NEVER leak to client')
  console.log('  [PASS] toSafeChatMessages redacts audio.publicId')

  // 5. VoiceAsset Schema
  const asset = new VoiceAsset({
    roomId: 'room-1',
    publicId: 'synctube/voice/asset_1',
    deleteAfter: new Date(Date.now() + 3600000),
  })
  assert.strictEqual(asset.roomId, 'room-1')
  assert.strictEqual(asset.publicId, 'synctube/voice/asset_1')
  assert.ok(asset.createdAt instanceof Date)
  console.log('  [PASS] VoiceAsset model validates schema fields')
}

module.exports = { runPhase4Tests }

if (require.main === module) {
  runPhase4Tests()
    .then(() => console.log('\nAll Phase 4 tests passed!'))
    .catch(err => {
      console.error('\nPhase 4 test failed:', err)
      process.exit(1)
    })
}

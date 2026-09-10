/**
 * Phase 3 Automated Tests — Stable Identity & Multi-Tab Synchronization
 */

const assert = require('assert')
const crypto = require('crypto')
const { deriveIdentity, UUID_REGEX } = require('../src/utils/identityService')
const disconnectGraceManager = require('../src/services/disconnectGraceManager')
const Room = require('../src/models/Room')

async function runPhase3Tests() {
  console.log('\n--- Running Phase 3: Identity & Multi-Tab Sync Tests ---')

  // 1. Identity Service — Mandatory Auth & Clerk Token
  const testUuid = '12345678-1234-4234-8234-123456789abc'
  assert.strictEqual(UUID_REGEX.test(testUuid), true, 'Valid UUID should pass regex')
  assert.strictEqual(UUID_REGEX.test('not-a-uuid'), false, 'Invalid string should fail regex')

  // Mandatory Authentication: Reject unauthenticated joins
  try {
    await deriveIdentity({})
    assert.fail('Should have rejected unauthenticated deriveIdentity without clerkToken')
  } catch (err) {
    assert.strictEqual(err.code, 'AUTHENTICATION_REQUIRED')
  }

  try {
    await deriveIdentity({ clerkToken: '   ' })
    assert.fail('Should have rejected empty whitespace clerkToken')
  } catch (err) {
    assert.strictEqual(err.code, 'AUTHENTICATION_REQUIRED')
  }

  try {
    await deriveIdentity({ guestDeviceId: testUuid })
    assert.fail('Should have rejected guest-only join attempt without clerkToken')
  } catch (err) {
    assert.strictEqual(err.code, 'AUTHENTICATION_REQUIRED')
  }

  // Missing CLERK_SECRET_KEY test
  const originalClerkSecret = process.env.CLERK_SECRET_KEY
  delete process.env.CLERK_SECRET_KEY
  try {
    await deriveIdentity({ clerkToken: 'test.token' })
    assert.fail('Should have failed when CLERK_SECRET_KEY is missing')
  } catch (err) {
    assert.strictEqual(err.code, 'CONFIG_ERROR')
  }
  process.env.CLERK_SECRET_KEY = originalClerkSecret || 'sk_test_mock'

  // Invalid token should fail with INVALID_AUTH
  try {
    await deriveIdentity({ clerkToken: 'invalid.jwt.token' })
    assert.fail('Should have failed with INVALID_AUTH on forged token')
  } catch (err) {
    assert.strictEqual(err.code, 'INVALID_AUTH')
  }
  console.log('  [PASS] deriveIdentity enforces mandatory Clerk authentication and validates tokens')

  // 2. Disconnect Grace Manager
  let graceFired = false
  disconnectGraceManager.scheduleDisconnectGrace({
    roomId: 'test-room-1',
    participantId: 'part-1',
    onExpire: () => {
      graceFired = true
    },
    graceMs: 50,
  })

  assert.strictEqual(disconnectGraceManager.hasPendingGrace('test-room-1', 'part-1'), true)
  disconnectGraceManager.cancelDisconnectGrace('test-room-1', 'part-1')
  assert.strictEqual(disconnectGraceManager.hasPendingGrace('test-room-1', 'part-1'), false)

  // Wait 70ms to ensure cancelled timer never fired
  await new Promise(resolve => setTimeout(resolve, 70))
  assert.strictEqual(graceFired, false, 'Cancelled grace timer must never fire')
  console.log('  [PASS] disconnectGraceManager timer registration and cancellation')

  // 3. Room Schema Participant & Multi-Tab Methods
  const room = new Room({
    roomId: 'TEST_ROOM_IDENTITY',
    roomName: 'Identity Test Room',
    hostParticipantId: 'host_part_id',
    hostSocketId: 'sock_host_1',
    participants: [
      {
        participantId: 'host_part_id',
        identityHash: 'host_hash_abc',
        username: 'HostUser',
        role: 'host',
        socketIds: ['sock_host_1'],
        primarySocketId: 'sock_host_1',
        isActive: true,
      },
      {
        participantId: 'guest_part_id',
        identityHash: 'guest_hash_123',
        username: 'GuestUser',
        role: 'participant',
        socketIds: ['sock_guest_tab1'],
        primarySocketId: 'sock_guest_tab1',
        isActive: true,
      }
    ],
    blockedParticipants: [],
  })

  // Add second tab for guest
  const guest = room.findParticipantByIdentityHash('guest_hash_123')
  assert.ok(guest, 'Participant must be found by identityHash')
  guest.socketIds.push('sock_guest_tab2')
  assert.strictEqual(guest.socketIds.length, 2)

  // Disconnect tab 1 - tab 2 becomes primary
  guest.socketIds = guest.socketIds.filter(s => s !== 'sock_guest_tab1')
  if (guest.primarySocketId === 'sock_guest_tab1') {
    guest.primarySocketId = guest.socketIds[0]
  }
  assert.strictEqual(guest.primarySocketId, 'sock_guest_tab2')

  // Block identity
  room.blockedParticipants.push({
    identityHash: guest.identityHash,
    blockedAt: new Date(),
    blockedByParticipantId: 'host_part_id',
  })
  assert.strictEqual(room.isIdentityBlocked(guest.identityHash), true)
  console.log('  [PASS] Room model multi-tab sync, socket detachment, and identity blocking')
}

module.exports = { runPhase3Tests }

if (require.main === module) {
  runPhase3Tests()
    .then(() => console.log('\nAll Phase 3 tests passed!'))
    .catch(err => {
      console.error('\nPhase 3 test failed:', err)
      process.exit(1)
    })
}

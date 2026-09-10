/**
 * phase9_live_voice.test.js — Unit & integration tests for WebRTC Live Voice service & signaling registry.
 */

const assert = require('assert')
const liveVoiceService = require('../src/services/liveVoiceService')

async function runPhase9Tests() {
  console.log('\n--- Running Phase 9: WebRTC Live Voice Signaling & Registry Tests ---')

  // Clean slate
  liveVoiceService.rooms.clear()

  // 1. Add participant to Live Voice
  const p1 = liveVoiceService.addParticipant('ROOM1', 'socket_1', {
    participantId: 'part_1',
    username: 'Khushi',
    isMuted: false,
  })

  assert.strictEqual(p1.socketId, 'socket_1')
  assert.strictEqual(p1.username, 'Khushi')
  assert.strictEqual(p1.isMuted, false)
  console.log('  [PASS] 1. addParticipant registers user in room voice session')

  // 2. Query participants
  const list1 = liveVoiceService.getParticipants('ROOM1')
  assert.strictEqual(list1.length, 1)
  assert.strictEqual(list1[0].username, 'Khushi')
  console.log('  [PASS] 2. getParticipants returns active room voice members')

  // 3. Multi-participant mesh registry
  liveVoiceService.addParticipant('ROOM1', 'socket_2', {
    participantId: 'part_2',
    username: 'Rahul',
    isMuted: false,
  })
  liveVoiceService.addParticipant('ROOM1', 'socket_3', {
    participantId: 'part_3',
    username: 'Aman',
    isMuted: false,
  })

  const list3 = liveVoiceService.getParticipants('ROOM1')
  assert.strictEqual(list3.length, 3)
  console.log('  [PASS] 3. Mesh registry tracks multiple live voice peers (A, B, C)')

  // 4. Room isolation: participants in ROOM1 must NOT appear in ROOM2
  const room2List = liveVoiceService.getParticipants('ROOM2')
  assert.strictEqual(room2List.length, 0)

  liveVoiceService.addParticipant('ROOM2', 'socket_4', {
    participantId: 'part_4',
    username: 'Priya',
  })
  assert.strictEqual(liveVoiceService.getParticipants('ROOM2').length, 1)
  assert.strictEqual(liveVoiceService.getParticipants('ROOM1').length, 3)
  console.log('  [PASS] 4. Room isolation strictly maintained between ROOM1 and ROOM2')

  // 5. Mute status update
  const mutedP = liveVoiceService.setMute('ROOM1', 'socket_3', true)
  assert.strictEqual(mutedP.isMuted, true)
  const aman = liveVoiceService.getParticipants('ROOM1').find(p => p.socketId === 'socket_3')
  assert.strictEqual(aman.isMuted, true)
  console.log('  [PASS] 5. setMute updates participant mute state without dropping session')

  // 6. Leave Live Voice (remove participant)
  const removed = liveVoiceService.removeParticipant('ROOM1', 'socket_2')
  assert.strictEqual(removed.username, 'Rahul')
  const afterLeave = liveVoiceService.getParticipants('ROOM1')
  assert.strictEqual(afterLeave.length, 2)
  assert.strictEqual(afterLeave.some(p => p.socketId === 'socket_2'), false)
  console.log('  [PASS] 6. removeParticipant cleanly leaves voice while room session remains')

  // 7. Socket disconnect / remove from all rooms
  const cleanupResults = liveVoiceService.removeSocketFromAllRooms('socket_1')
  assert.strictEqual(cleanupResults.length, 1)
  assert.strictEqual(cleanupResults[0].roomId, 'ROOM1')
  assert.strictEqual(cleanupResults[0].participant.username, 'Khushi')
  assert.strictEqual(liveVoiceService.getParticipants('ROOM1').length, 1)
  console.log('  [PASS] 7. removeSocketFromAllRooms evicts disconnected socket from active voice')

  // Clean up
  liveVoiceService.rooms.clear()
}

module.exports = { runPhase9Tests }

if (require.main === module) {
  runPhase9Tests().then(() => console.log('Phase 9 tests passed.')).catch(e => { console.error(e); process.exit(1) })
}

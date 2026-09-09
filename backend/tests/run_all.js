/**
 * SyncTube Regression & Test Suite Runner
 * Runs all unit, integration, and security tests across Phase 2 - 5.
 */

const { runPhase2Tests } = require('./phase2_email.test')
const { runPhase3Tests } = require('./phase3_identity.test')
const { runPhase4Tests } = require('./phase4_voice.test')
const { runPhase5Tests } = require('./phase5_hardening.test')
const { runPhase6Tests } = require('./phase6_duplicate_tab_and_blocking.test')
const { runPhase7Tests } = require('./phase7_admin_state_and_host_invariant.test')

async function runAll() {
  console.log('=================================================================')
  console.log('        SyncTube Full Regression & Security Test Suite          ')
  console.log('=================================================================')

  const startTime = Date.now()
  let failed = false

  try {
    await runPhase2Tests()
    await runPhase3Tests()
    await runPhase4Tests()
    await runPhase5Tests()
    await runPhase6Tests()
    await runPhase7Tests()
  } catch (err) {
    failed = true
    console.error('\n❌ Test execution failed with error:', err)
  }

  const durationMs = Date.now() - startTime

  console.log('\n=================================================================')
  if (failed) {
    console.log(`❌ TEST RUN FAILED in ${durationMs}ms`)
    console.log('=================================================================')
    process.exit(1)
  } else {
    console.log(`✔ ALL TEST SUITES PASSED in ${durationMs}ms`)
    console.log('=================================================================')
    process.exit(0)
  }
}

runAll()

/**
 * Phase 2 Automated Tests — Email Invitations & SMTP Security
 */

const assert = require('assert')
const path = require('path')
const { validateEmail } = require('../src/utils/validateEmail')
const { escapeHtml } = require('../src/utils/escapeHtml')
const { checkAndRecordInvite, resetRateLimits } = require('../src/services/inviteRateLimiter')
const emailService = require('../src/services/emailService')

async function runPhase2Tests() {
  console.log('\n--- Running Phase 2: Email & SMTP Security Tests ---')

  // 1. Email validation
  assert.strictEqual(validateEmail('test@example.com').valid, true)
  assert.strictEqual(validateEmail('USER@EXAMPLE.COM').normalizedEmail, 'user@example.com')
  assert.strictEqual(validateEmail('user+tag@domain.co.uk').valid, true)
  assert.strictEqual(validateEmail('invalid-email').valid, false)
  assert.strictEqual(validateEmail('a@b.com,c@d.com').valid, false, 'Comma separated must be rejected')
  assert.strictEqual(validateEmail('a@b.com;c@d.com').valid, false, 'Semicolon separated must be rejected')
  assert.strictEqual(validateEmail('').valid, false, 'Empty email must be rejected')
  assert.strictEqual(validateEmail('a'.repeat(250) + '@example.com').valid, false, 'Overlength email must be rejected')
  console.log('  [PASS] validateEmail input sanitization and length limits')

  // 2. HTML escaping
  const raw = '<script>alert("XSS")</script> & \'movie\''
  const escaped = escapeHtml(raw)
  assert.strictEqual(escaped.includes('<'), false)
  assert.strictEqual(escaped.includes('>'), false)
  assert.strictEqual(escaped.includes('"'), false)
  assert.strictEqual(escaped.includes("'"), false)
  assert.strictEqual(escaped, '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt; &amp; &#39;movie&#39;')
  assert.strictEqual(escapeHtml(null), '')
  assert.strictEqual(escapeHtml(undefined), '')
  console.log('  [PASS] escapeHtml prevents XSS injection')

  // 3. Invite rate limiting
  resetRateLimits()
  const r1 = checkAndRecordInvite('socket-1', 'ROOM123', 'friend1@example.com')
  assert.strictEqual(r1.allowed, true, 'First invite must be allowed')

  const r2 = checkAndRecordInvite('socket-1', 'ROOM123', 'friend1@example.com')
  assert.strictEqual(r2.allowed, false, 'Cooldown should block duplicate to same recipient')
  assert.strictEqual(r2.code, 'COOLDOWN_ACTIVE')

  const r3 = checkAndRecordInvite('socket-1', 'ROOM123', 'friend2@example.com')
  assert.strictEqual(r3.allowed, true)

  const r4 = checkAndRecordInvite('socket-1', 'ROOM123', 'friend3@example.com')
  assert.strictEqual(r4.allowed, true)
  const r5 = checkAndRecordInvite('socket-1', 'ROOM123', 'friend4@example.com')
  assert.strictEqual(r5.allowed, true)
  const r6 = checkAndRecordInvite('socket-1', 'ROOM123', 'friend5@example.com')
  assert.strictEqual(r6.allowed, true)

  // 6th invite from same socket within 15 min window must be rejected
  const r7 = checkAndRecordInvite('socket-1', 'ROOM123', 'friend6@example.com')
  assert.strictEqual(r7.allowed, false, 'Socket limit exceeded')
  assert.strictEqual(r7.code, 'RATE_LIMIT_EXCEEDED')

  // Distinct socket sending to new recipient in same room is allowed
  const rOtherSocket = checkAndRecordInvite('socket-2', 'ROOM123', 'friend6@example.com')
  assert.strictEqual(rOtherSocket.allowed, true)
  console.log('  [PASS] checkAndRecordInvite enforces socket cap, cooldown, and room quota')

  // 4. Email configuration detection (HTTP providers & SMTP)
  const isConfigured = emailService.isConfigured()
  assert.strictEqual(typeof isConfigured, 'boolean')
  console.log(`  [PASS] Email service detects configuration state (isConfigured: ${isConfigured})`)

  // 5. Test Brevo HTTP provider detection
  const origBrevo = process.env.BREVO_API_KEY
  try {
    process.env.BREVO_API_KEY = 'xkeysib-mock-test-key'
    assert.strictEqual(emailService.isConfigured(), true)
    console.log('  [PASS] Email service detects Brevo HTTP API configuration')
  } finally {
    if (origBrevo) process.env.BREVO_API_KEY = origBrevo
    else delete process.env.BREVO_API_KEY
  }
}

module.exports = { runPhase2Tests }

if (require.main === module) {
  runPhase2Tests()
    .then(() => console.log('\nAll Phase 2 tests passed!'))
    .catch(err => {
      console.error('\nPhase 2 test failed:', err)
      process.exit(1)
    })
}

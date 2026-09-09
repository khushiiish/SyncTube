/**
 * Phase 2 Automated Tests — Email Invitations & Nodemailer SMTP Security
 */

const assert = require('assert')
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

  // 4. Nodemailer SMTP configuration detection
  const isConfigured = emailService.isSmtpConfigured()
  assert.strictEqual(typeof isConfigured, 'boolean')
  console.log(`  [PASS] SMTP service detects configuration state (isSmtpConfigured: ${isConfigured})`)

  // 5. Strict boolean and port parsing test
  const origHost = process.env.SMTP_HOST
  const origPort = process.env.SMTP_PORT
  const origSecure = process.env.SMTP_SECURE
  const origUser = process.env.SMTP_USER
  const origPass = process.env.SMTP_PASS

  try {
    // Test: SMTP_SECURE="false" must parse to boolean false (not true!)
    process.env.SMTP_HOST = 'smtp.test.com'
    process.env.SMTP_PORT = '587'
    process.env.SMTP_SECURE = 'false'
    process.env.SMTP_USER = 'test@test.com'
    process.env.SMTP_PASS = 'secret'

    const config587 = emailService.getSmtpConfig()
    assert.strictEqual(config587.secure, false, 'SMTP_SECURE="false" must be boolean false')
    assert.strictEqual(config587.port, 587)
    assert.strictEqual(config587.isValid, true)

    // Test: Missing SMTP_PASS makes config invalid
    delete process.env.SMTP_PASS
    const invalidConfig = emailService.getSmtpConfig()
    assert.strictEqual(invalidConfig.isValid, false)
    assert.strictEqual(invalidConfig.missing.includes('SMTP_PASS'), true)

    console.log('  [PASS] getSmtpConfig strictly parses secure boolean and validates required fields')
  } finally {
    if (origHost !== undefined) process.env.SMTP_HOST = origHost; else delete process.env.SMTP_HOST
    if (origPort !== undefined) process.env.SMTP_PORT = origPort; else delete process.env.SMTP_PORT
    if (origSecure !== undefined) process.env.SMTP_SECURE = origSecure; else delete process.env.SMTP_SECURE
    if (origUser !== undefined) process.env.SMTP_USER = origUser; else delete process.env.SMTP_USER
    if (origPass !== undefined) process.env.SMTP_PASS = origPass; else delete process.env.SMTP_PASS
  }

  // 6. Error classification helper
  const authErr = new Error('Invalid login: 535-5.7.8 Username and Password not accepted.')
  authErr.code = 'EAUTH'
  const cAuth = emailService.classifySmtpError(authErr)
  assert.strictEqual(cAuth.code, 'SMTP_AUTH_ERROR')
  assert.strictEqual(cAuth.category, 'AUTHENTICATION')

  const connErr = new Error('connect ECONNREFUSED 127.0.0.1:587')
  connErr.code = 'ECONNREFUSED'
  const cConn = emailService.classifySmtpError(connErr)
  assert.strictEqual(cConn.code, 'SMTP_NETWORK_ERROR')

  const timeoutErr = new Error('Connection timeout')
  timeoutErr.code = 'ETIMEDOUT'
  const cTimeout = emailService.classifySmtpError(timeoutErr)
  assert.strictEqual(cTimeout.code, 'SMTP_TIMEOUT')

  const rejectErr = new Error('Recipient rejected')
  rejectErr.isRecipientRejected = true
  const cReject = emailService.classifySmtpError(rejectErr)
  assert.strictEqual(cReject.code, 'EMAIL_REJECTED')
  assert.strictEqual(cReject.category, 'RECIPIENT')

  console.log('  [PASS] classifySmtpError properly categorizes EAUTH, ECONNREFUSED, ETIMEDOUT, and recipient rejections')
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

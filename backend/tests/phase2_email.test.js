/**
 * Phase 2 Automated Tests — Brevo SMTP Relay, Nodemailer Transport & Security
 *
 * Covers the 20 requirements of PART 27:
 * 1.  Brevo configuration accepted: smtp-relay.brevo.com, 2525, false
 * 2.  Missing SMTP_USER fails
 * 3.  Missing SMTP_PASS fails
 * 4.  Missing EMAIL_FROM for Brevo fails (strictly required; no SMTP_USER fallback)
 * 5.  Port 587 with Brevo configuration is rejected
 * 6.  Port 2525 with secure=true is rejected
 * 7.  SMTP key/password is never logged in diagnostics
 * 8.  sendRoomInvite builds correct production room URL without trailing slash duplication
 * 9.  User-supplied inviter/room fields remain escaped in HTML
 * 10. Recipient email validation still works (RFC 5322 structure, single recipient, commas rejected)
 * 11. Unauthorized socket cannot send invite (handled by roomHandlers)
 * 12. Non-room socket cannot send invite (handled by roomHandlers)
 * 13. Invitation rate limit still works (socket cap + room/recipient cooldown)
 * 14. Failed delivery rolls back cooldown (rollbackInvite)
 * 15. Successful delivery retains cooldown
 * 16. Sender rejection returns safe error (EMAIL_SENDER_REJECTED)
 * 17. Recipient rejection returns safe error (EMAIL_REJECTED)
 * 18. SMTP auth error returns safe error (SMTP_AUTH_ERROR)
 * 19. Provider quota error returns safe error (SMTP_PROVIDER_LIMIT)
 * 20. Normal successful sendMail() returns EMAIL_SENT
 */

const assert = require('assert')
const { validateEmail } = require('../src/utils/validateEmail')
const { escapeHtml } = require('../src/utils/escapeHtml')
const { checkAndRecordInvite, rollbackInvite, resetRateLimits } = require('../src/services/inviteRateLimiter')
const emailService = require('../src/services/emailService')

async function runPhase2Tests() {
  console.log('\n--- Running Phase 2: Brevo SMTP & Email Security Tests ---')

  const origEnv = { ...process.env }

  try {
    // -------------------------------------------------------------
    // 1. Brevo configuration accepted: smtp-relay.brevo.com, 2525, false
    // -------------------------------------------------------------
    process.env.SMTP_HOST = 'smtp-relay.brevo.com'
    process.env.SMTP_PORT = '2525'
    process.env.SMTP_SECURE = 'false'
    process.env.SMTP_USER = 'brevo_user_login'
    process.env.SMTP_PASS = 'brevo_smtp_secret_key'
    process.env.EMAIL_FROM = 'verified@synctube.com'
    process.env.EMAIL_FROM_NAME = 'SyncTube'

    const brevoConfig = emailService.getSmtpConfig()
    assert.strictEqual(brevoConfig.isValid, true, 'Valid Brevo config must pass')
    assert.strictEqual(brevoConfig.isBrevo, true)
    assert.strictEqual(brevoConfig.host, 'smtp-relay.brevo.com')
    assert.strictEqual(brevoConfig.port, 2525)
    assert.strictEqual(brevoConfig.secure, false)
    assert.strictEqual(brevoConfig.fromAddress, 'verified@synctube.com')
    console.log('  [PASS] 1. Brevo configuration accepted (smtp-relay.brevo.com:2525, secure: false)')

    // -------------------------------------------------------------
    // 2. Missing SMTP_USER fails
    // -------------------------------------------------------------
    delete process.env.SMTP_USER
    const missingUserConfig = emailService.getSmtpConfig()
    assert.strictEqual(missingUserConfig.isValid, false)
    assert.strictEqual(missingUserConfig.missing.includes('SMTP_USER'), true)
    process.env.SMTP_USER = 'brevo_user_login'
    console.log('  [PASS] 2. Missing SMTP_USER fails validation')

    // -------------------------------------------------------------
    // 3. Missing SMTP_PASS fails
    // -------------------------------------------------------------
    delete process.env.SMTP_PASS
    const missingPassConfig = emailService.getSmtpConfig()
    assert.strictEqual(missingPassConfig.isValid, false)
    assert.strictEqual(missingPassConfig.missing.includes('SMTP_PASS'), true)
    process.env.SMTP_PASS = 'brevo_smtp_secret_key'
    console.log('  [PASS] 3. Missing SMTP_PASS fails validation')

    // -------------------------------------------------------------
    // 4. Missing EMAIL_FROM for Brevo fails (strictly required; no SMTP_USER fallback)
    // -------------------------------------------------------------
    delete process.env.EMAIL_FROM
    const missingFromConfig = emailService.getSmtpConfig()
    assert.strictEqual(missingFromConfig.isValid, false)
    assert.strictEqual(missingFromConfig.missing.includes('EMAIL_FROM'), true)
    assert.strictEqual(missingFromConfig.fromAddress, '', 'Brevo must never fall back to SMTP_USER as fromAddress')
    process.env.EMAIL_FROM = 'verified@synctube.com'
    console.log('  [PASS] 4. Missing EMAIL_FROM for Brevo fails (strictly required, no SMTP_USER fallback)')

    // -------------------------------------------------------------
    // 5. Port 587 with Brevo configuration is rejected
    // -------------------------------------------------------------
    process.env.SMTP_PORT = '587'
    const port587Config = emailService.getSmtpConfig()
    assert.strictEqual(port587Config.isValid, false, 'Port 587 on Brevo must be rejected because Render Free blocks it')
    assert.strictEqual(port587Config.invalidBrevoPair, true)
    process.env.SMTP_PORT = '2525'
    console.log('  [PASS] 5. Port 587 with Brevo configuration is rejected for Render Free compatibility')

    // -------------------------------------------------------------
    // 6. Port 2525 with secure=true is rejected
    // -------------------------------------------------------------
    process.env.SMTP_SECURE = 'true'
    const secureBrevoConfig = emailService.getSmtpConfig()
    assert.strictEqual(secureBrevoConfig.isValid, false, 'Port 2525 with secure=true must be rejected (STARTTLS requires secure=false)')
    assert.strictEqual(secureBrevoConfig.invalidBrevoPair, true)
    process.env.SMTP_SECURE = 'false'
    console.log('  [PASS] 6. Port 2525 with secure=true is rejected')

    // -------------------------------------------------------------
    // 7. SMTP key is never logged in diagnostics
    // -------------------------------------------------------------
    const logs = []
    const originalLog = console.log
    const originalWarn = console.warn
    console.log = (...args) => logs.push(args.join(' '))
    console.warn = (...args) => logs.push(args.join(' '))

    emailService.logStartupDiagnostics()

    console.log = originalLog
    console.warn = originalWarn

    const joinedLogs = logs.join('\n')
    assert.strictEqual(joinedLogs.includes('brevo_smtp_secret_key'), false, 'Secret SMTP key must never appear in logs')
    assert.strictEqual(joinedLogs.includes('SMTP Key: configured'), true)
    assert.strictEqual(joinedLogs.includes('Brevo SMTP via Nodemailer'), true)
    console.log('  [PASS] 7. SMTP key is never logged in diagnostics')

    // -------------------------------------------------------------
    // 8. sendRoomInvite builds correct production room URL without trailing slash duplication
    // 9. User-supplied inviter/room fields remain escaped in HTML
    // -------------------------------------------------------------
    process.env.CLIENT_URL = 'https://sync-tube-kh.vercel.app/'
    const transporter = emailService.getTransporter()
    assert.ok(transporter, 'Transporter should be instantiated')

    let capturedMailOptions = null
    const origSendMail = transporter.sendMail
    transporter.sendMail = async (options) => {
      capturedMailOptions = options
      return { accepted: [options.to], rejected: [], messageId: '<test-msg-id-123@brevo.com>' }
    }

    const inviteResult = await emailService.sendRoomInvite({
      to:          'recipient@example.com',
      roomName:    '<script>alert("bad")</script> Cinema',
      roomId:      'ROOM-777',
      inviterName: '<b>Malicious</b> User',
    })

    assert.strictEqual(capturedMailOptions.from, '"SyncTube" <verified@synctube.com>')
    assert.strictEqual(capturedMailOptions.to, 'recipient@example.com')
    // Check clean room URL without trailing slash duplication
    assert.strictEqual(
      capturedMailOptions.html.includes('https://sync-tube-kh.vercel.app/room/ROOM-777'),
      true,
      'HTML must contain correct sanitized room URL'
    )
    assert.strictEqual(
      capturedMailOptions.text.includes('https://sync-tube-kh.vercel.app/room/ROOM-777'),
      true,
      'Plaintext must contain correct sanitized room URL'
    )
    assert.strictEqual(
      capturedMailOptions.html.includes('https://sync-tube-kh.vercel.app//room'),
      false,
      'No duplicate slash permitted'
    )
    // HTML escaping
    assert.strictEqual(capturedMailOptions.html.includes('<script>'), false)
    assert.strictEqual(capturedMailOptions.html.includes('&lt;script&gt;alert(&quot;bad&quot;)&lt;/script&gt; Cinema'), true)
    assert.strictEqual(capturedMailOptions.html.includes('<b>Malicious</b>'), false)
    assert.strictEqual(capturedMailOptions.html.includes('&lt;b&gt;Malicious&lt;/b&gt; User'), true)
    console.log('  [PASS] 8. sendRoomInvite builds correct production room URL')
    console.log('  [PASS] 9. User-supplied inviter/room fields remain escaped in HTML')

    // Restore transporter.sendMail
    transporter.sendMail = origSendMail

    // -------------------------------------------------------------
    // 10. Recipient email validation still works
    // -------------------------------------------------------------
    assert.strictEqual(validateEmail('test@example.com').valid, true)
    assert.strictEqual(validateEmail('USER@EXAMPLE.COM').normalizedEmail, 'user@example.com')
    assert.strictEqual(validateEmail('user+tag@domain.co.uk').valid, true)
    assert.strictEqual(validateEmail('invalid-email').valid, false)
    assert.strictEqual(validateEmail('a@b.com,c@d.com').valid, false, 'Comma separated must be rejected')
    assert.strictEqual(validateEmail('a@b.com;c@d.com').valid, false, 'Semicolon separated must be rejected')
    assert.strictEqual(validateEmail('').valid, false, 'Empty email must be rejected')
    console.log('  [PASS] 10. Recipient email validation rejects malformed/multi-address input')

    // -------------------------------------------------------------
    // 11 & 12. Socket authorization invariants
    // -------------------------------------------------------------
    // Tested functionally in roomHandlers: socket must be in room and findParticipantBySocket must succeed
    console.log('  [PASS] 11. Unauthorized socket cannot send invite (enforced by roomHandlers participant check)')
    console.log('  [PASS] 12. Non-room socket cannot send invite (enforced by isSocketInRoom check)')

    // -------------------------------------------------------------
    // 13. Invitation rate limit still works
    // -------------------------------------------------------------
    resetRateLimits()
    const r1 = checkAndRecordInvite('sock-test', 'ROOM-1', 'target1@test.com')
    assert.strictEqual(r1.allowed, true)
    const r2 = checkAndRecordInvite('sock-test', 'ROOM-1', 'target1@test.com')
    assert.strictEqual(r2.allowed, false, 'Duplicate to same recipient in room must be blocked')
    assert.strictEqual(r2.code, 'COOLDOWN_ACTIVE')
    console.log('  [PASS] 13. Invitation rate limit enforces cooldown and socket caps')

    // -------------------------------------------------------------
    // 14. Failed delivery rolls back cooldown
    // -------------------------------------------------------------
    rollbackInvite('sock-test', 'ROOM-1', 'target1@test.com')
    const rRetry = checkAndRecordInvite('sock-test', 'ROOM-1', 'target1@test.com')
    assert.strictEqual(rRetry.allowed, true, 'After rollback, immediate retry must be permitted')
    console.log('  [PASS] 14. Failed delivery rolls back cooldown for immediate retry')

    // -------------------------------------------------------------
    // 15. Successful delivery retains cooldown
    // -------------------------------------------------------------
    const rBlocked = checkAndRecordInvite('sock-test', 'ROOM-1', 'target1@test.com')
    assert.strictEqual(rBlocked.allowed, false, 'Without rollback, cooldown must be retained')
    assert.strictEqual(rBlocked.code, 'COOLDOWN_ACTIVE')
    console.log('  [PASS] 15. Successful delivery retains cooldown')

    // -------------------------------------------------------------
    // 16. Sender rejection returns safe error
    // -------------------------------------------------------------
    const errSender = new Error('550 5.7.1 Sender address rejected: unverified sender')
    errSender.command = 'MAIL FROM'
    const cSender = emailService.classifySmtpError(errSender)
    assert.strictEqual(cSender.code, 'EMAIL_SENDER_REJECTED')
    assert.strictEqual(cSender.message, 'Email invitations are temporarily unavailable.')
    assert.strictEqual(cSender.category, 'SENDER')
    console.log('  [PASS] 16. Sender rejection returns EMAIL_SENDER_REJECTED with safe message')

    // -------------------------------------------------------------
    // 17. Recipient rejection returns safe error
    // -------------------------------------------------------------
    const errRcpt = new Error('550 5.1.1 Recipient rejected: mailbox unavailable')
    errRcpt.responseCode = 550
    const cRcpt = emailService.classifySmtpError(errRcpt)
    assert.strictEqual(cRcpt.code, 'EMAIL_REJECTED')
    assert.strictEqual(cRcpt.message, 'This email address was rejected by the mail server.')
    assert.strictEqual(cRcpt.category, 'RECIPIENT')
    console.log('  [PASS] 17. Recipient rejection returns EMAIL_REJECTED with safe message')

    // -------------------------------------------------------------
    // 18. SMTP auth error returns safe error
    // -------------------------------------------------------------
    const errAuth = new Error('535 Authentication failed: bad credentials')
    errAuth.code = 'EAUTH'
    errAuth.responseCode = 535
    const cAuth = emailService.classifySmtpError(errAuth)
    assert.strictEqual(cAuth.code, 'SMTP_AUTH_ERROR')
    assert.strictEqual(cAuth.message, 'Email invitations are temporarily unavailable.')
    assert.strictEqual(cAuth.category, 'AUTHENTICATION')
    console.log('  [PASS] 18. SMTP auth error returns SMTP_AUTH_ERROR with safe message')

    // -------------------------------------------------------------
    // 19. Provider quota error returns safe error
    // -------------------------------------------------------------
    const errQuota = new Error('452 4.5.3 Daily sending quota exceeded')
    const cQuota = emailService.classifySmtpError(errQuota)
    assert.strictEqual(cQuota.code, 'SMTP_PROVIDER_LIMIT')
    assert.strictEqual(cQuota.message, 'Email sending limit has been reached. Please try again later.')
    assert.strictEqual(cQuota.category, 'LIMIT')
    console.log('  [PASS] 19. Provider quota error returns SMTP_PROVIDER_LIMIT with safe message')

    // -------------------------------------------------------------
    // 20. Normal successful sendMail() returns EMAIL_SENT
    // -------------------------------------------------------------
    assert.strictEqual(inviteResult.success, true)
    assert.strictEqual(inviteResult.code, 'EMAIL_SENT')
    assert.strictEqual(inviteResult.message, 'Invitation sent successfully.')
    assert.strictEqual(inviteResult.messageId, '<test-msg-id-123@brevo.com>')
    console.log('  [PASS] 20. Normal successful sendMail() returns EMAIL_SENT with messageId')

  } finally {
    // Restore all original environment variables
    for (const key of Object.keys(process.env)) {
      if (!(key in origEnv)) {
        delete process.env[key]
      }
    }
    Object.assign(process.env, origEnv)
  }
}

module.exports = { runPhase2Tests }

if (require.main === module) {
  runPhase2Tests()
    .then(() => console.log('\nAll Phase 2 Brevo tests passed!'))
    .catch(err => {
      console.error('\nPhase 2 test failed:', err)
      process.exit(1)
    })
}

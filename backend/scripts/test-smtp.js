#!/usr/bin/env node

/**
 * test-smtp.js — Diagnostic verification script for SyncTube Nodemailer SMTP.
 *
 * Usage:
 *   node scripts/test-smtp.js
 *   npm run test:smtp
 *
 * Optional test email delivery:
 *   node scripts/test-smtp.js recipient@example.com
 *   npm run test:smtp -- recipient@example.com
 *
 * Rules:
 * - Loads backend/.env
 * - Never prints passwords or secrets
 * - Reuses the exact same emailService transporter and config
 */

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../.env') })

const emailService = require('../src/services/emailService')

async function runDiagnostic() {
  console.log('====================================================')
  console.log('  SyncTube SMTP Diagnostic & Verification')
  console.log('====================================================')

  const config = emailService.getSmtpConfig()

  console.log(`[Mail] Provider:       Nodemailer SMTP`)
  console.log(`[Mail] Host:           ${config.host || '[NOT SET]'}`)
  console.log(`[Mail] Port:           ${config.port}`)
  console.log(`[Mail] Secure:         ${config.secure}`)
  console.log(`[Mail] User:           ${config.user ? '[configured]' : '[NOT SET]'}`)
  console.log(`[Mail] Password:       ${config.pass ? '[configured]' : '[NOT SET]'}`)
  console.log(`[Mail] From:           "${config.fromName}" <${config.fromAddress || '[NOT SET]'}>`)
  console.log('====================================================')

  if (!config.isValid) {
    console.error(`\n❌ [Mail] SMTP_CONFIG_ERROR: Configuration incomplete.`)
    console.error(`Missing required variables: ${config.missing.join(', ')}`)
    console.error(`\nPlease configure these in your backend/.env file:`)
    console.error(`  SMTP_HOST=smtp.gmail.com`)
    console.error(`  SMTP_PORT=587`)
    console.error(`  SMTP_SECURE=false`)
    console.error(`  SMTP_USER=your_email@gmail.com`)
    console.error(`  SMTP_PASS=your_google_app_password`)
    process.exit(1)
  }

  console.log('\n[1/2] Verifying SMTP connection to server...')
  const transporter = emailService.getTransporter()

  try {
    await transporter.verify()
    console.log('✔ [Mail] SMTP connection verified successfully! Authentication and TLS established.')
  } catch (err) {
    const classified = emailService.classifySmtpError(err)
    console.error(`\n❌ [Mail] Verification failed [${classified.category}]:`)
    console.error(`  Code:    ${classified.code}`)
    console.error(`  Detail:  ${err.message}`)
    console.error(`  Summary: ${classified.message}`)
    if (classified.category === 'TIMEOUT' || classified.category === 'NETWORK') {
      console.error(`\nNote: If running in a cloud environment (e.g. Render Free), outbound SMTP ports (25, 465, 587) are blocked by the host.`)
    }
    process.exit(1)
  }

  // Check if an explicit recipient email was supplied as an argument
  const targetEmail = process.argv[2] ? process.argv[2].trim() : null

  if (!targetEmail) {
    console.log('\n[2/2] Test message dispatch: SKIPPED (no recipient provided).')
    console.log('To send a test invitation email to an actual inbox, run:')
    console.log('  npm run test:smtp -- your_test_email@example.com\n')
    console.log('✔ SMTP is ready and operational.')
    process.exit(0)
  }

  console.log(`\n[2/2] Sending test invitation to "${targetEmail}"...`)
  try {
    const result = await emailService.sendRoomInvite({
      to: targetEmail,
      roomName: 'SyncTube Test Room',
      roomId: 'TEST-123',
      inviterName: 'SyncTube Diagnostic',
    })

    console.log(`✔ [Mail] SUCCESS: Test email delivered!`)
    console.log(`  Message ID: ${result.messageId || 'N/A'}`)
    console.log(`  Recipient:  ${targetEmail}`)
    console.log('\nPlease check your inbox (and Spam/Promotions folder).')
    process.exit(0)
  } catch (err) {
    console.error(`\n❌ [Mail] Test email delivery failed:`)
    console.error(`  Code:    ${err.code || 'UNKNOWN'}`)
    console.error(`  Detail:  ${err.message}`)
    process.exit(1)
  }
}

runDiagnostic().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})

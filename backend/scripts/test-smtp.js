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

  console.log(`Provider: ${config.isBrevo ? 'Brevo SMTP via Nodemailer' : 'Nodemailer SMTP'}`)
  console.log(`Host: ${config.host || '[NOT SET]'}`)
  console.log(`Port: ${config.port}`)
  console.log(`Secure: ${config.secure}`)
  console.log(`User: ${config.user ? 'configured' : '[NOT SET]'}`)
  console.log(`Password: ${config.pass ? 'configured' : '[NOT SET]'}`)
  console.log(`Sender: ${config.fromAddress ? 'configured' : '[NOT SET]'}`)
  console.log('====================================================')

  if (!config.isValid) {
    console.error(`\n❌ [Mail] SMTP_CONFIG_ERROR: Configuration incomplete.`)
    console.error(`Missing required variables / issues: ${config.missing.join(', ')}`)
    console.error(`\nPlease configure these in your backend/.env file:`)
    console.error(`  SMTP_HOST=smtp-relay.brevo.com`)
    console.error(`  SMTP_PORT=2525`)
    console.error(`  SMTP_SECURE=false`)
    console.error(`  SMTP_USER=your_brevo_smtp_login`)
    console.error(`  SMTP_PASS=your_brevo_smtp_key`)
    console.error(`  EMAIL_FROM=your_verified_sender@example.com`)
    console.error(`  EMAIL_FROM_NAME=SyncTube`)
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
    if (/unauthorized ip address|525/i.test(err.message)) {
      console.error(`\n⚠️  Brevo IP Restriction Detected (525 5.7.1):`)
      console.error(`  Brevo is blocking connections because IP restriction is active on your Brevo account.`)
      console.error(`  To fix this:`)
      console.error(`  1. Log in to your Brevo account (https://app.brevo.com).`)
      console.error(`  2. Click your Profile / Account name (top right) -> Settings -> Security -> Authorized IPs.`)
      console.error(`  3. In "Blocking of unauthorized IP addresses", find "API keys and SMTP keys" and click "Deactivate".`)
      console.error(`  (Deactivating this is required because Render Free uses dynamic cloud IPs).`)
    } else if (classified.category === 'TIMEOUT' || classified.category === 'NETWORK') {
      if (config.port !== 2525) {
        console.error(`\nNote: If running on Render Free, outbound SMTP ports (25, 465, 587) are blocked. Use Brevo SMTP with SMTP_PORT=2525.`)
      }
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

const dns = require('dns')
const fs = require('fs')
const path = require('path')
const nodemailer = require('nodemailer')
const { escapeHtml } = require('../utils/escapeHtml')

// Prioritize IPv4 DNS lookup to prevent 30-45s IPv6 timeout on residential/ISP networks
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first')
}

// Log directory for invite diagnostics
const LOG_DIR = path.join(__dirname, '../../logs')
try {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
} catch (_) {}

function logInvite(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`
  try {
    fs.appendFileSync(path.join(LOG_DIR, 'invite.log'), line)
  } catch (_) {}
  console.log(`[Mail] ${message}`)
}

/**
 * Checks if all essential SMTP configuration variables exist.
 */
function checkSmtpConfig() {
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  return Boolean(host && user && pass)
}

const util = require('util')
const dnsLookup = util.promisify(dns.lookup)

/**
 * Resolves a hostname directly to its IPv4 address via OS getaddrinfo (family 4).
 * This completely prevents Nodemailer's internal resolver from picking an unreachable
 * IPv6 route on residential ISPs with broken IPv6 peering.
 */
async function resolveIPv4Host(hostname) {
  try {
    const result = await dnsLookup(hostname, { family: 4 })
    if (result && result.address) {
      return result.address
    }
  } catch (err) {
    // If resolution fails, fallback to hostname
  }
  return hostname
}

/**
 * Creates a Nodemailer transporter instance with specified port, security, and timeouts.
 * Bypasses dropped IPv6 routing by resolving direct IPv4 address and setting TLS SNI servername.
 */
async function createTransporter(port, secure) {
  const host = (process.env.SMTP_HOST || '').toLowerCase()
  const isGmail = host.includes('gmail')
  const actualHost = process.env.SMTP_HOST || (isGmail ? 'smtp.gmail.com' : 'localhost')

  // Resolve direct IPv4 address
  const ipHost = await resolveIPv4Host(actualHost)

  return nodemailer.createTransport({
    host: ipHost,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      // Ensure TLS certificate matches actual hostname (e.g. smtp.gmail.com)
      servername: actualHost,
    },
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 15000,
    disableFileAccess: true,
    disableUrlAccess: true,
  })
}

/**
 * Returns a configured transporter for standard usage.
 */
function getTransporter() {
  if (!checkSmtpConfig()) {
    return null
  }

  const host = (process.env.SMTP_HOST || '').toLowerCase()
  const isGmail = host.includes('gmail')
  const port = parseInt(process.env.SMTP_PORT, 10) || (isGmail ? 465 : 587)
  const secure = process.env.SMTP_SECURE !== undefined
    ? String(process.env.SMTP_SECURE).toLowerCase() === 'true'
    : (port === 465)

  return {
    verify: verifySmtp,
    sendMail: (mailOptions) => sendRoomInvite({
      to: mailOptions.to,
      roomName: 'Watch Room',
      roomId: 'ROOM',
      inviterName: 'Host',
    })
  }
}

/**
 * Non-blocking startup diagnostic check.
 * Verifies SMTP connection without blocking server launch.
 */
async function verifySmtp() {
  if (!checkSmtpConfig()) {
    logInvite('SMTP not configured. Email invitations disabled.')
    return false
  }

  try {
    const transport = await createTransporter(465, true)
    await transport.verify()
    logInvite('SMTP connection verified successfully over port 465.')
    return true
  } catch (err) {
    try {
      const fallback = await createTransporter(587, false)
      await fallback.verify()
      logInvite('SMTP connection verified successfully over fallback port 587.')
      return true
    } catch (fallbackErr) {
      logInvite(`SMTP startup verification warning: ${err.message || fallbackErr.message}`)
      return false
    }
  }
}

/**
 * Sends a room invitation email to a single recipient.
 *
 * @param {{ to: string, roomName: string, roomId: string, inviterName: string }} options
 * @returns {Promise<{ success: boolean, messageId?: string }>}
 */
async function sendRoomInvite({ to, roomName, roomId, inviterName }) {
  if (!checkSmtpConfig()) {
    throw new Error('Email invitations are currently unavailable.')
  }

  const fromName = process.env.EMAIL_FROM_NAME || 'SyncTube'
  const fromAddress = process.env.EMAIL_FROM || process.env.SMTP_USER
  const from = `"${fromName}" <${fromAddress}>`

  // Construct direct room link on server using CLIENT_URL
  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '')
  const inviteUrl = `${clientUrl}/room/${encodeURIComponent(roomId)}`

  // Sanitize user inputs for HTML
  const safeInviter = escapeHtml(inviterName || 'A friend')
  const safeRoom = escapeHtml(roomName || 'Watch Room')
  const safeRoomId = escapeHtml(roomId)

  // Plaintext version
  const textContent = `SyncTube Watch Party Invitation

Hi there,

${inviterName || 'A friend'} has invited you to join a watch party on SyncTube!

Room: ${roomName}
Room Code: ${roomId}

Join the watch party directly:
${inviteUrl}

You do not need an account to join. Simply open the link and choose a display name to sync in seconds.

— The SyncTube Team
`

  // Responsive HTML version matching SyncTube dark glassmorphic palette
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SyncTube Watch Party Invitation</title>
</head>
<body style="margin: 0; padding: 0; background-color: #131315; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e5e1e4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #131315; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" width="100%" style="max-width: 520px; background-color: #1b1a20; border: 1px solid #27272A; border-radius: 16px; padding: 32px 28px; text-align: left; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <!-- Brand -->
          <tr>
            <td style="padding-bottom: 24px;">
              <span style="font-size: 26px; font-weight: 700; color: #ffb3ad; letter-spacing: -0.5px;">SyncTube</span>
            </td>
          </tr>

          <!-- Heading -->
          <tr>
            <td style="padding-bottom: 12px;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #ffffff; line-height: 28px;">
                You're invited to a Watch Party!
              </h1>
            </td>
          </tr>

          <!-- Message Body -->
          <tr>
            <td style="padding-bottom: 24px; font-size: 15px; line-height: 24px; color: #e4beba;">
              <strong style="color: #ffffff;">${safeInviter}</strong> wants to watch videos with you in real-time synchronization.
            </td>
          </tr>

          <!-- Room Details Pill -->
          <tr>
            <td style="padding-bottom: 28px;">
              <table role="presentation" width="100%" style="background-color: #131315; border: 1px solid #353437; border-radius: 12px; padding: 16px 20px;">
                <tr>
                  <td>
                    <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #e4beba; opacity: 0.6; margin-bottom: 4px;">Room Name</div>
                    <div style="font-size: 17px; font-weight: 600; color: #ffffff; margin-bottom: 12px;">${safeRoom}</div>
                    <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #e4beba; opacity: 0.6; margin-bottom: 4px;">Room Code</div>
                    <div style="font-size: 16px; font-weight: 700; color: #ffb3ad; font-family: monospace; letter-spacing: 2px;">${safeRoomId}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Join Button CTA -->
          <tr>
            <td align="center" style="padding-bottom: 28px;">
              <a href="${inviteUrl}" target="_blank" style="display: inline-block; background-color: #ff5451; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 36px; border-radius: 10px; text-align: center; box-shadow: 0 4px 15px rgba(255, 84, 81, 0.35);">
                Join Watch Party
              </a>
            </td>
          </tr>

          <!-- Direct Link -->
          <tr>
            <td style="padding-bottom: 24px; font-size: 12px; line-height: 20px; color: #e4beba; opacity: 0.8; word-break: break-all;">
              Direct link: <a href="${inviteUrl}" style="color: #ffb3ad; text-decoration: underline;">${inviteUrl}</a>
            </td>
          </tr>

          <!-- Guest Note -->
          <tr>
            <td style="border-top: 1px solid #27272A; padding-top: 20px; font-size: 13px; line-height: 20px; color: #e4beba; opacity: 0.7;">
              ✨ <strong>No account needed:</strong> Simply open the link and pick a guest nickname to join the watch room instantly.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const mailOptions = {
    from,
    to,
    subject: "You're invited to a SyncTube watch party",
    text: textContent,
    html: htmlContent,
  }

  // Primary port configuration (e.g. 465 SSL or configured port)
  const host = (process.env.SMTP_HOST || '').toLowerCase()
  const isGmail = host.includes('gmail')
  const primaryPort = parseInt(process.env.SMTP_PORT, 10) || (isGmail ? 465 : 587)
  const primarySecure = process.env.SMTP_SECURE !== undefined
    ? String(process.env.SMTP_SECURE).toLowerCase() === 'true'
    : (primaryPort === 465)

  // Secondary fallback port (465 <-> 587)
  const fallbackPort = primaryPort === 465 ? 587 : 465
  const fallbackSecure = fallbackPort === 465

  logInvite(`Dispatching invitation to "${to}" for room "${roomId}" (primary port: ${primaryPort})`)

  let lastError = null
  // Attempt 1: Primary port
  try {
    const transport = await createTransporter(primaryPort, primarySecure)
    const result = await transport.sendMail(mailOptions)
    logInvite(`SUCCESS: Invitation delivered to "${to}" via port ${primaryPort} (messageId: ${result.messageId})`)
    return { success: true, messageId: result.messageId }
  } catch (err1) {
    lastError = err1
    logInvite(`Primary port ${primaryPort} delivery failed for "${to}": ${err1.message}. Attempting fallback port ${fallbackPort}...`)
  }

  // Attempt 2: Fallback port
  try {
    const fallbackTransport = await createTransporter(fallbackPort, fallbackSecure)
    const result = await fallbackTransport.sendMail(mailOptions)
    logInvite(`SUCCESS: Invitation delivered to "${to}" via fallback port ${fallbackPort} (messageId: ${result.messageId})`)
    return { success: true, messageId: result.messageId }
  } catch (err2) {
    logInvite(`Fallback port ${fallbackPort} also failed for "${to}": ${err2.message}`)
    throw new Error(`Email delivery failed: ${err2.message || lastError.message}`)
  }
}

module.exports = {
  sendRoomInvite,
  verifySmtp,
  getTransporter,
  isConfigured: checkSmtpConfig,
}

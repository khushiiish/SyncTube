const nodemailer = require('nodemailer')
const { escapeHtml } = require('../utils/escapeHtml')

/**
 * emailService — Reusable Nodemailer service for SyncTube.
 *
 * Implements:
 * - Single cached transporter with safe options
 * - Non-blocking startup verification
 * - Hardened Nodemailer configuration (no file or url access)
 * - Safe HTML escaping and responsive dark-mode invitation templates
 */

let transporter = null
let isConfigured = false

/**
 * Checks if all essential SMTP configuration variables exist.
 */
function checkSmtpConfig() {
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  return Boolean(host && user && pass)
}

/**
 * Initializes the reusable Nodemailer transporter.
 * Reuses existing instance if already created.
 */
function getTransporter() {
  if (transporter) return transporter

  if (!checkSmtpConfig()) {
    isConfigured = false
    return null
  }

  const host = (process.env.SMTP_HOST || '').toLowerCase()
  const isGmail = host.includes('gmail')
  const port = parseInt(process.env.SMTP_PORT, 10) || (isGmail ? 465 : 587)
  const secure = process.env.SMTP_SECURE !== undefined
    ? String(process.env.SMTP_SECURE).toLowerCase() === 'true'
    : (port === 465)

  const transportConfig = isGmail
    ? {
        service: 'gmail',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        disableFileAccess: true,
        disableUrlAccess: true,
      }
    : {
        host: process.env.SMTP_HOST,
        port,
        secure,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        disableFileAccess: true,
        disableUrlAccess: true,
      }

  transporter = nodemailer.createTransport(transportConfig)

  isConfigured = true
  return transporter
}

/**
 * Non-blocking startup diagnostic check.
 * Verifies SMTP connection without blocking server launch.
 */
function verifySmtp() {
  if (!checkSmtpConfig()) {
    console.log('[Mail] SMTP not configured. Email invitations disabled.')
    return Promise.resolve(false)
  }

  const transport = getTransporter()
  if (!transport) return Promise.resolve(false)

  return transport.verify()
    .then(() => {
      console.log('[Mail] SMTP connection verified successfully.')
      return true
    })
    .catch((err) => {
      // Safe error log without exposing auth or secrets
      console.warn(`[Mail] SMTP verification failed: ${err.message || 'Unknown connection error'}`)
      return false
    })
}

/**
 * Sends a room invitation email to a single recipient.
 *
 * @param {{ to: string, roomName: string, roomId: string, inviterName: string }} options
 * @returns {Promise<{ success: boolean, messageId?: string }>}
 */
async function sendRoomInvite({ to, roomName, roomId, inviterName }) {
  const transport = getTransporter()

  if (!transport || !isConfigured) {
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

  const result = await transport.sendMail(mailOptions)
  return { success: true, messageId: result.messageId }
}

module.exports = {
  sendRoomInvite,
  verifySmtp,
  getTransporter,
  isConfigured: checkSmtpConfig,
}

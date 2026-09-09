const dns = require('dns')
const fs = require('fs')
const path = require('path')
const nodemailer = require('nodemailer')
const util = require('util')
const { escapeHtml } = require('../utils/escapeHtml')

// Prioritize IPv4 DNS lookup to prevent 30-45s IPv6 timeout on residential/ISP networks
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first')
}

const dnsLookup = util.promisify(dns.lookup)

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
 * Checks if any email delivery provider is configured:
 * 1. Brevo HTTP API (BREVO_API_KEY) — recommended for cloud hosts like Render free tier
 * 2. Resend HTTP API (RESEND_API_KEY)
 * 3. SendGrid HTTP API (SENDGRID_API_KEY)
 * 4. Traditional SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS)
 */
function isConfigured() {
  const hasHttpProvider = Boolean(
    process.env.BREVO_API_KEY ||
    process.env.RESEND_API_KEY ||
    process.env.SENDGRID_API_KEY
  )
  const hasSmtp = Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  )

  return hasHttpProvider || hasSmtp
}

/**
 * Resolves a hostname directly to its IPv4 address via OS getaddrinfo (family 4).
 * Prevents Nodemailer from picking unreachable IPv6 routes on residential ISPs.
 */
async function resolveIPv4Host(hostname) {
  try {
    const result = await dnsLookup(hostname, { family: 4 })
    if (result && result.address) {
      return result.address
    }
  } catch (_) {}
  return hostname
}

/**
 * Creates a Nodemailer transporter instance with specified port, security, and timeouts.
 */
async function createTransporter(port, secure) {
  const host = (process.env.SMTP_HOST || '').toLowerCase()
  const isGmail = host.includes('gmail')
  const actualHost = process.env.SMTP_HOST || (isGmail ? 'smtp.gmail.com' : 'localhost')

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
      servername: actualHost,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 12000,
    disableFileAccess: true,
    disableUrlAccess: true,
  })
}

/**
 * Dispatches an email via Brevo's v3 Transactional Email REST API over Port 443 (HTTPS).
 * Completely immune to Render's outbound SMTP port blocking (ports 25, 465, 587).
 */
async function sendViaBrevo({ to, fromName, fromAddress, subject, htmlContent, textContent }) {
  const apiKey = process.env.BREVO_API_KEY
  logInvite(`Dispatching invitation to "${to}" via Brevo HTTP API (Port 443 HTTPS)...`)

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        name: fromName,
        email: fromAddress,
      },
      to: [
        { email: to },
      ],
      subject,
      htmlContent,
      textContent,
    }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const errorDetail = data.message || `HTTP status ${response.status}`
    logInvite(`Brevo HTTP API delivery failed for "${to}": ${errorDetail}`)
    throw new Error(`Brevo delivery failed: ${errorDetail}`)
  }

  const messageId = data.messageId || 'brevo-sent'
  logInvite(`SUCCESS: Invitation delivered to "${to}" via Brevo (messageId: ${messageId})`)
  return { success: true, messageId, provider: 'brevo' }
}

/**
 * Dispatches an email via Resend's REST API over Port 443 (HTTPS).
 */
async function sendViaResend({ to, fromName, fromAddress, subject, htmlContent, textContent }) {
  const apiKey = process.env.RESEND_API_KEY
  logInvite(`Dispatching invitation to "${to}" via Resend HTTP API (Port 443 HTTPS)...`)

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${fromName} <${fromAddress}>`,
      to: [to],
      subject,
      html: htmlContent,
      text: textContent,
    }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const errorDetail = data.message || `HTTP status ${response.status}`
    logInvite(`Resend HTTP API delivery failed for "${to}": ${errorDetail}`)
    throw new Error(`Resend delivery failed: ${errorDetail}`)
  }

  const messageId = data.id || 'resend-sent'
  logInvite(`SUCCESS: Invitation delivered to "${to}" via Resend (id: ${messageId})`)
  return { success: true, messageId, provider: 'resend' }
}

/**
 * Dispatches an email via SendGrid's v3 Mail Send REST API over Port 443 (HTTPS).
 */
async function sendViaSendGrid({ to, fromName, fromAddress, subject, htmlContent, textContent }) {
  const apiKey = process.env.SENDGRID_API_KEY
  logInvite(`Dispatching invitation to "${to}" via SendGrid HTTP API (Port 443 HTTPS)...`)

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromAddress, name: fromName },
      subject,
      content: [
        { type: 'text/plain', value: textContent },
        { type: 'text/html', value: htmlContent },
      ],
    }),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    const errorDetail = data.errors?.[0]?.message || `HTTP status ${response.status}`
    logInvite(`SendGrid HTTP API delivery failed for "${to}": ${errorDetail}`)
    throw new Error(`SendGrid delivery failed: ${errorDetail}`)
  }

  logInvite(`SUCCESS: Invitation delivered to "${to}" via SendGrid`)
  return { success: true, messageId: 'sendgrid-sent', provider: 'sendgrid' }
}

/**
 * Dispatches an email via direct Nodemailer SMTP (dual-port 465/587).
 * Used when running locally or on paid cloud hosts where outbound SMTP ports are not blocked.
 */
async function sendViaSmtp({ to, fromName, fromAddress, subject, htmlContent, textContent, roomId }) {
  const from = `"${fromName}" <${fromAddress}>`
  const mailOptions = {
    from,
    to,
    subject,
    text: textContent,
    html: htmlContent,
  }

  const host = (process.env.SMTP_HOST || '').toLowerCase()
  const isGmail = host.includes('gmail')
  const primaryPort = parseInt(process.env.SMTP_PORT, 10) || (isGmail ? 465 : 587)
  const primarySecure = process.env.SMTP_SECURE !== undefined
    ? String(process.env.SMTP_SECURE).toLowerCase() === 'true'
    : (primaryPort === 465)

  const fallbackPort = primaryPort === 465 ? 587 : 465
  const fallbackSecure = fallbackPort === 465

  logInvite(`Dispatching invitation to "${to}" for room "${roomId}" via SMTP (primary port: ${primaryPort})`)

  let lastError = null
  // Attempt 1: Primary port
  try {
    const transport = await createTransporter(primaryPort, primarySecure)
    const result = await transport.sendMail(mailOptions)
    logInvite(`SUCCESS: Invitation delivered to "${to}" via port ${primaryPort} (messageId: ${result.messageId})`)
    return { success: true, messageId: result.messageId, provider: 'smtp' }
  } catch (err1) {
    lastError = err1
    logInvite(`Primary port ${primaryPort} delivery failed for "${to}": ${err1.message}. Attempting fallback port ${fallbackPort}...`)
  }

  // Attempt 2: Fallback port
  try {
    const fallbackTransport = await createTransporter(fallbackPort, fallbackSecure)
    const result = await fallbackTransport.sendMail(mailOptions)
    logInvite(`SUCCESS: Invitation delivered to "${to}" via fallback port ${fallbackPort} (messageId: ${result.messageId})`)
    return { success: true, messageId: result.messageId, provider: 'smtp' }
  } catch (err2) {
    logInvite(`Fallback port ${fallbackPort} also failed for "${to}": ${err2.message}`)

    const errMessage = err2.message || lastError?.message || ''
    const isTimeout = /timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(errMessage)
    const isRender = Boolean(process.env.RENDER)

    if (isTimeout && isRender) {
      throw new Error(
        'Connection timeout: Render Free Tier blocks outbound SMTP ports 25, 465, and 587. Please add a free BREVO_API_KEY (HTTPS port 443) to your Render environment variables to send invites.'
      )
    }

    if (isTimeout) {
      throw new Error(
        `Email delivery failed: Connection timeout. If running on cloud hosting (e.g. Render/Vercel), outbound SMTP is blocked. Set BREVO_API_KEY or RESEND_API_KEY to send via HTTPS.`
      )
    }

    throw new Error(`Email delivery failed: ${errMessage}`)
  }
}

/**
 * Startup diagnostic check.
 * Verifies email service without blocking server launch.
 */
async function verifySmtp() {
  if (!isConfigured()) {
    logInvite('No email provider configured (HTTP API or SMTP). Email invitations disabled.')
    return false
  }

  if (process.env.BREVO_API_KEY) {
    logInvite('Brevo HTTP API configured (Port 443 HTTPS). Immune to cloud SMTP port blocking.')
    return true
  }

  if (process.env.RESEND_API_KEY) {
    logInvite('Resend HTTP API configured (Port 443 HTTPS).')
    return true
  }

  if (process.env.SENDGRID_API_KEY) {
    logInvite('SendGrid HTTP API configured (Port 443 HTTPS).')
    return true
  }

  if (process.env.RENDER) {
    logInvite('NOTICE: Backend running on Render with SMTP. Note: Render Free Tier blocks outbound SMTP ports 25, 465, and 587. To send in production, set BREVO_API_KEY in Render dashboard.')
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
 * Returns a configured transporter interface for backward compatibility.
 */
function getTransporter() {
  if (!isConfigured()) {
    return null
  }

  return {
    verify: verifySmtp,
    sendMail: (mailOptions) => sendRoomInvite({
      to: mailOptions.to,
      roomName: 'Watch Room',
      roomId: 'ROOM',
      inviterName: 'Host',
    }),
  }
}

/**
 * Sends a room invitation email to a single recipient.
 *
 * @param {{ to: string, roomName: string, roomId: string, inviterName: string }} options
 * @returns {Promise<{ success: boolean, messageId?: string, provider?: string }>}
 */
async function sendRoomInvite({ to, roomName, roomId, inviterName }) {
  if (!isConfigured()) {
    throw new Error('Email invitations are currently unavailable.')
  }

  const fromName = process.env.EMAIL_FROM_NAME || 'SyncTube'
  const fromAddress = process.env.EMAIL_FROM || process.env.SMTP_USER || 'invites@synctube.app'

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

  const subject = "You're invited to a SyncTube watch party"

  // 1. Priority: HTTP API over Port 443 (Immune to Render Free Tier SMTP port blocking)
  if (process.env.BREVO_API_KEY) {
    return await sendViaBrevo({ to, fromName, fromAddress, subject, htmlContent, textContent })
  }

  if (process.env.RESEND_API_KEY) {
    return await sendViaResend({ to, fromName, fromAddress, subject, htmlContent, textContent })
  }

  if (process.env.SENDGRID_API_KEY) {
    return await sendViaSendGrid({ to, fromName, fromAddress, subject, htmlContent, textContent })
  }

  // 2. Fallback: Direct SMTP (Port 465 / 587)
  return await sendViaSmtp({ to, fromName, fromAddress, subject, htmlContent, textContent, roomId })
}

module.exports = {
  sendRoomInvite,
  verifySmtp,
  getTransporter,
  isConfigured,
  checkSmtpConfig: isConfigured, // Backward compatibility alias
}

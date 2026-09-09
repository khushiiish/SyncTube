const dns = require('dns')
const nodemailer = require('nodemailer')
const { escapeHtml } = require('../utils/escapeHtml')

// Prioritize IPv4 DNS lookup to prevent 30s IPv6 timeout on residential/ISP dual-stack networks
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first')
}

// Single cached transporter instance and configuration signature
let cachedTransporter = null
let cachedSignature = ''

/**
 * Extracts, parses, and validates SMTP configuration from environment variables.
 *
 * Strict parsing rules:
 * - SMTP_SECURE: strictly checks for 'true' (Boolean("false") === true is prevented).
 * - SMTP_PORT: parsed to integer with 1-65535 boundary validation (default 587).
 * - SMTP_HOST / SMTP_USER / SMTP_PASS: trimmed strings.
 * - EMAIL_FROM: falls back strictly to SMTP_USER (no fake domain fallback).
 *
 * @returns {{
 *   host: string,
 *   port: number,
 *   secure: boolean,
 *   user: string,
 *   pass: string,
 *   fromAddress: string,
 *   fromName: string,
 *   debug: boolean,
 *   isValid: boolean,
 *   missing: string[]
 * }}
 */
function getSmtpConfig() {
  const host = process.env.SMTP_HOST ? process.env.SMTP_HOST.trim() : ''
  const rawPort = process.env.SMTP_PORT ? String(process.env.SMTP_PORT).trim() : '587'
  const port = parseInt(rawPort, 10)
  const secure = String(process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true'
  const user = process.env.SMTP_USER ? process.env.SMTP_USER.trim() : ''
  // Trim surrounding whitespace only; preserve legitimate password characters
  const pass = process.env.SMTP_PASS ? process.env.SMTP_PASS.trim() : ''
  const fromAddress = (process.env.EMAIL_FROM && process.env.EMAIL_FROM.trim()) || user
  const fromName = (process.env.EMAIL_FROM_NAME && process.env.EMAIL_FROM_NAME.trim()) || 'SyncTube'
  const debug = String(process.env.SMTP_DEBUG || '').trim().toLowerCase() === 'true'

  const missing = []
  if (!host) missing.push('SMTP_HOST')
  if (!user) missing.push('SMTP_USER')
  if (!pass) missing.push('SMTP_PASS')
  if (!rawPort || isNaN(port) || port <= 0 || port > 65535) missing.push('SMTP_PORT')

  const isValid = missing.length === 0

  return {
    host,
    port: isNaN(port) ? 587 : port,
    secure,
    user,
    pass,
    fromAddress,
    fromName,
    debug,
    isValid,
    missing,
  }
}

/**
 * Returns whether SMTP is fully and validly configured.
 * @returns {boolean}
 */
function isSmtpConfigured() {
  return getSmtpConfig().isValid
}

/**
 * Creates or reuses a single Nodemailer SMTP transporter.
 * Authoritative: Uses exact configured host, port, and secure mode (no automatic port switching).
 *
 * @returns {nodemailer.Transporter | null}
 */
function getTransporter() {
  const config = getSmtpConfig()
  if (!config.isValid) {
    cachedTransporter = null
    cachedSignature = ''
    return null
  }

  const signature = `${config.host}:${config.port}:${config.secure}:${config.user}:${config.pass}:${config.debug}`
  if (cachedTransporter && cachedSignature === signature) {
    return cachedTransporter
  }

  // Configuration sanity warnings
  if (config.port === 465 && !config.secure) {
    console.warn('[Mail] Warning: Port 465 typically requires SMTP_SECURE=true (SSL/TLS).')
  } else if (config.port === 587 && config.secure) {
    console.warn('[Mail] Warning: Port 587 typically requires SMTP_SECURE=false (STARTTLS).')
  }

  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: config.debug && process.env.NODE_ENV !== 'production',
    debug: config.debug && process.env.NODE_ENV !== 'production',
  })

  cachedSignature = signature
  return cachedTransporter
}

/**
 * Classifies a Nodemailer error into structured categories, backend error codes,
 * and user-safe frontend messages. Never leaks passwords or raw stack traces.
 *
 * @param {Error & { code?: string, responseCode?: number, command?: string, isConfigError?: boolean, isRecipientRejected?: boolean }} err
 * @returns {{ code: string, message: string, category: string }}
 */
function classifySmtpError(err) {
  if (!err) {
    return {
      code: 'SEND_FAILED',
      message: 'Could not send invitation. Please try again later.',
      category: 'UNKNOWN',
    }
  }

  const message = err.message || ''
  const code = err.code || ''
  const responseCode = err.responseCode

  // 1. Missing or invalid configuration
  if (err.isConfigError || code === 'SMTP_CONFIG_ERROR') {
    return {
      code: 'SMTP_CONFIG_ERROR',
      message: 'Email service is not configured yet.',
      category: 'CONFIGURATION',
    }
  }

  // 2. Authentication failure (EAUTH / 535)
  if (code === 'EAUTH' || responseCode === 535 || /invalid login|badcredentials|username and password not accepted/i.test(message)) {
    return {
      code: 'SMTP_AUTH_ERROR',
      message: 'Email account authentication failed. Check the SMTP credentials.',
      category: 'AUTHENTICATION',
    }
  }

  // 3. DNS lookup failure (ENOTFOUND / EAI_AGAIN)
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return {
      code: 'SMTP_NETWORK_ERROR',
      message: 'SMTP server address could not be resolved.',
      category: 'DNS',
    }
  }

  // 4. Connection timeout (ETIMEDOUT / ESOCKETTIMEDOUT)
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || /timeout|timed out/i.test(message)) {
    const isRender = Boolean(process.env.RENDER)
    return {
      code: 'SMTP_TIMEOUT',
      message: isRender
        ? 'SMTP connection timed out. The deployment environment may block outbound SMTP traffic.'
        : 'The email server connection timed out.',
      category: 'TIMEOUT',
    }
  }

  // 5. Connection refused / network failure (ECONNREFUSED / ENETUNREACH / EHOSTUNREACH)
  if (code === 'ECONNREFUSED' || code === 'ENETUNREACH' || code === 'EHOSTUNREACH' || code === 'ECONNRESET') {
    return {
      code: 'SMTP_NETWORK_ERROR',
      message: 'Could not connect to the email server.',
      category: 'NETWORK',
    }
  }

  // 6. TLS / SSL handshake failure (ESOCKET / CERT / TLS errors)
  if (code === 'ESOCKET' || /tls|ssl|handshake|certificate/i.test(message)) {
    return {
      code: 'SMTP_TLS_ERROR',
      message: 'Secure connection to the email server failed.',
      category: 'TLS',
    }
  }

  // 7. Recipient rejection (550 / 553 / rejected recipient)
  if (responseCode === 550 || responseCode === 553 || err.isRecipientRejected) {
    return {
      code: 'EMAIL_REJECTED',
      message: 'The email server rejected the recipient address.',
      category: 'RECIPIENT',
    }
  }

  return {
    code: 'SEND_FAILED',
    message: 'Could not send invitation. Please try again later.',
    category: 'SMTP',
  }
}

/**
 * Logs safe startup diagnostics without exposing passwords or credentials.
 */
function logStartupDiagnostics() {
  const config = getSmtpConfig()
  console.log('[Mail] Provider: Nodemailer SMTP')
  if (!config.isValid) {
    console.warn(`[Mail] SMTP configuration incomplete. Missing: ${config.missing.join(', ')}`)
    return
  }
  console.log(`[Mail] Host: ${config.host}`)
  console.log(`[Mail] Port: ${config.port}`)
  console.log(`[Mail] Secure: ${config.secure}`)
  console.log('[Mail] User: configured')
  console.log('[Mail] Password: configured')
  console.log(`[Mail] From: "${config.fromName}" <${config.fromAddress}>`)
}

/**
 * Non-blocking startup diagnostic check.
 * Verifies SMTP connection without blocking server launch.
 *
 * @returns {Promise<boolean>}
 */
async function verifySmtp() {
  logStartupDiagnostics()
  const config = getSmtpConfig()
  if (!config.isValid) {
    return false
  }

  if (process.env.RENDER) {
    console.log('[Mail] NOTICE: Running on Render. Render Free tier blocks outbound SMTP ports (25, 465, 587). Production email requires a hosting plan or environment with outbound SMTP egress.')
  }

  const transporter = getTransporter()
  if (!transporter) {
    return false
  }

  try {
    await transporter.verify()
    console.log('[Mail] SMTP connection verified successfully.')
    return true
  } catch (err) {
    const classified = classifySmtpError(err)
    console.warn(`[Mail] SMTP verification failed [${classified.category}]: ${err.message}`)
    return false
  }
}

/**
 * Sends a room invitation email to a single recipient using Nodemailer SMTP.
 *
 * @param {{ to: string, roomName: string, roomId: string, inviterName: string }} options
 * @returns {Promise<{ success: boolean, code: string, message: string, messageId?: string }>}
 */
async function sendRoomInvite({ to, roomName, roomId, inviterName }) {
  const config = getSmtpConfig()
  if (!config.isValid) {
    const err = new Error('Email service is not configured yet.')
    err.code = 'SMTP_CONFIG_ERROR'
    err.isConfigError = true
    throw err
  }

  const transporter = getTransporter()
  if (!transporter) {
    const err = new Error('Email service is not configured yet.')
    err.code = 'SMTP_CONFIG_ERROR'
    err.isConfigError = true
    throw err
  }

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
    from: `"${config.fromName}" <${config.fromAddress}>`,
    to,
    subject: "You're invited to a SyncTube watch party",
    text: textContent,
    html: htmlContent,
    disableFileAccess: true,
    disableUrlAccess: true,
  }

  console.log(`[Mail] Dispatching invitation to "${to}" for room "${roomId}" via ${config.host}:${config.port}`)

  try {
    const info = await transporter.sendMail(mailOptions)

    // Inspect accepted / rejected
    const accepted = Array.isArray(info.accepted) ? info.accepted : []
    const rejected = Array.isArray(info.rejected) ? info.rejected : []

    if (rejected.length > 0 && accepted.length === 0) {
      const rejectErr = new Error(`Recipient ${to} was rejected by the email server.`)
      rejectErr.code = 'EMAIL_REJECTED'
      rejectErr.isRecipientRejected = true
      throw rejectErr
    }

    console.log(`[Mail] SUCCESS: Invitation sent to "${to}" (messageId: ${info.messageId})`)
    return {
      success: true,
      code: 'EMAIL_SENT',
      message: 'Invitation sent successfully.',
      messageId: info.messageId,
    }
  } catch (err) {
    const classified = classifySmtpError(err)
    console.warn(`[Mail] SEND failed [${classified.category}]: code=${err.code || 'NONE'}, command=${err.command || 'NONE'}, responseCode=${err.responseCode || 'NONE'}`)

    const dispatchError = new Error(classified.message)
    dispatchError.code = classified.code
    dispatchError.userMessage = classified.message
    dispatchError.category = classified.category
    dispatchError.originalMessage = err.message
    throw dispatchError
  }
}

module.exports = {
  sendRoomInvite,
  verifySmtp,
  getTransporter,
  getSmtpConfig,
  isSmtpConfigured,
  isConfigured: isSmtpConfigured, // Backward-compatible alias
  checkSmtpConfig: isSmtpConfigured, // Backward-compatible alias
  classifySmtpError,
  logStartupDiagnostics,
}

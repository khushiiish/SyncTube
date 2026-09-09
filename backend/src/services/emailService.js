const nodemailer = require('nodemailer')
const { escapeHtml } = require('../utils/escapeHtml')

// Single cached transporter instance and configuration signature
let cachedTransporter = null
let cachedSignature = ''

/**
 * Extracts, parses, and validates SMTP configuration from environment variables.
 *
 * Strict parsing rules:
 * - Brevo detection: host equals 'smtp-relay.brevo.com'.
 * - EMAIL_FROM: strictly required for Brevo; no automatic fallback to SMTP_USER.
 * - Brevo port: port 2525 with secure=false required to avoid Render Free firewall blocks (25, 465, 587).
 * - SMTP_SECURE: strictly checks for 'true' (Boolean("false") === true is prevented).
 * - SMTP_PORT: parsed to integer with 1-65535 boundary validation.
 * - SMTP_HOST / SMTP_USER / SMTP_PASS: trimmed strings.
 *
 * @returns {{
 *   host: string,
 *   port: number,
 *   secure: boolean,
 *   user: string,
 *   pass: string,
 *   fromAddress: string,
 *   fromName: string,
 *   isBrevo: boolean,
 *   debug: boolean,
 *   isValid: boolean,
 *   missing: string[],
 *   invalidBrevoPair: boolean,
 *   invalidGmailPair: boolean
 * }}
 */
function getSmtpConfig() {
  const host = process.env.SMTP_HOST ? process.env.SMTP_HOST.trim() : ''
  const isBrevo = host.toLowerCase() === 'smtp-relay.brevo.com'
  const rawPort = process.env.SMTP_PORT ? String(process.env.SMTP_PORT).trim() : (isBrevo ? '2525' : '587')
  const port = parseInt(rawPort, 10)
  const secure = String(process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true'
  const user = process.env.SMTP_USER ? process.env.SMTP_USER.trim() : ''
  // Trim surrounding whitespace only; preserve legitimate password characters
  const pass = process.env.SMTP_PASS ? process.env.SMTP_PASS.trim() : ''
  const rawFrom = process.env.EMAIL_FROM ? process.env.EMAIL_FROM.trim() : ''
  // For Brevo, EMAIL_FROM must be an explicit verified sender; do NOT fall back to SMTP_USER
  const fromAddress = isBrevo ? rawFrom : (rawFrom || user)
  const fromName = (process.env.EMAIL_FROM_NAME && process.env.EMAIL_FROM_NAME.trim()) || 'SyncTube'
  const debug = String(process.env.SMTP_DEBUG || '').trim().toLowerCase() === 'true'

  const missing = []
  if (!host) missing.push('SMTP_HOST')
  if (!user) missing.push('SMTP_USER')
  if (!pass) missing.push('SMTP_PASS')
  if (!rawPort || isNaN(port) || port <= 0 || port > 65535) missing.push('SMTP_PORT')

  // Brevo configuration validation
  let invalidBrevoPair = false
  if (isBrevo) {
    if (!fromAddress) {
      missing.push('EMAIL_FROM')
    }
    if (port !== 2525) {
      invalidBrevoPair = true
      missing.push(`Invalid Brevo configuration: Port ${port} is not supported on Render Free (Render Free blocks 25, 465, 587; Brevo requires SMTP_PORT=2525)`)
    }
    if (port === 2525 && secure) {
      invalidBrevoPair = true
      missing.push('Invalid Brevo configuration: Port 2525 requires SMTP_SECURE=false (STARTTLS)')
    }
  }

  // Gmail port and secure mode compatibility validation
  let invalidGmailPair = false
  if (host.toLowerCase().includes('gmail')) {
    if (port === 465 && !secure) {
      invalidGmailPair = true
      missing.push('Invalid Gmail configuration: Port 465 requires SMTP_SECURE=true')
    } else if (port === 587 && secure) {
      invalidGmailPair = true
      missing.push('Invalid Gmail configuration: Port 587 requires SMTP_SECURE=false')
    }
  }

  const isValid = missing.length === 0 && !invalidBrevoPair && !invalidGmailPair

  return {
    host,
    port: isNaN(port) ? (isBrevo ? 2525 : 587) : port,
    secure,
    user,
    pass,
    fromAddress,
    fromName,
    isBrevo,
    debug,
    isValid,
    missing,
    invalidBrevoPair,
    invalidGmailPair,
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
    console.warn('[Mail] Warning: Port 465 requires SMTP_SECURE=true (SSL/TLS).')
  } else if (config.port === 587 && config.secure) {
    console.warn('[Mail] Warning: Port 587 requires SMTP_SECURE=false (STARTTLS).')
  }

  const transportOptions = {
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
  }

  // For 587 STARTTLS (non-Brevo), enforce secure TLS upgrade without disabling certificate validation
  if (config.port === 587 && !config.secure && !config.isBrevo) {
    transportOptions.requireTLS = true
  }

  cachedTransporter = nodemailer.createTransport(transportOptions)
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
  const command = err.command || ''

  // 1. Missing or invalid configuration
  if (err.isConfigError || code === 'SMTP_CONFIG_ERROR') {
    const isSenderMissing = /sender|EMAIL_FROM/i.test(message)
    return {
      code: 'SMTP_CONFIG_ERROR',
      message: isSenderMissing ? 'Email sender is not configured.' : 'Email invitations are not configured.',
      category: 'CONFIGURATION',
    }
  }

  // 2. Authentication failure (EAUTH / 535)
  if (code === 'EAUTH' || responseCode === 535 || /invalid login|badcredentials|username and password not accepted/i.test(message)) {
    return {
      code: 'SMTP_AUTH_ERROR',
      message: 'Email invitations are temporarily unavailable.',
      category: 'AUTHENTICATION',
    }
  }

  // 3. DNS lookup failure (ENOTFOUND / EAI_AGAIN)
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return {
      code: 'SMTP_DNS_ERROR',
      message: 'Email invitations are temporarily unavailable.',
      category: 'DNS',
    }
  }

  // 4. Connection timeout (ETIMEDOUT / ESOCKETTIMEDOUT)
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || /timeout|timed out/i.test(message)) {
    return {
      code: 'SMTP_TIMEOUT',
      message: 'Email invitations are temporarily unavailable.',
      category: 'TIMEOUT',
    }
  }

  // 5. Connection refused / network failure (ECONNREFUSED / ENETUNREACH / EHOSTUNREACH / ECONNRESET)
  if (code === 'ECONNREFUSED' || code === 'ENETUNREACH' || code === 'EHOSTUNREACH' || code === 'ECONNRESET') {
    return {
      code: 'SMTP_NETWORK_ERROR',
      message: 'Email invitations are temporarily unavailable.',
      category: 'NETWORK',
    }
  }

  // 6. TLS / SSL handshake failure
  if (
    code === 'ESOCKET' ||
    code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
    /tls|ssl|handshake|certificate|wrong_version_number|cert_has_expired|unable_to_verify_leaf_signature|err_tls/i.test(message)
  ) {
    return {
      code: 'SMTP_TLS_ERROR',
      message: 'Email service could not establish a secure connection.',
      category: 'TLS',
    }
  }

  // 7. Sender address rejected (MAIL FROM)
  if (command === 'MAIL FROM' || /sender address rejected|from address rejected|unauthorized sender|sender not allowed/i.test(message)) {
    return {
      code: 'EMAIL_SENDER_REJECTED',
      message: 'Email invitations are temporarily unavailable.',
      category: 'SENDER',
    }
  }

  // 8. Recipient address rejected (550 / 551 / 553 / RCPT TO)
  if (responseCode === 550 || responseCode === 551 || responseCode === 553 || err.isRecipientRejected || /recipient rejected|mailbox unavailable/i.test(message)) {
    return {
      code: 'EMAIL_REJECTED',
      message: 'This email address was rejected by the mail server.',
      category: 'RECIPIENT',
    }
  }

  // 9. Temporary SMTP provider failure (421 / 450 / 451 / 452)
  if ((responseCode && responseCode >= 420 && responseCode <= 459) || /try again later|service not available, closing transmission channel/i.test(message)) {
    return {
      code: 'SMTP_TEMPORARY_FAILURE',
      message: 'Email service is busy. Please try again shortly.',
      category: 'TEMPORARY',
    }
  }

  // 10. Provider sending rate or quota limit
  if (/rate limit|quota|too many messages|daily sending limit|sending quota/i.test(message)) {
    return {
      code: 'SMTP_PROVIDER_LIMIT',
      message: 'Email sending limit has been reached. Please try again later.',
      category: 'LIMIT',
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
  const provider = config.isBrevo ? 'Brevo SMTP via Nodemailer' : 'Nodemailer SMTP'
  console.log(`[Mail] Provider: ${provider}`)
  if (!config.isValid) {
    console.warn(`[Mail] SMTP configuration incomplete. Missing: ${config.missing.join(', ')}`)
    return
  }
  console.log(`[Mail] Host: ${config.host}`)
  console.log(`[Mail] Port: ${config.port}`)
  console.log(`[Mail] Secure: ${config.secure}`)
  console.log(`[Mail] SMTP User: ${config.user ? 'configured' : '[missing]'}`)
  console.log(`[Mail] SMTP Key: ${config.pass ? 'configured' : '[missing]'}`)
  console.log(`[Mail] Sender: ${config.fromAddress ? 'configured' : '[missing]'}`)
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
    if (config.isBrevo && config.port === 2525) {
      console.log('[Mail] Running on Render.')
      console.log("[Mail] Using Brevo SMTP port 2525, which avoids Render Free's blocked SMTP ports 25, 465 and 587.")
    } else {
      console.log('[Mail] NOTICE: Running on Render. Render Free tier blocks outbound SMTP ports (25, 465, 587). Production email requires Brevo SMTP on port 2525.')
    }
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
    const err = new Error(config.missing.includes('EMAIL_FROM') ? 'Email sender is not configured.' : 'Email service is not configured yet.')
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

  // Construct direct room link on server using trimmed CLIENT_URL
  const clientUrl = String(process.env.CLIENT_URL || 'http://localhost:5173').trim().replace(/\/$/, '')
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
    if (classified.code === 'EMAIL_SENDER_REJECTED' && config.isBrevo) {
      console.warn(`[Mail] Verify EMAIL_FROM in Brevo dashboard: "${config.fromAddress}" must be a verified sender.`)
    }

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

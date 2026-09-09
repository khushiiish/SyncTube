/**
 * Environment variable validator and startup diagnostic reporter.
 * Ensures required and optional production configurations are checked
 * and logged without exposing raw secrets.
 */

function maskSecret(val) {
  if (!val) return '[missing]'
  if (val.length <= 8) return '[configured]'
  return `[configured: ${val.slice(0, 4)}...${val.slice(-4)}]`
}

function validateEnv() {
  // Sync Vite publishable key fallback
  if (!process.env.CLERK_PUBLISHABLE_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY) {
    process.env.CLERK_PUBLISHABLE_KEY = process.env.VITE_CLERK_PUBLISHABLE_KEY
  }

  const host = (process.env.SMTP_HOST || '').trim().toLowerCase()
  const isBrevo = host === 'smtp-relay.brevo.com'
  const rawPort = process.env.SMTP_PORT ? String(process.env.SMTP_PORT).trim() : (isBrevo ? '2525' : '587')
  const port = parseInt(rawPort, 10)
  const isSmtpSet = Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    (!isBrevo || process.env.EMAIL_FROM)
  )

  const diagnostics = {
    nodeEnv:              process.env.NODE_ENV || 'development',
    port:                 process.env.PORT || 5000,
    clientUrl:            process.env.CLIENT_URL || '[default: http://localhost:5173]',
    mongoUri:             process.env.MONGODB_URI ? '[configured]' : '[missing]',
    clerkPub:             maskSecret(process.env.CLERK_PUBLISHABLE_KEY),
    clerkSecret:          maskSecret(process.env.CLERK_SECRET_KEY),
    smtpConfigured:       isSmtpSet,
    cloudinaryConfigured: Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
  }

  const providerTag = isBrevo ? 'Brevo SMTP via Nodemailer' : 'Nodemailer SMTP'

  console.log('====================================================')
  console.log('  SyncTube Backend - Configuration Diagnostic')
  console.log('====================================================')
  console.log(`  Environment:          ${diagnostics.nodeEnv}`)
  console.log(`  Port:                 ${diagnostics.port}`)
  console.log(`  Client URL:           ${diagnostics.clientUrl}`)
  console.log(`  MongoDB URI:          ${diagnostics.mongoUri}`)
  console.log(`  Clerk Publishable:    ${diagnostics.clerkPub}`)
  console.log(`  Clerk Secret:         ${diagnostics.clerkSecret}`)
  console.log(`  SMTP Service:         ${diagnostics.smtpConfigured ? `ENABLED [${providerTag}] (${process.env.SMTP_HOST}:${port})` : 'DISABLED (invites unavailable)'}`)
  console.log(`  Cloudinary Storage:   ${diagnostics.cloudinaryConfigured ? 'ENABLED' : 'DISABLED (voice messages unavailable)'}`)
  console.log('====================================================')

  const warnings = []
  if (!process.env.MONGODB_URI) {
    warnings.push('MONGODB_URI is not set. Database operations will fail unless memory server or default URI is used.')
  } else if (process.env.NODE_ENV === 'production' && (process.env.MONGODB_URI.includes('localhost') || process.env.MONGODB_URI.includes('127.0.0.1'))) {
    warnings.push('MONGODB_URI is set to localhost in production. Render cloud containers cannot reach localhost. Please set MONGODB_URI to your MongoDB Atlas connection string (mongodb+srv://...).')
  }
  if (!process.env.CLERK_SECRET_KEY || !process.env.CLERK_PUBLISHABLE_KEY) {
    warnings.push('CLERK authentication keys are missing. Authenticated endpoints and token verification will fail.')
  }
  if (isBrevo && !process.env.EMAIL_FROM) {
    warnings.push('EMAIL_FROM is required for Brevo SMTP. Brevo rejects emails unless sent from a verified sender address.')
  }
  if (isBrevo && port !== 2525) {
    warnings.push(`Brevo SMTP is configured on port ${port}. Render Free blocks ports 25, 465, and 587. Please set SMTP_PORT=2525.`)
  }
  if (process.env.RENDER && isSmtpSet) {
    if (isBrevo && port === 2525) {
      // Brevo on port 2525 avoids Render Free's blocked ports; no warning needed
    } else {
      warnings.push('Render Free tier blocks outbound SMTP ports (25, 465, 587). Please configure Brevo SMTP with SMTP_HOST=smtp-relay.brevo.com and SMTP_PORT=2525.')
    }
  }

  if (warnings.length > 0) {
    console.warn('[Server] Configuration Warnings:')
    warnings.forEach(w => console.warn(`  - ${w}`))
  }

  return {
    isValid: warnings.length === 0,
    diagnostics,
    warnings,
  }
}

module.exports = { validateEnv }

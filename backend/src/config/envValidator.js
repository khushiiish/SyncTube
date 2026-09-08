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

  const diagnostics = {
    nodeEnv:        process.env.NODE_ENV || 'development',
    port:           process.env.PORT || 5000,
    clientUrl:      process.env.CLIENT_URL || '[default: http://localhost:5173]',
    mongoUri:       process.env.MONGODB_URI ? '[configured]' : '[missing]',
    clerkPub:       maskSecret(process.env.CLERK_PUBLISHABLE_KEY),
    clerkSecret:    maskSecret(process.env.CLERK_SECRET_KEY),
    smtpConfigured: Boolean(process.env.SMTP_HOST && (process.env.SMTP_USER || !process.env.SMTP_PASS)),
    cloudinaryConfigured: Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
  }

  console.log('====================================================')
  console.log('  SyncTube Backend - Configuration Diagnostic')
  console.log('====================================================')
  console.log(`  Environment:          ${diagnostics.nodeEnv}`)
  console.log(`  Port:                 ${diagnostics.port}`)
  console.log(`  Client URL:           ${diagnostics.clientUrl}`)
  console.log(`  MongoDB URI:          ${diagnostics.mongoUri}`)
  console.log(`  Clerk Publishable:    ${diagnostics.clerkPub}`)
  console.log(`  Clerk Secret:         ${diagnostics.clerkSecret}`)
  console.log(`  SMTP Service:         ${diagnostics.smtpConfigured ? 'ENABLED' : 'DISABLED (invites will be mocked/unavailable)'}`)
  console.log(`  Cloudinary Storage:   ${diagnostics.cloudinaryConfigured ? 'ENABLED' : 'DISABLED (voice messages unavailable)'}`)
  console.log('====================================================')

  const warnings = []
  if (!process.env.MONGODB_URI) {
    warnings.push('MONGODB_URI is not set. Database operations will fail unless memory server or default URI is used.')
  }
  if (!process.env.CLERK_SECRET_KEY || !process.env.CLERK_PUBLISHABLE_KEY) {
    warnings.push('CLERK authentication keys are missing. Authenticated endpoints and token verification will fail.')
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

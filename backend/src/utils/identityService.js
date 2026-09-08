const crypto = require('crypto')
const { verifyToken } = require('@clerk/express')

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Derives a secure, server-authoritative identity hash for a participant.
 *
 * For Authenticated Users:
 *   - Verifies the provided Clerk session token with process.env.CLERK_SECRET_KEY.
 *   - Extracts verified userId (payload.sub).
 *   - Computes SHA-256("clerk:<userId>").
 *
 * For Guest Users:
 *   - Validates the provided guestDeviceId as an opaque RFC 4122 UUID.
 *   - Computes SHA-256("guest:<guestDeviceId>").
 *
 * The raw identityKey and identityHash are NEVER leaked to clients.
 *
 * @param {Object} params
 * @param {string|null} [params.guestDeviceId]
 * @param {string|null} [params.clerkToken]
 * @returns {Promise<{ identityHash: string, clerkUserId: string|null, isGuest: boolean }>}
 */
async function deriveIdentity({ guestDeviceId, clerkToken }) {
  // 1. Authenticated Clerk user branch
  if (clerkToken && typeof clerkToken === 'string') {
    const secretKey = process.env.CLERK_SECRET_KEY
    if (!secretKey) {
      const error = new Error('Server authentication configuration is missing (CLERK_SECRET_KEY).')
      error.code = 'CONFIG_ERROR'
      throw error
    }

    try {
      const payload = await verifyToken(clerkToken, { secretKey })
      if (!payload || !payload.sub) {
        throw new Error('Invalid Clerk token payload.')
      }

      const clerkUserId = payload.sub
      const identityKey = `clerk:${clerkUserId}`
      const identityHash = crypto.createHash('sha256').update(identityKey).digest('hex')

      return {
        identityHash,
        clerkUserId,
        isGuest: false,
      }
    } catch (err) {
      const error = new Error(`Authentication token verification failed: ${err.message}`)
      error.code = 'INVALID_AUTH'
      throw error
    }
  }

  // 2. Guest user branch
  if (!guestDeviceId || typeof guestDeviceId !== 'string' || !UUID_REGEX.test(guestDeviceId.trim())) {
    const error = new Error('A valid guest device identifier is required for unauthenticated access.')
    error.code = 'INVALID_IDENTITY'
    throw error
  }

  const normalizedDeviceId = guestDeviceId.trim().toLowerCase()
  const identityKey = `guest:${normalizedDeviceId}`
  const identityHash = crypto.createHash('sha256').update(identityKey).digest('hex')

  return {
    identityHash,
    clerkUserId: null,
    isGuest: true,
  }
}

module.exports = {
  deriveIdentity,
  UUID_REGEX,
}

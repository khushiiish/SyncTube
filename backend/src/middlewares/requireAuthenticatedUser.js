const { getAuth } = require('@clerk/express')

/**
 * Middleware: requireAuthenticatedUser
 * Enforces valid Clerk authentication session on protected routes.
 *
 * Uses getAuth(req) from @clerk/express to verify credentials.
 * Rejects unauthenticated requests with HTTP 401 JSON.
 */
function requireAuthenticatedUser(req, res, next) {
  try {
    let auth = null
    if (req.auth && (req.auth.userId || req.auth.sub)) {
      auth = req.auth
    } else {
      auth = getAuth(req)
    }

    if (!auth || (!auth.userId && !auth.sub)) {
      return res.status(401).json({
        message: 'Authentication required. Please sign in with your Google account.',
        code: 'AUTHENTICATION_REQUIRED',
      })
    }

    req.auth = auth
    next()
  } catch (err) {
    return res.status(401).json({
      message: 'Authentication required. Please sign in with your Google account.',
      code: 'AUTHENTICATION_REQUIRED',
    })
  }
}

module.exports = requireAuthenticatedUser

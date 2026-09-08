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
    const auth = getAuth(req)
    if (!auth || !auth.userId) {
      return res.status(401).json({
        message: 'Authentication required to create a room.',
      })
    }

    req.auth = auth
    next()
  } catch (err) {
    return res.status(401).json({
      message: 'Authentication required to create a room.',
    })
  }
}

module.exports = requireAuthenticatedUser

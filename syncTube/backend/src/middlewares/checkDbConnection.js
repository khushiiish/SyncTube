const mongoose = require('mongoose')

/**
 * checkDbConnection — Middleware to ensure MongoDB is connected.
 * Returns a 503 Service Unavailable error if MongoDB is offline.
 */
function checkDbConnection(req, res, next) {
  // readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: 'Database not connected. Please verify that your MongoDB instance is running and check MONGODB_URI in your backend/.env configuration.'
    })
  }
  next()
}

module.exports = checkDbConnection

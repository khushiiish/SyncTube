const dns = require('dns')
const mongoose = require('mongoose')

// Resolve querySrv issues with MongoDB Atlas by setting public DNS servers
try {
  dns.setServers(['8.8.8.8', '1.1.1.1'])
} catch (e) {
  console.warn('[DB] Failed to set custom DNS servers:', e.message)
}

/**
 * Mongoose connection with retry logic.
 * Emits clear errors on connection failure.
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI

  if (!uri) {
    console.error('[DB] MONGODB_URI is not set in environment variables.')
    return
  }

  mongoose.connection.on('disconnected', () => {
    console.warn('[DB] MongoDB disconnected.')
  })

  mongoose.connection.on('reconnected', () => {
    console.info('[DB] MongoDB reconnected.')
  })

  mongoose.connection.on('error', (err) => {
    console.error('[DB] Mongoose connection error:', err.message)
  })

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    })
    console.log(`[DB] MongoDB connected: ${mongoose.connection.host}`)
  } catch (err) {
    console.error('[DB] Connection failed initially:', err.message)
    console.log('[DB] Server will continue running. Please start MongoDB or update MONGODB_URI in backend/.env')
  }
}

module.exports = connectDB

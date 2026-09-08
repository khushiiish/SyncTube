const dns = require('dns')
const mongoose = require('mongoose')

// Resolve querySrv issues with MongoDB Atlas by setting public DNS servers
try {
  dns.setServers(['8.8.8.8', '1.1.1.1'])
} catch (e) {
  console.warn('[DB] Failed to set custom DNS servers:', e.message)
}

let memoryServerInstance = null
let isConnecting = false

/**
 * Mongoose connection manager.
 * Supports:
 * 1. Direct connection to MongoDB Atlas / remote cluster
 * 2. Connection to local MongoDB daemon (port 27017)
 * 3. Automatic in-memory MongoDB fallback for local development if local daemon is offline
 */
async function connectDB() {
  if (mongoose.connection.readyState === 1 || isConnecting) {
    return
  }

  isConnecting = true
  const rawUri = process.env.MONGODB_URI
  const isLocalUri = !rawUri || rawUri.includes('localhost') || rawUri.includes('127.0.0.1')
  const isDev = process.env.NODE_ENV !== 'production'

  mongoose.connection.on('disconnected', () => {
    console.warn('[DB] MongoDB disconnected.')
  })

  mongoose.connection.on('reconnected', () => {
    console.info('[DB] MongoDB reconnected.')
  })

  mongoose.connection.on('error', (err) => {
    console.error('[DB] Mongoose connection error:', err.message)
  })

  // 1. If remote URI (e.g. MongoDB Atlas), connect directly
  if (rawUri && !isLocalUri) {
    try {
      await mongoose.connect(rawUri, {
        serverSelectionTimeoutMS: 5000,
      })
      console.log(`[DB] MongoDB Atlas connected: ${mongoose.connection.host}`)
      isConnecting = false
      return
    } catch (err) {
      isConnecting = false
      console.error('[DB] Remote MongoDB Atlas connection failed:', err.message)
      console.log('[DB] Will retry connection in 5 seconds...')
      setTimeout(connectDB, 5000)
      return
    }
  }

  // 2. If local URI, attempt local connection first
  if (rawUri && isLocalUri) {
    try {
      await mongoose.connect(rawUri, {
        serverSelectionTimeoutMS: 2000,
      })
      console.log(`[DB] Local MongoDB connected: ${mongoose.connection.host}`)
      isConnecting = false
      return
    } catch (localErr) {
      console.warn(`[DB] Local MongoDB daemon at ${rawUri} is offline (${localErr.message}).`)
    }
  }

  // 3. If local daemon is offline and in development mode, start in-memory MongoDB
  if (isDev) {
    try {
      console.log('[DB] Starting embedded in-memory MongoDB server for local development...')
      const { MongoMemoryServer } = require('mongodb-memory-server')
      memoryServerInstance = await MongoMemoryServer.create()
      const memUri = memoryServerInstance.getUri()

      await mongoose.connect(memUri)
      console.log(`[DB] In-memory MongoDB connected successfully: ${mongoose.connection.host}`)
      console.log('[DB] (All watch party rooms, queues, and chat are now active locally)')
      console.log('[DB] (To connect to persistent cloud storage, set MONGODB_URI=mongodb+srv://... in backend/.env)')
      isConnecting = false
      return
    } catch (memErr) {
      console.error('[DB] Failed to start in-memory MongoDB fallback:', memErr.message)
    }
  }

  isConnecting = false
  console.error('[DB] No database connection available. Please start MongoDB or configure MONGODB_URI.')
}

// Graceful cleanup on process termination
process.on('SIGINT', async () => {
  if (memoryServerInstance) {
    await memoryServerInstance.stop().catch(() => {})
  }
  process.exit(0)
})

process.on('SIGTERM', async () => {
  if (memoryServerInstance) {
    await memoryServerInstance.stop().catch(() => {})
  }
  process.exit(0)
})

module.exports = connectDB

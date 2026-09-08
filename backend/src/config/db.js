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
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 10000,
      })
      console.log(`[DB] MongoDB Atlas connected: ${mongoose.connection.host}`)
      isConnecting = false
      return
    } catch (err) {
      isConnecting = false
      console.error('[DB] Remote MongoDB Atlas connection failed:', err.message)
      console.log('[DB] Make sure your IP (0.0.0.0/0) is whitelisted in MongoDB Atlas Network Access.')
      console.log('[DB] Will retry connection in 10 seconds...')
      setTimeout(connectDB, 10000)
      return
    }
  }

  // 2. If local URI, attempt local connection
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

  // 3. Fallback: try embedded in-memory MongoDB if in development or explicitly allowed
  const allowMemoryFallback = isDev || process.env.ALLOW_MEMORY_DB === 'true'
  if (allowMemoryFallback) {
    try {
      console.log('[DB] Attempting embedded in-memory MongoDB fallback...')
      const { MongoMemoryServer } = require('mongodb-memory-server')
      memoryServerInstance = await MongoMemoryServer.create()
      const memUri = memoryServerInstance.getUri()

      await mongoose.connect(memUri)
      console.log(`[DB] In-memory MongoDB connected successfully: ${mongoose.connection.host}`)
      console.log('[DB] (Rooms, queues, and chat are now active)')
      isConnecting = false
      return
    } catch (memErr) {
      console.warn('[DB] In-memory MongoDB fallback unavailable:', memErr.message)
    }
  }

  // 4. If in production with localhost or missing URI, log critical configuration instructions
  if (!isDev) {
    console.error('================================================================================')
    console.error('  [DB CRITICAL ERROR] MongoDB is not connected in PRODUCTION!')
    console.error(`  Current MONGODB_URI: ${rawUri || '[not set]'}`)
    if (isLocalUri) {
      console.error('  Reason: Render/cloud containers do NOT have a local MongoDB service on localhost.')
      console.error('  Action Required:')
      console.error('  1. Create a free cluster on MongoDB Atlas (https://cloud.mongodb.com).')
      console.error('  2. Whitelist 0.0.0.0/0 in MongoDB Atlas -> "Network Access".')
      console.error('  3. In your Render Dashboard -> Environment Variables:')
      console.error('     Set MONGODB_URI = mongodb+srv://<username>:<password>@cluster0.xxx.mongodb.net/synctube?retryWrites=true&w=majority')
    }
    console.error('================================================================================')
  }

  isConnecting = false
  console.log('[DB] Will re-attempt database connection in 10 seconds...')
  setTimeout(connectDB, 10000)
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

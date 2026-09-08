require('dotenv').config()
const http = require('http')
const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')
const { clerkMiddleware } = require('@clerk/express')
const connectDB = require('./src/config/db')
const roomRoutes = require('./src/routes/roomRoutes')
const errorHandler = require('./src/middlewares/errorHandler')
const { initSocket } = require('./src/socket')
const emailService = require('./src/services/emailService')
const voiceCleanupService = require('./src/services/voiceCleanupService')
const { isCloudinaryConfigured } = require('./src/config/cloudinary')
const { validateEnv } = require('./src/config/envValidator')

// Run environment configuration diagnostics on startup
validateEnv()

const app = express()
const httpServer = http.createServer(app)

// Security headers
app.disable('x-powered-by')
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  next()
})

/* =========================================================
   Middleware
   ========================================================= */
const clientUrl = process.env.CLIENT_URL ? process.env.CLIENT_URL.replace(/\/$/, '') : null
const allowedOrigins = [
  clientUrl,
  'http://localhost:5173',
  'http://localhost:4173'
].filter(Boolean)

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}))
app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ extended: true }))
app.use(clerkMiddleware())

/* =========================================================
   Health check (with database connection status and uptime)
   ========================================================= */
app.get('/health', (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1
  const status = isDbConnected ? 'ok' : 'degraded'
  const httpStatus = isDbConnected ? 200 : 503

  res.status(httpStatus).json({
    status,
    database: isDbConnected ? 'connected' : 'disconnected',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  })
})

/* =========================================================
   Routes
   ========================================================= */
app.use('/api/rooms', roomRoutes)

/* =========================================================
   404 handler
   ========================================================= */
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.path} not found.` })
})

/* =========================================================
   Global error handler
   ========================================================= */
app.use(errorHandler)

/* =========================================================
   Start
   ========================================================= */
function start() {
  // Connect to database in the background
  connectDB()

  // Verify SMTP in the background (non-blocking diagnostic)
  emailService.verifySmtp().catch(() => {})

  // Initialize periodic Cloudinary voice asset cleanup
  voiceCleanupService.startPeriodicCleanup()
  if (isCloudinaryConfigured()) {
    console.log('[Server] Cloudinary audio storage is configured and ready.')
  } else {
    console.log('[Server] Cloudinary audio storage is unconfigured. Voice messaging disabled.')
  }

  // Initialize Socket.IO server immediately
  const io = initSocket(httpServer)
  app.set('io', io)

  const PORT = process.env.PORT || 5000
  httpServer.listen(PORT, () => {
    console.log(`[Server] SyncTube backend running on http://localhost:${PORT}`)
    console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`)
  })
}

start()

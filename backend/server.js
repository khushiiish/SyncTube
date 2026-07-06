require('dotenv').config()
const http = require('http')
const express = require('express')
const cors = require('cors')
const connectDB = require('./src/config/db')
const roomRoutes = require('./src/routes/roomRoutes')
const errorHandler = require('./src/middlewares/errorHandler')
const { initSocket } = require('./src/socket')

const app = express()
const httpServer = http.createServer(app)

/* =========================================================
   Middleware
   ========================================================= */
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:4173'
].filter(Boolean)

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}))
app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ extended: true }))

/* =========================================================
   Health check
   ========================================================= */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

/* =========================================================
   Routes
   ========================================================= */
const checkDbConnection = require('./src/middlewares/checkDbConnection')

app.use('/api/rooms', checkDbConnection, roomRoutes)

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

  // Initialize Socket.IO server immediately
  initSocket(httpServer)

  const PORT = process.env.PORT || 5000
  httpServer.listen(PORT, () => {
    console.log(`[Server] SyncTube backend running on http://localhost:${PORT}`)
    console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`)
  })
}

start()

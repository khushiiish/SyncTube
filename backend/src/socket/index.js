const { Server } = require('socket.io')
const { registerRoomHandlers } = require('./roomHandlers')

/**
 * initSocket — creates and configures the Socket.IO server.
 *
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server} io
 */
function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout:  60000,
    pingInterval: 25000,
  })

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`)

    // Register all room-scoped event handlers
    registerRoomHandlers(socket, io)

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Client disconnected: ${socket.id} (${reason})`)
    })
  })

  return io
}

module.exports = { initSocket }

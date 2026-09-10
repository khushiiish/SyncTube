const express = require('express')
const router = express.Router()
const { createRoom, joinRoom, getRoom, getRooms, deleteRoom, switchRoomSession } = require('../controllers/roomController')
const requireAuthenticatedUser = require('../middlewares/requireAuthenticatedUser')
const checkDbConnection = require('../middlewares/checkDbConnection')

/**
 * Room routes
 * POST   /api/rooms/create          — create a new room (Requires Clerk Auth)
 * POST   /api/rooms/join            — validate + join existing room (Requires Clerk Auth)
 * POST   /api/rooms/:id/switch-session — switch active room session (Requires Clerk Auth)
 * GET    /api/rooms                 — get all active rooms (Public)
 * GET    /api/rooms/:id             — get room details (Public)
 * DELETE /api/rooms/:id             — delete room (host only)
 */
router.post('/create', requireAuthenticatedUser, checkDbConnection, createRoom)
router.post('/join',   requireAuthenticatedUser, checkDbConnection, joinRoom)
router.post('/:id/switch-session', requireAuthenticatedUser, checkDbConnection, switchRoomSession)
router.get('/',        checkDbConnection, getRooms)
router.get('/:id',     checkDbConnection, getRoom)
router.delete('/:id',  requireAuthenticatedUser, checkDbConnection, deleteRoom)

module.exports = router

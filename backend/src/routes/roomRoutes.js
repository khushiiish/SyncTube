const express = require('express')
const router = express.Router()
const { createRoom, joinRoom, getRoom, getRooms, deleteRoom } = require('../controllers/roomController')
const requireAuthenticatedUser = require('../middlewares/requireAuthenticatedUser')
const checkDbConnection = require('../middlewares/checkDbConnection')

/**
 * Room routes
 * POST   /api/rooms/create  — create a new room (Requires Clerk Auth)
 * POST   /api/rooms/join    — validate + join existing room (Public / Guest)
 * GET    /api/rooms         — get all active rooms (Public)
 * GET    /api/rooms/:id     — get room details (Public)
 * DELETE /api/rooms/:id     — delete room (host only)
 */
router.post('/create', requireAuthenticatedUser, checkDbConnection, createRoom)
router.post('/join',   checkDbConnection, joinRoom)
router.get('/',        checkDbConnection, getRooms)
router.get('/:id',     checkDbConnection, getRoom)
router.delete('/:id',  requireAuthenticatedUser, checkDbConnection, deleteRoom)

module.exports = router

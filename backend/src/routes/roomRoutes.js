const express = require('express')
const router = express.Router()
const { createRoom, joinRoom, getRoom, getRooms, deleteRoom } = require('../controllers/roomController')

/**
 * Room routes
 * POST   /api/rooms/create  — create a new room
 * POST   /api/rooms/join    — validate + join existing room
 * GET    /api/rooms         — get all active rooms
 * GET    /api/rooms/:id     — get room details
 * DELETE /api/rooms/:id     — delete room (host only)
 */
router.post('/create', createRoom)
router.post('/join',   joinRoom)
router.get('/',        getRooms)
router.get('/:id',     getRoom)
router.delete('/:id',  deleteRoom)

module.exports = router

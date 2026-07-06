const express = require('express')
const router = express.Router()
const { createRoom, joinRoom, getRoom } = require('../controllers/roomController')

/**
 * Room routes
 * POST /api/rooms/create  — create a new room
 * POST /api/rooms/join    — validate + join existing room
 * GET  /api/rooms/:id     — get room details
 */
router.post('/create', createRoom)
router.post('/join',   joinRoom)
router.get('/:id',    getRoom)

module.exports = router

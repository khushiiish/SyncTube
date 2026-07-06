const { customAlphabet } = require('nanoid')

/**
 * generateRoomId — creates a short, human-readable, URL-safe room code.
 * Format: ST-XXXX where X is uppercase alphanumeric.
 * Example: ST-8X92, ST-K7MN
 *
 * Character set excludes confusing chars: 0, O, I, 1, L
 */
const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const nanoid = customAlphabet(alphabet, 6)

function generateRoomId() {
  return `ST-${nanoid()}`
}

module.exports = { generateRoomId }

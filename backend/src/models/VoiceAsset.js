const mongoose = require('mongoose')

/**
 * VoiceAsset — internal tracking for uploaded Cloudinary audio assets.
 *
 * Used to ensure audio assets do not accumulate indefinitely when rooms
 * reach their 24-hour TTL expiration.
 *
 * This collection is internal to the server and is NEVER exposed to clients.
 */

const voiceAssetSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    index: true,
  },
  publicId: {
    type: String,
    required: true,
    unique: true,
  },
  deleteAfter: {
    type: Date,
    required: true,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

const VoiceAsset = mongoose.model('VoiceAsset', voiceAssetSchema)
module.exports = VoiceAsset

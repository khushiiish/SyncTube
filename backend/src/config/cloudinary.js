const { v2: cloudinary } = require('cloudinary')

/**
 * Cloudinary configuration module for SyncTube audio storage.
 *
 * Configures Cloudinary v2 SDK using environment variables:
 * - CLOUDINARY_CLOUD_NAME
 * - CLOUDINARY_API_KEY
 * - CLOUDINARY_API_SECRET
 *
 * If credentials are missing, logs a non-blocking diagnostic warning.
 * The application continues running without disruption (text chat, room creation,
 * and video sync remain fully functional).
 */

const cloudName = process.env.CLOUDINARY_CLOUD_NAME
const apiKey = process.env.CLOUDINARY_API_KEY
const apiSecret = process.env.CLOUDINARY_API_SECRET

const isConfigured = Boolean(cloudName && apiKey && apiSecret)

if (isConfigured) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key:    apiKey,
    api_secret: apiSecret,
    secure:     true,
  })
  console.log('[Cloudinary] Cloudinary audio storage configured.')
} else {
  console.warn('[Cloudinary] Voice messaging unavailable — configuration missing.')
}

/**
 * Check if Cloudinary is configured and ready for audio uploads.
 * @returns {boolean}
 */
function isCloudinaryConfigured() {
  return isConfigured
}

module.exports = {
  cloudinary,
  isCloudinaryConfigured,
}

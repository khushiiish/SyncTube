const crypto = require('crypto')
const { cloudinary, isCloudinaryConfigured } = require('../config/cloudinary')

/**
 * voiceStorageService.js
 *
 * Handles streaming audio buffer uploads directly to Cloudinary using
 * the resource_type: 'video' configuration required by Cloudinary for audio assets.
 * Never saves files to disk; buffers stream in-memory via upload_stream.
 */

/**
 * Upload an audio buffer to Cloudinary.
 *
 * @param {Object} params
 * @param {Buffer} params.buffer - Raw audio binary buffer
 * @param {string} params.roomId - Room identifier for folder organization
 * @param {string} [params.mimeType] - Audio MIME type
 * @returns {Promise<{ url: string, publicId: string, bytes: number, format: string, duration: number|null }>}
 */
function uploadAudio({ buffer, roomId, mimeType }) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    return Promise.reject(new Error('Invalid audio data provided.'))
  }

  // If Cloudinary credentials are not configured, fall back to embedded data URL storage
  if (!isCloudinaryConfigured()) {
    const format = mimeType ? (mimeType.split('/')[1] || 'webm').split(';')[0] : 'webm'
    const base64Audio = buffer.toString('base64')
    const dataUrl = `data:${mimeType || 'audio/webm'};base64,${base64Audio}`
    return Promise.resolve({
      url:      dataUrl,
      publicId: `local-${crypto.randomUUID()}`,
      bytes:    buffer.length,
      format,
      duration: null,
    })
  }

  return new Promise((resolve, reject) => {
    // Generate unguessable random public ID within room-specific folder
    const uniqueId = crypto.randomUUID()
    const folder = `synctube/voice/${roomId.toUpperCase()}`
    const publicId = `${folder}/${uniqueId}`

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'video', // Cloudinary requires 'video' for audio files
        public_id:     publicId,
        overwrite:     true,
      },
      (error, result) => {
        if (error) {
          console.error('[Cloudinary] Upload failed:', error.message)
          return reject(new Error('Failed to upload voice message to storage provider.'))
        }

        resolve({
          url:      result.secure_url,
          publicId: result.public_id,
          bytes:    result.bytes || buffer.length,
          format:   result.format || (mimeType ? mimeType.split('/')[1] : 'audio'),
          duration: typeof result.duration === 'number' ? Math.round(result.duration) : null,
        })
      }
    )

    uploadStream.end(buffer)
  })
}

/**
 * Delete an audio asset from Cloudinary by its publicId.
 *
 * @param {string} publicId
 * @returns {Promise<Object|null>}
 */
async function deleteAudio(publicId) {
  if (!isCloudinaryConfigured() || !publicId || publicId.startsWith('local-')) return null

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'video',
    })
    return result
  } catch (err) {
    console.warn(`[Cloudinary] Failed to delete asset ${publicId}:`, err.message)
    return null
  }
}

module.exports = {
  uploadAudio,
  deleteAudio,
}

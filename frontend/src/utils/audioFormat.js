/**
 * audioFormat.js
 *
 * Audio utility functions for duration formatting, MIME-type negotiation,
 * and browser media compatibility detection.
 */

/**
 * Format a duration in seconds into `m:ss` (e.g., 0:05, 1:23).
 *
 * @param {number|null|undefined} seconds
 * @returns {string}
 */
export function formatAudioDuration(seconds) {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) {
    return '0:00'
  }
  const totalSecs = Math.round(seconds)
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

/**
 * Get the best supported audio MIME type for MediaRecorder in the current browser.
 *
 * @returns {string}
 */
export function getSupportedAudioMimeType() {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return 'audio/webm'
  }

  const candidateTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
    'audio/aac',
    'audio/wav',
  ]

  for (const type of candidateTypes) {
    try {
      if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(type)) {
        return type
      }
    } catch {
      // Continue searching
    }
  }

  return 'audio/webm'
}

/**
 * Get standard file extension corresponding to an audio MIME type.
 *
 * @param {string} [mimeType]
 * @returns {string}
 */
export function getExtensionForMimeType(mimeType = '') {
  const norm = mimeType.toLowerCase()
  if (norm.includes('ogg')) return 'ogg'
  if (norm.includes('mp4') || norm.includes('m4a')) return 'm4a'
  if (norm.includes('wav')) return 'wav'
  if (norm.includes('aac')) return 'aac'
  return 'webm'
}

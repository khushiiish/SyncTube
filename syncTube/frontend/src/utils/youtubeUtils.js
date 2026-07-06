/**
 * youtubeUtils.js — YouTube URL parsing utilities.
 *
 * Supports:
 *   youtube.com/watch?v=VIDEO_ID
 *   youtu.be/VIDEO_ID
 *   youtube.com/embed/VIDEO_ID
 *   youtube.com/shorts/VIDEO_ID
 */

/**
 * Extract YouTube video ID from any valid YouTube URL.
 * @param {string} url
 * @returns {string|null} videoId or null if invalid
 */
export function extractVideoId(url) {
  if (!url) return null

  try {
    const u = new URL(url.trim())

    // youtu.be/VIDEO_ID
    if (u.hostname === 'youtu.be') {
      return u.pathname.slice(1).split('?')[0] || null
    }

    // youtube.com/watch?v=VIDEO_ID
    if (u.searchParams.has('v')) {
      return u.searchParams.get('v')
    }

    // youtube.com/embed/VIDEO_ID or youtube.com/shorts/VIDEO_ID
    const match = u.pathname.match(/\/(embed|shorts|v)\/([a-zA-Z0-9_-]{11})/)
    if (match) return match[2]

  } catch {
    // Not a valid URL — try regex fallback
    const regexes = [
      /[?&]v=([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /\/embed\/([a-zA-Z0-9_-]{11})/,
      /\/shorts\/([a-zA-Z0-9_-]{11})/,
    ]
    for (const re of regexes) {
      const m = url.match(re)
      if (m) return m[1]
    }
  }

  return null
}

/**
 * Format seconds as mm:ss or h:mm:ss
 * @param {number} seconds
 */
export function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

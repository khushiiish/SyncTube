/**
 * deviceIdentity.js
 *
 * Manages unique session identification and client device detection.
 * Persisted in sessionStorage (strictly scoped to a single tab/window session).
 */

const SESSION_KEY = 'synctube:session-id:v1'

/**
 * Get or generate the unique session ID for this browser tab/window.
 *
 * @returns {string}
 */
export function getSessionId() {
  try {
    let sessionId = sessionStorage.getItem(SESSION_KEY)
    if (sessionId && typeof sessionId === 'string' && sessionId.length >= 16) {
      return sessionId
    }

    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      sessionId = crypto.randomUUID()
    } else {
      sessionId = 'sess_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now().toString(36)
    }

    sessionStorage.setItem(SESSION_KEY, sessionId)
    return sessionId
  } catch {
    return 'sess_' + Math.random().toString(36).slice(2, 11)
  }
}

/**
 * Detect a friendly description of the current device and browser.
 *
 * @returns {string}
 */
export function getDeviceInfo() {
  if (typeof navigator === 'undefined') return 'Unknown Device'

  const ua = navigator.userAgent || ''
  let platform = 'Laptop / Desktop'

  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
    platform = 'Mobile'
  } else if (/tablet|ipad/i.test(ua)) {
    platform = 'Tablet'
  }

  let os = ''
  if (/windows/i.test(ua)) os = 'Windows'
  else if (/macintosh|mac os/i.test(ua)) os = 'Mac'
  else if (/iphone|ipad/i.test(ua)) os = 'iOS'
  else if (/android/i.test(ua)) os = 'Android'
  else if (/linux/i.test(ua)) os = 'Linux'

  let browser = ''
  if (/edg/i.test(ua)) browser = 'Edge'
  else if (/chrome/i.test(ua)) browser = 'Chrome'
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari'
  else if (/firefox/i.test(ua)) browser = 'Firefox'

  const parts = [browser, os].filter(Boolean).join(' on ')
  return parts ? `${platform} (${parts})` : platform
}

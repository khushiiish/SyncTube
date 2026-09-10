/**
 * webrtc.js — Central WebRTC and ICE server configuration.
 *
 * Configures free public STUN servers for NAT traversal by default,
 * while allowing custom STUN/TURN server lists via environment variable:
 * VITE_ICE_SERVERS='[{"urls":"turn:your-turn-server.com:3478","username":"...","credential":"..."}]'
 */

export const getDefaultIceServers = () => {
  const envIce = import.meta.env?.VITE_ICE_SERVERS
  if (envIce) {
    try {
      const parsed = JSON.parse(envIce)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    } catch {
      console.warn('[WebRTC] Failed to parse VITE_ICE_SERVERS JSON. Falling back to default STUN servers.')
    }
  }

  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
}

export const RTC_CONFIG = {
  iceServers: getDefaultIceServers(),
  iceCandidatePoolSize: 10,
}

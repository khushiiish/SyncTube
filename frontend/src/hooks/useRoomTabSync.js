import { useEffect, useRef } from 'react'

/**
 * useRoomTabSync — cross-tab coordination using the browser BroadcastChannel API.
 *
 * This hook is an auxiliary helper layer for fast same-origin tab coordination.
 * Socket.IO + MongoDB remain strictly authoritative for all permissions and playback state.
 *
 * Transmits only safe coordination events:
 * - ROOM_KICKED: alerts other local tabs to clear room state and redirect
 * - ROOM_RESET: alerts other local tabs that session ended
 *
 * Sensitive tokens, hashes, and credentials are NEVER broadcasted.
 * Gracefully no-ops if BroadcastChannel is unsupported in the browser.
 *
 * @param {Object} params
 * @param {string} params.roomId
 * @param {Function} [params.onKicked] - Invoked when another tab broadcasts a kick event
 */
export function useRoomTabSync({ roomId, onKicked }) {
  const channelRef = useRef(null)

  useEffect(() => {
    if (!roomId || typeof window === 'undefined' || !('BroadcastChannel' in window)) {
      return
    }

    const channelName = `synctube:room:${roomId.toUpperCase()}`
    const channel = new window.BroadcastChannel(channelName)
    channelRef.current = channel

    channel.onmessage = (event) => {
      const { type } = event.data || {}
      if (type === 'ROOM_KICKED') {
        if (typeof onKicked === 'function') {
          onKicked()
        }
      }
    }

    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [roomId, onKicked])

  /**
   * Broadcast a coordination event to other tabs of the same room on this browser.
   */
  const broadcastEvent = (type, payload = {}) => {
    if (channelRef.current) {
      try {
        channelRef.current.postMessage({ type, ...payload })
      } catch {
        // Safe fallback if channel is closed
      }
    }
  }

  return { broadcastEvent }
}

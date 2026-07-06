import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

/**
 * SocketContext — singleton Socket.IO connection.
 *
 * Architecture decision: We create ONE socket for the app lifetime.
 * Reconnection is handled by Socket.IO automatically.
 * The socket only connects when the provider mounts.
 */
const SocketContext = createContext(null)

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'

export function SocketProvider({ children }) {
  const socketRef = useRef(null)
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState(false)

  useEffect(() => {
    // Create the socket — autoConnect: false so we control when it connects
    socketRef.current = io(SOCKET_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      transports: ['websocket', 'polling'],
    })

    const socket = socketRef.current

    socket.on('connect', () => {
      setIsConnected(true)
      setConnectionError(false)
    })

    socket.on('disconnect', () => {
      setIsConnected(false)
    })

    socket.on('connect_error', () => {
      setConnectionError(true)
      setIsConnected(false)
    })

    socket.on('reconnect', () => {
      setIsConnected(true)
      setConnectionError(false)
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, isConnected, connectionError }}>
      {children}
    </SocketContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSocketContext() {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error('useSocketContext must be used within <SocketProvider>')
  return ctx
}

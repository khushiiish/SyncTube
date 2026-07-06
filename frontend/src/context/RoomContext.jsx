import { createContext, useContext, useReducer, useCallback } from 'react'

/**
 * RoomContext — centralized room + participant state.
 *
 * State shape:
 * {
 *   room: { roomId, roomName, hostSocketId } | null
 *   currentUser: { socketId, username, role } | null
 *   participants: Array<{ socketId, username, role }>
 *   videoState: { videoId, isPlaying, currentTime }
 *   chatMessages: Array<{ id, socketId, username, text, timestamp }>
 * }
 */

const RoomContext = createContext(null)

const initialState = {
  room: null,
  currentUser: null,
  participants: [],
  videoState: {
    videoId: null,
    isPlaying: false,
    currentTime: 0,
  },
  chatMessages: [],
}

function roomReducer(state, action) {
  switch (action.type) {
    case 'SET_ROOM':
      return { ...state, room: action.payload }

    case 'SET_CURRENT_USER':
      return { ...state, currentUser: action.payload }

    case 'SET_PARTICIPANTS':
      return { ...state, participants: action.payload }

    case 'ADD_PARTICIPANT': {
      const exists = state.participants.some(p => p.socketId === action.payload.socketId)
      if (exists) return state
      return { ...state, participants: [...state.participants, action.payload] }
    }

    case 'REMOVE_PARTICIPANT':
      return {
        ...state,
        participants: state.participants.filter(p => p.socketId !== action.payload),
      }

    case 'UPDATE_PARTICIPANT_ROLE':
      return {
        ...state,
        participants: state.participants.map(p =>
          p.socketId === action.payload.socketId
            ? { ...p, role: action.payload.role }
            : p
        ),
        // Also update currentUser if it's us
        currentUser:
          state.currentUser?.socketId === action.payload.socketId
            ? { ...state.currentUser, role: action.payload.role }
            : state.currentUser,
      }

    case 'SET_VIDEO_STATE':
      return { ...state, videoState: { ...state.videoState, ...action.payload } }

    case 'ADD_CHAT_MESSAGE':
      return {
        ...state,
        chatMessages: [...state.chatMessages, action.payload].slice(-200), // keep last 200
      }

    case 'RESET_ROOM':
      return initialState

    default:
      return state
  }
}

export function RoomProvider({ children }) {
  const [state, dispatch] = useReducer(roomReducer, initialState)

  const isHost = state.currentUser?.role === 'host'
  const isModerator = state.currentUser?.role === 'moderator'
  const canControl = isHost || isModerator || state.currentUser?.role === 'participant'

  const setRoom = useCallback((room) => dispatch({ type: 'SET_ROOM', payload: room }), [])
  const setCurrentUser = useCallback((user) => dispatch({ type: 'SET_CURRENT_USER', payload: user }), [])
  const setParticipants = useCallback((list) => dispatch({ type: 'SET_PARTICIPANTS', payload: list }), [])
  const addParticipant = useCallback((p) => dispatch({ type: 'ADD_PARTICIPANT', payload: p }), [])
  const removeParticipant = useCallback((sid) => dispatch({ type: 'REMOVE_PARTICIPANT', payload: sid }), [])
  const updateParticipantRole = useCallback((data) => dispatch({ type: 'UPDATE_PARTICIPANT_ROLE', payload: data }), [])
  const setVideoState = useCallback((vs) => dispatch({ type: 'SET_VIDEO_STATE', payload: vs }), [])
  const addChatMessage = useCallback((msg) => dispatch({ type: 'ADD_CHAT_MESSAGE', payload: msg }), [])
  const resetRoom = useCallback(() => dispatch({ type: 'RESET_ROOM' }), [])

  return (
    <RoomContext.Provider value={{
      ...state,
      isHost,
      isModerator,
      canControl,
      setRoom,
      setCurrentUser,
      setParticipants,
      addParticipant,
      removeParticipant,
      updateParticipantRole,
      setVideoState,
      addChatMessage,
      resetRoom,
    }}>
      {children}
    </RoomContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRoomContext() {
  const ctx = useContext(RoomContext)
  if (!ctx) throw new Error('useRoomContext must be used within <RoomProvider>')
  return ctx
}

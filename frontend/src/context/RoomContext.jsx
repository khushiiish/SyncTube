import { createContext, useContext, useReducer, useCallback } from 'react'

/**
 * RoomContext — centralized room + participant state.
 *
 * State shape:
 * {
 *   room: { roomId, roomName, hostParticipantId, hostSocketId } | null
 *   currentUser: { participantId, username, role, socketId, isPrimaryConnection } | null
 *   participants: Array<{ participantId, username, role, status }>
 *   videoState: { videoId, isPlaying, currentTime }
 *   chatMessages: Array<{ id, participantId, username, text, timestamp }>
 * }
 */

const RoomContext = createContext(null)

const initialState = {
  room: null,
  currentUser: null,
  participants: [],
  membershipVersion: 0,
  videoState: {
    videoId: null,
    isPlaying: false,
    currentTime: 0,
  },
  queue: [],
  chatMessages: [],
}

function roomReducer(state, action) {
  switch (action.type) {
    case 'SET_ROOM':
      return { ...state, room: action.payload }

    case 'SET_QUEUE':
      return { ...state, queue: action.payload }

    case 'SET_CURRENT_USER':
      return { ...state, currentUser: action.payload }

    case 'SET_PRIMARY_CONNECTION':
      return {
        ...state,
        currentUser: state.currentUser
          ? { ...state.currentUser, isPrimaryConnection: Boolean(action.payload) }
          : state.currentUser,
      }

    case 'SET_PARTICIPANTS':
      return { ...state, participants: action.payload }

    case 'APPLY_PARTICIPANTS_SYNC': {
      const { participants = [], hostParticipantId, membershipVersion = 0 } = action.payload || {}

      // Ignore stale snapshots if incoming version is older than what we already applied
      if (typeof membershipVersion === 'number' && membershipVersion < (state.membershipVersion || 0)) {
        return state
      }

      // Defensive canonical host normalization: guarantee at most one host matching hostParticipantId
      const normalizedParticipants = participants.map(p => {
        const isCanonicalHost = hostParticipantId && p.participantId === hostParticipantId
        if (isCanonicalHost && p.role !== 'host') {
          return { ...p, role: 'host' }
        }
        if (!isCanonicalHost && p.role === 'host') {
          return { ...p, role: 'participant' }
        }
        return p
      })

      // Authoritatively sync currentUser role from the new participants array
      let updatedCurrentUser = state.currentUser
      if (state.currentUser) {
        const myPart = normalizedParticipants.find(p =>
          (state.currentUser.participantId && p.participantId === state.currentUser.participantId) ||
          (state.currentUser.socketId && p.socketId === state.currentUser.socketId)
        )
        if (myPart && myPart.role !== state.currentUser.role) {
          updatedCurrentUser = { ...state.currentUser, role: myPart.role }
        }
      }

      // Authoritatively sync room.hostParticipantId
      let updatedRoom = state.room
      if (state.room && hostParticipantId && state.room.hostParticipantId !== hostParticipantId) {
        updatedRoom = { ...state.room, hostParticipantId }
      }

      return {
        ...state,
        participants: normalizedParticipants,
        membershipVersion,
        currentUser: updatedCurrentUser,
        room: updatedRoom,
      }
    }

    case 'ADD_PARTICIPANT': {
      const targetId = action.payload.participantId || action.payload.socketId
      const exists = state.participants.some(p => (p.participantId || p.socketId) === targetId)
      if (exists) return state
      return { ...state, participants: [...state.participants, action.payload] }
    }

    case 'REMOVE_PARTICIPANT': {
      const targetId = action.payload
      return {
        ...state,
        participants: state.participants.filter(p => (p.participantId || p.socketId) !== targetId),
      }
    }

    case 'UPDATE_PARTICIPANT_ROLE': {
      const updateId = action.payload.participantId || action.payload.socketId
      return {
        ...state,
        participants: state.participants.map(p =>
          (p.participantId || p.socketId) === updateId
            ? { ...p, role: action.payload.role }
            : p
        ),
        currentUser:
          state.currentUser && ((state.currentUser.participantId && state.currentUser.participantId === updateId) || state.currentUser.socketId === updateId)
            ? { ...state.currentUser, role: action.payload.role }
            : state.currentUser,
      }
    }

    case 'SET_VIDEO_STATE':
      return { ...state, videoState: { ...state.videoState, ...action.payload } }

    case 'SET_CHAT_MESSAGES':
      return {
        ...state,
        chatMessages: Array.isArray(action.payload) ? action.payload.slice(-250) : [],
      }

    case 'ADD_CHAT_MESSAGE': {
      const msg = action.payload
      if (!msg) return state
      const msgId = msg.messageId || msg.id
      if (msgId && state.chatMessages.some(m => (m.messageId || m.id) === msgId)) {
        return state
      }
      return {
        ...state,
        chatMessages: [...state.chatMessages, msg].slice(-250),
      }
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
  const canControl = isHost || isModerator

  const setRoom = useCallback((room) => dispatch({ type: 'SET_ROOM', payload: room }), [])
  const setQueue = useCallback((q) => dispatch({ type: 'SET_QUEUE', payload: q }), [])
  const setCurrentUser = useCallback((user) => dispatch({ type: 'SET_CURRENT_USER', payload: user }), [])
  const setPrimaryConnection = useCallback((isPrimary) => dispatch({ type: 'SET_PRIMARY_CONNECTION', payload: isPrimary }), [])
  const setParticipants = useCallback((list) => dispatch({ type: 'SET_PARTICIPANTS', payload: list }), [])
  const applyParticipantsSync = useCallback((payload) => dispatch({ type: 'APPLY_PARTICIPANTS_SYNC', payload }), [])
  const addParticipant = useCallback((p) => dispatch({ type: 'ADD_PARTICIPANT', payload: p }), [])
  const removeParticipant = useCallback((id) => dispatch({ type: 'REMOVE_PARTICIPANT', payload: id }), [])
  const updateParticipantRole = useCallback((data) => dispatch({ type: 'UPDATE_PARTICIPANT_ROLE', payload: data }), [])
  const setVideoState = useCallback((vs) => dispatch({ type: 'SET_VIDEO_STATE', payload: vs }), [])
  const setChatMessages = useCallback((msgs) => dispatch({ type: 'SET_CHAT_MESSAGES', payload: msgs }), [])
  const addChatMessage = useCallback((msg) => dispatch({ type: 'ADD_CHAT_MESSAGE', payload: msg }), [])
  const resetRoom = useCallback(() => dispatch({ type: 'RESET_ROOM' }), [])

  return (
    <RoomContext.Provider value={{
      ...state,
      isHost,
      isModerator,
      canControl,
      setRoom,
      setQueue,
      setCurrentUser,
      setPrimaryConnection,
      setParticipants,
      applyParticipantsSync,
      addParticipant,
      removeParticipant,
      updateParticipantRole,
      setVideoState,
      setChatMessages,
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

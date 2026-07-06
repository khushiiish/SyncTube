import { useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useSocketContext } from '../context/SocketContext'
import { useRoomContext } from '../context/RoomContext'
import { EVENTS } from '../services/socketService'

/**
 * useSocket — subscribes to all room-scoped socket events.
 * Must be called inside a room page after joining a room.
 *
 * @param {{ roomId: string, playerControls: object }} options
 */
export default function useSocket({ roomId, playerControls }) {
  const { socket } = useSocketContext()
  const navigate = useNavigate()
  const {
    addParticipant,
    removeParticipant,
    updateParticipantRole,
    setParticipants,
    setVideoState,
    addChatMessage,
    setRoom,
    currentUser,
    resetRoom,
  } = useRoomContext()

  useEffect(() => {
    if (!socket || !roomId) return

    // --- user_joined ---
    socket.on(EVENTS.USER_JOINED, ({ participant }) => {
      addParticipant(participant)
      toast(`${participant.username} joined the room`, {
        icon: '👋',
      })
    })

    // --- user_left ---
    socket.on(EVENTS.USER_LEFT, ({ socketId, username }) => {
      removeParticipant(socketId)
      toast(`${username} left the room`, { icon: '👋' })
    })

    // --- sync_state (late joiner gets full state) ---
    socket.on(EVENTS.SYNC_STATE, ({ participants, videoState, room }) => {
      if (participants) setParticipants(participants)
      if (videoState)   setVideoState(videoState)
      if (room)         setRoom(room)

      // Apply playback sync to the player
      if (videoState?.videoId && playerControls) {
        if (videoState.isPlaying) {
          playerControls.play(videoState.currentTime)
        } else {
          playerControls.pause(videoState.currentTime)
        }
      }
    })

    // --- play ---
    socket.on(EVENTS.PLAY, ({ currentTime }) => {
      setVideoState({ isPlaying: true, currentTime })
      playerControls?.play(currentTime)
    })

    // --- pause ---
    socket.on(EVENTS.PAUSE, ({ currentTime }) => {
      setVideoState({ isPlaying: false, currentTime })
      playerControls?.pause(currentTime)
    })

    // --- seek ---
    socket.on(EVENTS.SEEK, ({ currentTime }) => {
      setVideoState({ currentTime })
      playerControls?.seekTo(currentTime)
    })

    // --- change_video ---
    socket.on(EVENTS.CHANGE_VIDEO, ({ videoId, title }) => {
      setVideoState({ videoId, isPlaying: false, currentTime: 0 })
      toast(`Now playing: ${title || 'new video'}`, { icon: '🎬' })
    })

    // --- role_updated ---
    socket.on(EVENTS.ROLE_UPDATED, ({ socketId, role, username }) => {
      updateParticipantRole({ socketId, role })
      const roleLabel = role === 'host' ? 'Host' : role === 'moderator' ? 'Moderator' : 'Participant'
      toast(`${username} is now ${roleLabel}`, { icon: '🔄' })
    })

    // --- kicked ---
    socket.on(EVENTS.KICKED, () => {
      toast.error('You were removed from the room.')
      resetRoom()
      navigate('/')
    })

    // --- chat_message ---
    socket.on(EVENTS.CHAT_MESSAGE, (message) => {
      addChatMessage(message)
    })

    // --- error ---
    socket.on(EVENTS.ERROR, ({ message }) => {
      toast.error(message || 'An error occurred')
    })

    return () => {
      // Clean up all listeners when room changes or unmounts
      Object.values(EVENTS).forEach(event => socket.off(event))
    }
  }, [socket, roomId]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

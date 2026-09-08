import { useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuth } from '@clerk/react'
import RoomHeader from '../components/room/RoomHeader'
import VideoPlayer from '../components/room/VideoPlayer'
import QueueInput from '../components/room/QueueInput'
import Sidebar from '../components/room/Sidebar'
import ConnectionBanner from '../components/room/ConnectionBanner'
import { useRoomContext } from '../context/RoomContext'
import { useSocketContext } from '../context/SocketContext'
import { EVENTS, emitJoinRoom, emitSyncRequest } from '../services/socketService'
import { getRoom } from '../services/api'
import { getGuestDeviceId } from '../utils/clientIdentity'
import { getRoomSession, setRoomSession, clearRoomSession } from '../utils/roomSession'
import { useRoomTabSync } from '../hooks/useRoomTabSync'

/**
 * RoomPage — main watch party room layout.
 *
 * Phase 3 Architecture:
 * - Recovers nickname from localStorage room session so duplicate tabs join seamlessly.
 * - Obtains fresh Clerk session token if authenticated; sends guestDeviceId for guests.
 * - Handles structured JOIN_ROOM acknowledgement (including BANNED_FROM_ROOM rejection).
 * - Coordinates immediate cross-tab eviction using BroadcastChannel.
 * - Updates roles, kicks, and participant lists using stable participantId.
 */
export default function RoomPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { getToken, isSignedIn } = useAuth()
  const hasJoinedToastRef = useRef(false)

  const {
    room, currentUser, setRoom, setCurrentUser, setPrimaryConnection,
    setParticipants, setVideoState, addParticipant,
    removeParticipant, updateParticipantRole,
    setChatMessages, addChatMessage, resetRoom, videoState, participants,
    setQueue,
  } = useRoomContext()

  const { socket } = useSocketContext()

  // Cross-tab local coordination (e.g. immediate eviction if another tab was kicked)
  const { broadcastEvent } = useRoomTabSync({
    roomId,
    onKicked: () => {
      clearRoomSession(roomId)
      toast.error('You were removed from this room.')
      resetRoom()
      navigate('/')
    },
  })

  // Validate room exists on mount
  useEffect(() => {
    if (!roomId) return

    const validate = async () => {
      try {
        const data = await getRoom(roomId)
        const { room: fetchedRoom } = data
        if (!room) setRoom(fetchedRoom)
      } catch {
        toast.error('Room not found or has expired.')
        navigate('/')
      }
    }

    validate()
  }, [roomId, setRoom, room, navigate])

  // Check currentUser: if empty, try recovering from local room session before redirecting
  useEffect(() => {
    if (!currentUser && roomId) {
      const storedSession = getRoomSession(roomId)
      if (storedSession && storedSession.username) {
        // Recover nickname and initialize currentUser so tab can join automatically
        setCurrentUser({ username: storedSession.username, role: 'participant' })
      } else {
        // No prior session on this device -> redirect to landing page to enter nickname
        navigate('/', { state: { joinRoomId: roomId } })
      }
    }
  }, [currentUser, roomId, navigate, setCurrentUser])

  // Subscribe to all socket events and manage connection/reconnection flow
  useEffect(() => {
    if (!socket || !roomId || !currentUser?.username) return

    const handleUserJoined = ({ participant }) => {
      addParticipant(participant)
      const isMe = participant.participantId
        ? participant.participantId === currentUser?.participantId
        : participant.socketId === socket.id

      if (!isMe) {
        toast(`${participant.username} joined the room`, { icon: '👋' })
      }
    }

    const handleUserLeft = ({ participantId, socketId, username }) => {
      removeParticipant(participantId || socketId)
      toast(`${username || 'A participant'} left the room`, { icon: '👋' })
    }

    const handleSyncState = ({
      participants: parts,
      videoState: vs,
      room: r,
      queue,
      chatMessages: cms,
      currentUserRole,
      currentUserParticipantId,
      isPrimaryConnection,
    }) => {
      if (parts) setParticipants(parts)
      if (vs) setVideoState(vs)
      if (queue) setQueue(queue)
      if (cms) setChatMessages(cms)
      if (r && !room) setRoom(r)

      if (currentUser) {
        setCurrentUser({
          ...currentUser,
          participantId: currentUserParticipantId || currentUser.participantId,
          socketId: socket.id,
          role: currentUserRole || currentUser.role,
          isPrimaryConnection: typeof isPrimaryConnection === 'boolean'
            ? isPrimaryConnection
            : currentUser.isPrimaryConnection,
        })
      }
    }

    const handleRoleUpdated = ({ participantId, socketId, role, username }) => {
      updateParticipantRole({ participantId, socketId, role })
      const roleLabel = { host: 'Host', moderator: 'Moderator', participant: 'Participant', viewer: 'Viewer' }[role] || role
      toast(`${username} is now ${roleLabel}`, { icon: '🔄' })
    }

    const handlePrimaryChanged = ({ isPrimary }) => {
      setPrimaryConnection(isPrimary)
    }

    const handleKicked = () => {
      broadcastEvent('ROOM_KICKED')
      clearRoomSession(roomId)
      toast.error('You were removed from the room.')
      resetRoom()
      navigate('/')
    }

    const handleQueueSync = ({ queue }) => {
      if (queue) setQueue(queue)
    }

    const handlePlay = ({ currentTime }) => {
      setVideoState({ isPlaying: true, currentTime })
    }

    const handlePause = ({ currentTime }) => {
      setVideoState({ isPlaying: false, currentTime })
    }

    const handleSeek = ({ currentTime }) => {
      setVideoState({ currentTime })
    }

    const handleChangeVideo = ({ videoId, title }) => {
      setVideoState({ videoId, isPlaying: false, currentTime: 0 })
      toast(`Now playing: ${title || 'new video'}`, { icon: '🎬' })
    }

    const handleChatMessage = (message) => {
      addChatMessage(message)
    }

    const handleError = ({ message }) => {
      toast.error(message || 'An error occurred')
    }

    // Attach listeners
    socket.on(EVENTS.USER_JOINED, handleUserJoined)
    socket.on(EVENTS.USER_LEFT, handleUserLeft)
    socket.on(EVENTS.SYNC_STATE, handleSyncState)
    socket.on(EVENTS.ROLE_UPDATED, handleRoleUpdated)
    socket.on(EVENTS.PRIMARY_CONNECTION_CHANGED, handlePrimaryChanged)
    socket.on(EVENTS.KICKED, handleKicked)
    socket.on(EVENTS.QUEUE_SYNC, handleQueueSync)
    socket.on(EVENTS.PLAY, handlePlay)
    socket.on(EVENTS.PAUSE, handlePause)
    socket.on(EVENTS.SEEK, handleSeek)
    socket.on(EVENTS.CHANGE_VIDEO, handleChangeVideo)
    socket.on(EVENTS.CHAT_MESSAGE, handleChatMessage)
    socket.on(EVENTS.ERROR, handleError)

    // Execute join with fresh credentials & device identity
    const handleJoin = async () => {
      try {
        let clerkToken = null
        if (isSignedIn) {
          clerkToken = await getToken()
        }
        const guestDeviceId = getGuestDeviceId()

        emitJoinRoom(socket, {
          roomId,
          username: currentUser.username,
          guestDeviceId,
          clerkToken,
        }, (res) => {
          if (!res) return

          if (res.success) {
            setRoomSession(roomId, { username: res.username })
            setCurrentUser({
              ...currentUser,
              participantId:       res.participantId,
              username:            res.username,
              role:                res.role,
              socketId:            socket.id,
              isPrimaryConnection: res.isPrimaryConnection,
            })

            if (!hasJoinedToastRef.current) {
              hasJoinedToastRef.current = true
              toast.success(`Joined "${room?.roomName || 'Party'}"!`)
            }
          } else {
            if (res.code === 'BANNED_FROM_ROOM') {
              broadcastEvent('ROOM_KICKED')
              clearRoomSession(roomId)
              toast.error(res.message || 'You were removed from this room and cannot rejoin.')
              resetRoom()
              navigate('/')
            } else {
              toast.error(res.message || 'Failed to join room.')
            }
          }
        })
      } catch (err) {
        console.error('Join error:', err)
      }
    }

    if (socket.connected) {
      handleJoin()
    }

    socket.on('connect', handleJoin)

    return () => {
      socket.off(EVENTS.USER_JOINED, handleUserJoined)
      socket.off(EVENTS.USER_LEFT, handleUserLeft)
      socket.off(EVENTS.SYNC_STATE, handleSyncState)
      socket.off(EVENTS.ROLE_UPDATED, handleRoleUpdated)
      socket.off(EVENTS.PRIMARY_CONNECTION_CHANGED, handlePrimaryChanged)
      socket.off(EVENTS.KICKED, handleKicked)
      socket.off(EVENTS.QUEUE_SYNC, handleQueueSync)
      socket.off(EVENTS.PLAY, handlePlay)
      socket.off(EVENTS.PAUSE, handlePause)
      socket.off(EVENTS.SEEK, handleSeek)
      socket.off(EVENTS.CHANGE_VIDEO, handleChangeVideo)
      socket.off(EVENTS.CHAT_MESSAGE, handleChatMessage)
      socket.off(EVENTS.ERROR, handleError)
      socket.off('connect', handleJoin)
    }
  }, [socket, roomId, currentUser?.username, isSignedIn, getToken]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resync room state when tab returns to focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && socket && roomId) {
        emitSyncRequest(socket, { roomId })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [socket, roomId])

  return (
    <div className="h-screen w-full overflow-hidden flex flex-col bg-[#131315] text-[#e5e1e4]">
      <RoomHeader />

      <main className="flex-1 flex pt-[72px] h-full overflow-hidden">
        <section className="flex-1 relative flex flex-col items-center p-4 lg:p-6 bg-[#0e0e10] overflow-y-auto scrollbar-thin">
          <div className="absolute inset-0 z-0 flex items-center justify-center opacity-20 pointer-events-none">
            <div className="w-3/4 h-3/4 bg-[#ffb3ad]/10 rounded-full blur-[160px]" />
          </div>

          <div className="relative z-10 w-full flex flex-col items-center gap-6 max-w-5xl mx-auto my-auto py-4">
            <QueueInput />
            <VideoPlayer />

            {videoState?.videoId && (
              <div className="w-full flex justify-between items-start">
                <div>
                  <h2 className="font-[Geist,sans-serif] font-semibold text-[20px] tracking-[-0.02em] text-[#e5e1e4] mb-1">
                    {room?.currentVideo?.title || 'Watch Party'}
                  </h2>
                  <div className="flex items-center gap-3 text-[#e4beba] font-[Geist,sans-serif] text-[13px]">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                      {participants.length} Watching
                    </span>
                    <span>•</span>
                    <span className="text-[#ff5451]">Synced</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <Sidebar />
      </main>

      <ConnectionBanner />
    </div>
  )
}

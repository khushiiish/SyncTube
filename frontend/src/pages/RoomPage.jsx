import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import RoomHeader from '../components/room/RoomHeader'
import VideoPlayer from '../components/room/VideoPlayer'
import QueueInput from '../components/room/QueueInput'
import Sidebar from '../components/room/Sidebar'
import ConnectionBanner from '../components/room/ConnectionBanner'
import { useRoomContext } from '../context/RoomContext'
import { useSocketContext } from '../context/SocketContext'
import { EVENTS } from '../services/socketService'
import { getRoom } from '../services/api'

/**
 * RoomPage — main watch room layout.
 *
 * Layout (from Stitch):
 * - Fixed header (RoomHeader)
 * - Main: flex row
 *   - Video section (flex-1, ~70%)
 *   - Sidebar (fixed 320px–380px, ~30%)
 * - Fixed connection banner
 *
 * On mount: validates room exists via REST API,
 * subscribes to all socket events.
 */
export default function RoomPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()

  const {
    room, currentUser, setRoom, setCurrentUser,
    setParticipants, setVideoState, addParticipant,
    removeParticipant, updateParticipantRole,
    addChatMessage, resetRoom, videoState, participants,
    setQueue,
  } = useRoomContext()

  const { socket, isConnected } = useSocketContext()

  // On mount: validate room and register current user if navigating directly
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
  }, [roomId, setRoom, room, navigate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect to landing page to choose nickname if entering directly without currentUser
  useEffect(() => {
    if (!currentUser) {
      navigate('/', { state: { joinRoomId: roomId } })
    }
  }, [currentUser, roomId, navigate])

  // Subscribe to all socket events and manage connection/reconnection flow
  useEffect(() => {
    if (!socket || !roomId || !currentUser?.username) return

    socket.on(EVENTS.USER_JOINED, ({ participant }) => {
      addParticipant(participant)
      if (participant.socketId !== socket.id) {
        toast(`${participant.username} joined the room`, { icon: '👋' })
      }
    })

    socket.on(EVENTS.USER_LEFT, ({ socketId, username }) => {
      removeParticipant(socketId)
      toast(`${username} left the room`, { icon: '👋' })
    })

    socket.on(EVENTS.SYNC_STATE, ({ participants, videoState: vs, room: r, queue, currentUserRole }) => {
      if (participants) setParticipants(participants)
      if (vs) setVideoState(vs)
      if (queue) setQueue(queue)
      if (r && !room) setRoom(r)
      // Update role from server
      if (currentUserRole && currentUser) {
        setCurrentUser({ ...currentUser, role: currentUserRole })
      }
    })

    socket.on(EVENTS.QUEUE_SYNC, ({ queue }) => {
      if (queue) setQueue(queue)
    })

    socket.on(EVENTS.PLAY, ({ currentTime }) => {
      setVideoState({ isPlaying: true, currentTime })
    })

    socket.on(EVENTS.PAUSE, ({ currentTime }) => {
      setVideoState({ isPlaying: false, currentTime })
    })

    socket.on(EVENTS.SEEK, ({ currentTime }) => {
      setVideoState({ currentTime })
    })

    socket.on(EVENTS.CHANGE_VIDEO, ({ videoId, title }) => {
      setVideoState({ videoId, isPlaying: false, currentTime: 0 })
      toast(`Now playing: ${title || 'new video'}`, { icon: '🎬' })
    })

    socket.on(EVENTS.ROLE_UPDATED, ({ socketId, role, username }) => {
      updateParticipantRole({ socketId, role })
      const roleLabel = { host: 'Host', moderator: 'Moderator', participant: 'Participant', viewer: 'Viewer' }[role] || role
      toast(`${username} is now ${roleLabel}`, { icon: '🔄' })
    })

    socket.on(EVENTS.KICKED, () => {
      toast.error('You were removed from the room.')
      resetRoom()
      navigate('/')
    })

    socket.on(EVENTS.CHAT_MESSAGE, (message) => {
      addChatMessage(message)
    })

    socket.on(EVENTS.ERROR, ({ message }) => {
      toast.error(message || 'An error occurred')
    })

    // Consolidate join/rejoin logic to prevent race conditions & handle reconnection
    const handleJoin = () => {
      socket.emit(EVENTS.JOIN_ROOM, { roomId, username: currentUser.username })
    }

    if (socket.connected) {
      handleJoin()
    }

    socket.on('connect', handleJoin)

    return () => {
      Object.values(EVENTS).forEach(event => socket.off(event))
      socket.off('connect', handleJoin)
    }
  }, [socket, roomId, currentUser?.username])

  // Sync room state automatically when tab returns to focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && socket && roomId) {
        socket.emit(EVENTS.SYNC_REQUEST, { roomId })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [socket, roomId])

  return (
    <div className="h-screen w-full overflow-hidden flex flex-col bg-[#131315] text-[#e5e1e4]">
      {/* Fixed top header */}
      <RoomHeader />

      {/* Main content area — below fixed header */}
      <main className="flex-1 flex pt-[72px] h-full overflow-hidden">
        {/* Video Canvas — left 70% */}
        <section className="flex-1 relative flex flex-col items-center p-4 lg:p-6 bg-[#0e0e10] overflow-y-auto scrollbar-thin">
          {/* Ambient background glow */}
          <div className="absolute inset-0 z-0 flex items-center justify-center opacity-20 pointer-events-none">
            <div className="w-3/4 h-3/4 bg-[#ffb3ad]/10 rounded-full blur-[160px]" />
          </div>

          <div className="relative z-10 w-full flex flex-col items-center gap-6 max-w-5xl mx-auto my-auto py-4">
            <QueueInput />
            <VideoPlayer />

            {/* Video metadata row */}
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

        {/* Sidebar — right 30% */}
        <Sidebar />
      </main>

      {/* Connection status banner */}
      <ConnectionBanner />
    </div>
  )
}

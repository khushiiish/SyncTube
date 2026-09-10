import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuth, useUser, useClerk } from '@clerk/react'
import RoomHeader from '../components/room/RoomHeader'
import VideoPlayer from '../components/room/VideoPlayer'
import QueueInput from '../components/room/QueueInput'
import Sidebar from '../components/room/Sidebar'
import ConnectionBanner from '../components/room/ConnectionBanner'
import RoomAlreadyOpen from '../components/room/RoomAlreadyOpen'
import RoomAuthGate from '../components/room/RoomAuthGate'
import { useRoomContext } from '../context/RoomContext'
import { useSocketContext } from '../context/SocketContext'
import { EVENTS, emitJoinRoom, emitSyncRequest } from '../services/socketService'
import { getRoom } from '../services/api'
import { getGuestDeviceId } from '../utils/clientIdentity'
import { getTabId } from '../utils/tabIdentity'
import { getRoomSession, setRoomSession, clearRoomSession } from '../utils/roomSession'
import { useRoomTabSync } from '../hooks/useRoomTabSync'

/**
 * RoomPage — main watch party room layout.
 *
 * Duplicate Tab Takeover & Single-Active-Tab Architecture:
 * - Each browser tab possesses a unique tabId (sessionStorage).
 * - Only ONE tab per participant identity may be active in a room at any time.
 * - Opening the same room in another tab enters the 'active_elsewhere' state (Google Meet-like "Switch here" gate).
 * - Clicking "Switch here" triggers an authoritative server takeover preserving participantId, role, and host status.
 * - Sockets from the previous active tab receive ROOM_TAKEN_OVER and navigate Home without clearing shared roomSession.
 * - Kicks and bans are strictly room-scoped (RoomBlock model); kicked users are evicted and redirected Home.
 */
export default function RoomPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { getToken, isSignedIn, isLoaded } = useAuth()
  const { user } = useUser()
  const { openSignIn } = useClerk()
  const hasJoinedToastRef = useRef(false)
  const joinedSuccessfullyInThisTabRef = useRef(false)
  const executeJoinRef = useRef(null)

  // Explicit join gate status:
  // 'checking' | 'joining' | 'active_elsewhere' | 'switching' | 'joined' | 'error'
  const [joinStatus, setJoinStatus] = useState('checking')

  const {
    room, currentUser, setRoom, setCurrentUser, setPrimaryConnection,
    applyParticipantsSync, setVideoState, addParticipant,
    removeParticipant, updateParticipantRole,
    setChatMessages, addChatMessage, resetRoom, videoState, participants,
    setQueue,
  } = useRoomContext()

  const { socket } = useSocketContext()

  // Cross-tab local coordination using BroadcastChannel (optimization layer; socket remains authoritative)
  const { broadcastEvent } = useRoomTabSync({
    roomId,
    onKicked: () => {
      clearRoomSession(roomId)
      toast.error('You were removed from this room.')
      resetRoom()
      navigate('/')
    },
    onTakenOver: () => {
      toast('Room switched to another tab.', { icon: '🔄' })
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

  // Check currentUser: if empty and signed in, try recovering from local room session
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return

    if (!currentUser && roomId) {
      const storedSession = getRoomSession(roomId)
      if (storedSession && storedSession.username) {
        // Recover nickname and initialize currentUser so tab can attempt join
        setCurrentUser({
          username: storedSession.username,
          role: 'participant',
          clerkUserId: user?.id,
        })
      }
    }
  }, [currentUser, roomId, isLoaded, isSignedIn, user?.id, setCurrentUser])

  const handleConfirmDisplayName = (confirmedName) => {
    setRoomSession(roomId, { username: confirmedName })
    setCurrentUser({
      username: confirmedName,
      role: 'participant',
      clerkUserId: user?.id,
    })
    setJoinStatus('joining')
  }

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
      membershipVersion,
      videoState: vs,
      room: r,
      queue,
      chatMessages: cms,
      currentUserRole,
      currentUserParticipantId,
      isPrimaryConnection,
    }) => {
      if (parts) {
        applyParticipantsSync({
          participants: parts,
          hostParticipantId: r?.hostParticipantId,
          membershipVersion: membershipVersion || 0,
        })
      }
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

    const handleParticipantsSync = ({ participants: parts, hostParticipantId, membershipVersion }) => {
      applyParticipantsSync({ participants: parts, hostParticipantId, membershipVersion })
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

    const handleRoomTakenOver = () => {
      // Switched to another tab: reset local React room state and navigate Home.
      // Crucial: DO NOT call clearRoomSession(roomId) here because the active tab still needs it!
      toast('Room switched to another tab.', { icon: '🔄' })
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
    socket.on(EVENTS.PARTICIPANTS_SYNC, handleParticipantsSync)
    socket.on(EVENTS.ROLE_UPDATED, handleRoleUpdated)
    socket.on(EVENTS.PRIMARY_CONNECTION_CHANGED, handlePrimaryChanged)
    socket.on(EVENTS.KICKED, handleKicked)
    socket.on(EVENTS.ROOM_TAKEN_OVER, handleRoomTakenOver)
    socket.on(EVENTS.QUEUE_SYNC, handleQueueSync)
    socket.on(EVENTS.PLAY, handlePlay)
    socket.on(EVENTS.PAUSE, handlePause)
    socket.on(EVENTS.SEEK, handleSeek)
    socket.on(EVENTS.CHANGE_VIDEO, handleChangeVideo)
    socket.on(EVENTS.CHAT_MESSAGE, handleChatMessage)
    socket.on(EVENTS.ERROR, handleError)

    // Execute authoritative join with fresh credentials, tab identity, and device identity
    const executeJoin = async (takeover = false) => {
      try {
        const clerkToken = await getToken()
        if (!clerkToken) {
          toast.error('Google authentication required to join this room.')
          setJoinStatus('auth_required')
          return
        }
        const guestDeviceId = getGuestDeviceId()
        const tabId = getTabId()

        emitJoinRoom(socket, {
          roomId,
          username: currentUser.username,
          guestDeviceId,
          clerkToken,
          tabId,
          takeover,
        }, (res) => {
          if (!res) return

          if (res.success) {
            joinedSuccessfullyInThisTabRef.current = true
            setJoinStatus('joined')

            if (res.takeover) {
              broadcastEvent('ROOM_TAKEN_OVER')
            }

            setRoomSession(roomId, { username: res.username })
            setCurrentUser({
              ...currentUser,
              participantId:       res.participantId,
              username:            res.username,
              role:                res.role,
              socketId:            socket.id,
              isPrimaryConnection: res.isPrimaryConnection,
              clerkUserId:         user?.id,
            })

            if (!hasJoinedToastRef.current) {
              hasJoinedToastRef.current = true
              toast.success(`Joined "${room?.roomName || 'Party'}"!`)
            }
          } else {
            if (res.code === 'AUTHENTICATION_REQUIRED') {
              toast.error(res.message || 'Google authentication required to join this room.')
              setJoinStatus('auth_required')
              openSignIn()
            } else if (res.code === 'ROOM_ACTIVE_ELSEWHERE') {
              if (joinedSuccessfullyInThisTabRef.current) {
                // This tab was previously joined, but room was switched elsewhere (e.g. reconnected after takeover)
                toast('Room switched to another tab.', { icon: '🔄' })
                resetRoom()
                navigate('/')
              } else {
                // New duplicate tab opened while another tab is active
                setJoinStatus('active_elsewhere')
              }
            } else if (res.code === 'BANNED_FROM_ROOM') {
              broadcastEvent('ROOM_KICKED')
              clearRoomSession(roomId)
              toast.error(res.message || 'You were removed from this room and cannot rejoin.')
              resetRoom()
              navigate('/')
            } else {
              setJoinStatus('error')
              toast.error(res.message || 'Failed to join room.')
            }
          }
        })
      } catch (err) {
        console.error('Join error:', err)
        setJoinStatus('error')
      }
    }

    executeJoinRef.current = executeJoin

    if (socket.connected) {
      if (!joinedSuccessfullyInThisTabRef.current) {
        setJoinStatus('joining')
      }
      executeJoin(false)
    }

    const onConnect = () => {
      executeJoin(false)
    }

    socket.on('connect', onConnect)

    return () => {
      socket.off(EVENTS.USER_JOINED, handleUserJoined)
      socket.off(EVENTS.USER_LEFT, handleUserLeft)
      socket.off(EVENTS.SYNC_STATE, handleSyncState)
      socket.off(EVENTS.PARTICIPANTS_SYNC, handleParticipantsSync)
      socket.off(EVENTS.ROLE_UPDATED, handleRoleUpdated)
      socket.off(EVENTS.PRIMARY_CONNECTION_CHANGED, handlePrimaryChanged)
      socket.off(EVENTS.KICKED, handleKicked)
      socket.off(EVENTS.ROOM_TAKEN_OVER, handleRoomTakenOver)
      socket.off(EVENTS.QUEUE_SYNC, handleQueueSync)
      socket.off(EVENTS.PLAY, handlePlay)
      socket.off(EVENTS.PAUSE, handlePause)
      socket.off(EVENTS.SEEK, handleSeek)
      socket.off(EVENTS.CHANGE_VIDEO, handleChangeVideo)
      socket.off(EVENTS.CHAT_MESSAGE, handleChatMessage)
      socket.off(EVENTS.ERROR, handleError)
      socket.off('connect', onConnect)
    }
  }, [socket, roomId, currentUser?.username, isSignedIn, getToken]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resync room state when tab returns to focus (only if successfully joined)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && socket && roomId && joinStatus === 'joined') {
        emitSyncRequest(socket, { roomId })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [socket, roomId, joinStatus])

  // Handle "Switch here" action from RoomAlreadyOpen screen
  const handleSwitchHere = () => {
    if (!socket || !roomId || !currentUser?.username) return
    setJoinStatus('switching')
    if (executeJoinRef.current) {
      executeJoinRef.current(true)
    }
  }

  // 0. Clerk Loading Gate
  if (!isLoaded) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#131315] text-[#e5e1e4] p-4 relative overflow-hidden">
        <div className="absolute inset-0 z-0 flex items-center justify-center opacity-20 pointer-events-none">
          <div className="w-[400px] h-[400px] bg-[#ffb3ad]/10 rounded-full blur-[140px]" />
        </div>
        <div className="relative z-10 flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-[#ffb3ad] border-t-transparent rounded-full animate-spin" />
          <p className="font-[Geist,sans-serif] text-[15px] font-medium text-[#e4beba]">
            Authenticating...
          </p>
        </div>
      </div>
    )
  }

  // 1. Unauthenticated Gate: require Google sign-in
  if (!isSignedIn || joinStatus === 'auth_required') {
    return (
      <RoomAuthGate
        roomId={roomId}
        roomName={room?.roomName}
        isSignedIn={false}
        onSignIn={() => openSignIn()}
        onHome={() => navigate('/')}
      />
    )
  }

  // 2. Authenticated but no username set yet: confirm/customize display name
  if (!currentUser?.username) {
    return (
      <RoomAuthGate
        roomId={roomId}
        roomName={room?.roomName}
        isSignedIn={true}
        user={user}
        onConfirmDisplayName={handleConfirmDisplayName}
        onHome={() => navigate('/')}
        isSubmitting={joinStatus === 'joining'}
      />
    )
  }

  // 3. Room already open elsewhere -> Show dedicated Switch Here screen
  if (joinStatus === 'active_elsewhere' || joinStatus === 'switching') {
    return (
      <RoomAlreadyOpen
        roomId={roomId}
        roomName={room?.roomName}
        isSwitching={joinStatus === 'switching'}
        onSwitch={handleSwitchHere}
        onHome={() => navigate('/')}
      />
    )
  }

  // 4. Checking / joining loading gate (prevents mounting player/chat before join confirmation)
  if (joinStatus === 'checking' || joinStatus === 'joining') {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#131315] text-[#e5e1e4] p-4 relative overflow-hidden">
        <div className="absolute inset-0 z-0 flex items-center justify-center opacity-20 pointer-events-none">
          <div className="w-[400px] h-[400px] bg-[#ffb3ad]/10 rounded-full blur-[140px]" />
        </div>
        <div className="relative z-10 flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-[#ffb3ad] border-t-transparent rounded-full animate-spin" />
          <p className="font-[Geist,sans-serif] text-[15px] font-medium text-[#e4beba]">
            Connecting to watch party...
          </p>
        </div>
      </div>
    )
  }

  // 3. Error state
  if (joinStatus === 'error') {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#131315] text-[#e5e1e4] p-4">
        <div className="max-w-md w-full bg-[#1d1d20] border border-[#5b403e]/30 rounded-2xl p-6 text-center shadow-xl">
          <h3 className="text-lg font-semibold text-[#ff5451] mb-2">Failed to join room</h3>
          <p className="text-sm text-[#c9c5c8] mb-6">Could not connect to the watch party. Please try again or return home.</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                setJoinStatus('joining')
                executeJoinRef.current?.(false)
              }}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#ff5451] to-[#ffb3ad] text-[#131315] font-semibold text-sm cursor-pointer"
            >
              Retry
            </button>
            <button
              onClick={() => navigate('/')}
              className="px-5 py-2.5 rounded-xl bg-[#131315] border border-[#5b403e]/40 text-[#e5e1e4] text-sm cursor-pointer hover:bg-[#1d1d20]"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 4. Joined successfully -> Render full watch room
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

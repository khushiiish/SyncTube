import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuth, useUser } from '@clerk/react'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import HeroSection from '../components/landing/HeroSection'
import FeaturesGrid from '../components/landing/FeaturesGrid'
import CreateRoomModal from '../components/modals/CreateRoomModal'
import JoinRoomModal from '../components/modals/JoinRoomModal'
import { createRoom, joinRoom } from '../services/api'
import { setRoomSession } from '../utils/roomSession'
import { useRoomContext } from '../context/RoomContext'
import { useSocketContext } from '../context/SocketContext'
import useCreateRoomGate from '../hooks/useCreateRoomGate'

/**
 * LandingPage — orchestrates modals and room creation/joining flow.
 */
export default function LandingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setRoom, setCurrentUser } = useRoomContext()
  const { socket } = useSocketContext()
  const { getToken } = useAuth()
  const { user } = useUser()

  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [prefillCode, setPrefillCode] = useState('')
  const [isLoadingCreate, setIsLoadingCreate] = useState(false)
  const [isLoadingJoin, setIsLoadingJoin] = useState(false)

  // Auth gate for room creation
  const { handleCreateRoom: triggerCreateRoom } = useCreateRoomGate(() => setShowCreate(true))

  const openJoin = (code = '') => {
    setPrefillCode(code)
    setShowJoin(true)
  }

  useEffect(() => {
    if (location.state?.joinRoomId) {
      openJoin(location.state.joinRoomId)
      window.history.replaceState({}, document.title)
    }
  }, [location])

  const handleCreateRoom = async ({ username, roomName }) => {
    setIsLoadingCreate(true)
    try {
      const token = await getToken()
      if (!token) {
        toast.error('Please sign in again to create a room.')
        return
      }

      const data = await createRoom({ username, roomName }, token)
      const { room } = data

      // Store in context with authenticated clerkUserId and persist session
      setRoom(room)
      setRoomSession(room.roomId, { username })
      setCurrentUser({
        username,
        role: 'host',
        socketId: socket?.id,
        clerkUserId: user?.id,
      })

      toast.success(`Room "${room.roomName}" created!`)
      navigate(`/room/${room.roomId}`)
    } catch (err) {
      const errMsg = err.message || 'Failed to create room'
      if (errMsg.toLowerCase().includes('authentication') || errMsg.includes('401')) {
        toast.error('Please sign in again to create a room.')
      } else {
        toast.error(errMsg)
      }
    } finally {
      setIsLoadingCreate(false)
      setShowCreate(false)
    }
  }

  const handleJoinRoom = async ({ username, roomId }) => {
    setIsLoadingJoin(true)
    try {
      const data = await joinRoom({ username, roomId })
      const { room } = data

      setRoom(room)
      setRoomSession(room.roomId, { username })
      setCurrentUser({ username, role: 'participant', socketId: socket?.id })

      navigate(`/room/${room.roomId}`)
    } catch (err) {
      toast.error(err.message || 'Room not found. Check the code and try again.')
    } finally {
      setIsLoadingJoin(false)
      setShowJoin(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#131315] text-[#e5e1e4]">
      <Navbar
        onCreateRoom={triggerCreateRoom}
        onJoinRoom={() => openJoin()}
      />

      <main className="flex-grow pt-[72px]">
        <HeroSection
          onCreateRoom={triggerCreateRoom}
          onJoinRoom={openJoin}
        />
        <FeaturesGrid />
      </main>

      <Footer />

      {/* Modals */}
      <CreateRoomModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreateRoom}
        isLoading={isLoadingCreate}
      />
      <JoinRoomModal
        isOpen={showJoin}
        onClose={() => setShowJoin(false)}
        onSubmit={handleJoinRoom}
        isLoading={isLoadingJoin}
        prefillCode={prefillCode}
      />
    </div>
  )
}

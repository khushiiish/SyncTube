import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import HeroSection from '../components/landing/HeroSection'
import FeaturesGrid from '../components/landing/FeaturesGrid'
import CreateRoomModal from '../components/modals/CreateRoomModal'
import JoinRoomModal from '../components/modals/JoinRoomModal'
import { createRoom, joinRoom } from '../services/api'
import { useRoomContext } from '../context/RoomContext'
import { useSocketContext } from '../context/SocketContext'
import { emitJoinRoom } from '../services/socketService'

/**
 * LandingPage — orchestrates modals and room creation/joining flow.
 */
export default function LandingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setRoom, setCurrentUser } = useRoomContext()
  const { socket } = useSocketContext()

  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [prefillCode, setPrefillCode] = useState('')
  const [isLoadingCreate, setIsLoadingCreate] = useState(false)
  const [isLoadingJoin, setIsLoadingJoin] = useState(false)

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
      const data = await createRoom({ username, roomName })
      const { room } = data

      // Store in context
      setRoom(room)
      setCurrentUser({ username, role: 'host', socketId: socket?.id })

      toast.success(`Room "${room.roomName}" created!`)
      navigate(`/room/${room.roomId}`)
    } catch (err) {
      toast.error(err.message || 'Failed to create room')
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
      setCurrentUser({ username, role: 'participant', socketId: socket?.id })

      toast.success(`Joined "${room.roomName}"!`)
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
        onCreateRoom={() => setShowCreate(true)}
        onJoinRoom={() => openJoin()}
      />

      <main className="flex-grow pt-[72px]">
        <HeroSection
          onCreateRoom={() => setShowCreate(true)}
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

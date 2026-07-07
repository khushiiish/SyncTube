import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, SlidersHorizontal, RefreshCw, Film, Tv, Play, Plus, ArrowLeft } from 'lucide-react'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import RoomCard from '../components/rooms/RoomCard'
import CreateRoomModal from '../components/modals/CreateRoomModal'
import JoinRoomModal from '../components/modals/JoinRoomModal'
import { getRooms, createRoom, joinRoom } from '../services/api'
import { useRoomContext } from '../context/RoomContext'
import { useSocketContext } from '../context/SocketContext'
import { toast } from 'react-hot-toast'

export default function RoomsPage() {
  const navigate = useNavigate()
  const { setRoom, setCurrentUser } = useRoomContext()
  const { socket } = useSocketContext()

  // Room list states
  const [rooms, setRooms] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [sortBy, setSortBy] = useState('newest')

  // Navbar modals
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [prefillCode, setPrefillCode] = useState('')
  const [isLoadingCreate, setIsLoadingCreate] = useState(false)
  const [isLoadingJoin, setIsLoadingJoin] = useState(false)

  // Fetch rooms list
  const fetchRooms = async (silent = false) => {
    if (!silent) setIsLoading(true)
    try {
      const data = await getRooms()
      setRooms(data.rooms || [])
    } catch (err) {
      toast.error('Failed to load active rooms')
    } finally {
      if (!silent) setIsLoading(false)
    }
  }

  // Initial load
  useEffect(() => {
    fetchRooms()
  }, [])

  // Listen for socket events to keep list in sync
  useEffect(() => {
    if (!socket) return

    const handleRoomsUpdated = () => {
      // Re-fetch room list silently
      fetchRooms(true)
    }

    socket.on('rooms_updated', handleRoomsUpdated)
    return () => {
      socket.off('rooms_updated', handleRoomsUpdated)
    }
  }, [socket])

  // Join handler from card
  const handleJoinFromCard = (roomId) => {
    setPrefillCode(roomId)
    setShowJoin(true)
  }

  // Navbar Create Party handler
  const handleCreateRoom = async ({ username, roomName }) => {
    setIsLoadingCreate(true)
    try {
      const data = await createRoom({ username, roomName })
      const { room } = data

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

  // Navbar Join Room handler
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
      toast.error(err.message || 'Room not found. Check the code.')
    } finally {
      setIsLoadingJoin(false)
      setShowJoin(false)
    }
  }

  // Filter & Sort rooms
  const filteredRooms = rooms
    .filter(room => {
      // Search term
      const matchesSearch =
        room.roomName.toLowerCase().includes(search.toLowerCase()) ||
        room.roomId.toLowerCase().includes(search.toLowerCase())
      
      // Status filter
      if (statusFilter === 'All') return matchesSearch
      return matchesSearch && room.status === statusFilter
    })
    .sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.createdAt) - new Date(a.createdAt)
      if (sortBy === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt)
      if (sortBy === 'popular') return b.participantCount - a.participantCount
      return 0
    })

  return (
    <div className="min-h-screen flex flex-col bg-[#131315] text-[#e5e1e4]">
      {/* Top Navbar */}
      <Navbar
        onCreateRoom={() => setShowCreate(true)}
        onJoinRoom={() => {
          setPrefillCode('')
          setShowJoin(true)
        }}
      />

      <main className="flex-grow pt-[100px] px-6 max-w-7xl mx-auto w-full pb-16">
        {/* Header section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-[13px] text-[#e4beba]/60 hover:text-[#ffb3ad] transition-colors mb-2 group font-[Inter,sans-serif]"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              Back to Home
            </button>
            <h1 className="font-[Geist,sans-serif] font-bold text-[28px] tracking-tight text-[#e5e1e4]">
              Active Rooms
            </h1>
            <p className="font-[Inter,sans-serif] text-[14px] text-[#e4beba]/60 mt-1">
              Browse and join live watch parties or launch your own.
            </p>
          </div>

          <button
            onClick={() => fetchRooms()}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 border border-[#5b403e]/20 hover:border-[#ff5451]/30 rounded-lg bg-[#1b1a20]/20 hover:bg-[#ff5451]/5 text-[#e4beba] hover:text-[#ffb3ad] font-[Geist,sans-serif] font-bold text-[13px] transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Search, Filter & Sort Controls */}
        <div className="bg-[#1b1a20]/20 backdrop-blur-md border border-[#5b403e]/10 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between mb-8 shadow-sm">
          {/* Search bar */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#e4beba]/40" />
            <input
              type="text"
              placeholder="Search by name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#0d0d0f]/60 border border-[#5b403e]/30 rounded-lg py-2 pl-10 pr-4 font-[Inter,sans-serif] text-[13px] text-[#e5e1e4] focus:outline-none focus:border-[#ff5451]/50 placeholder:text-[#e4beba]/30 transition-colors"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {['All', 'Playing', 'Waiting'].map(filter => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-4 py-1.5 rounded-lg text-[13px] font-semibold font-[Geist,sans-serif] transition-all ${
                  statusFilter === filter
                    ? 'bg-[#ff5451] text-white shadow-md shadow-[#ff5451]/10'
                    : 'bg-[#0d0d0f]/40 text-[#e4beba]/75 hover:bg-[#1b1a20]/40 border border-[#5b403e]/10'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {/* Sorting */}
          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <SlidersHorizontal className="w-4 h-4 text-[#e4beba]/40" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-[#0d0d0f]/60 border border-[#5b403e]/30 text-[#e4beba]/80 hover:text-[#ffb3ad] font-[Geist,sans-serif] font-bold text-[13px] rounded-lg py-2 px-3 focus:outline-none focus:border-[#ff5451]/50 cursor-pointer"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="popular">Most Popular</option>
            </select>
          </div>
        </div>

        {/* Dashboard Grid Content */}
        {isLoading ? (
          /* Loading skeleton */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-[#1b1a20]/20 border border-[#5b403e]/10 rounded-xl p-5 h-[230px] animate-pulse flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <div className="w-1/2 h-5 bg-[#5b403e]/20 rounded" />
                    <div className="w-16 h-5 bg-[#5b403e]/20 rounded-full" />
                  </div>
                  <div className="space-y-2 mt-4">
                    <div className="w-3/4 h-3 bg-[#5b403e]/15 rounded" />
                    <div className="w-2/3 h-3 bg-[#5b403e]/15 rounded" />
                    <div className="w-5/6 h-3 bg-[#5b403e]/15 rounded" />
                  </div>
                </div>
                <div className="border-t border-[#5b403e]/10 pt-3 flex justify-between items-center">
                  <div className="w-20 h-3 bg-[#5b403e]/10 rounded" />
                  <div className="w-24 h-8 bg-[#5b403e]/20 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredRooms.length > 0 ? (
          /* Card list */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRooms.map(room => (
              <RoomCard
                key={room.roomId}
                room={room}
                onJoin={handleJoinFromCard}
                onDeleteSuccess={() => fetchRooms(true)}
              />
            ))}
          </div>
        ) : (
          /* Beautiful Empty State */
          <div className="bg-[#1b1a20]/10 border border-[#5b403e]/10 rounded-2xl p-12 text-center max-w-xl mx-auto mt-12 shadow-sm flex flex-col items-center">
            {/* SVG empty theater illustration */}
            <div className="w-48 h-48 mb-6 relative flex items-center justify-center">
              {/* Outer screen shape */}
              <svg className="w-full h-full text-[#5b403e]/20" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="20" y="40" width="160" height="100" rx="10" fill="currentColor" opacity="0.5" />
                <rect x="25" y="45" width="150" height="90" rx="6" fill="#131315" />
                <path d="M100 140V165M80 165H120" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
                
                {/* Floating film rolls */}
                <circle cx="50" cy="90" r="15" stroke="#ff5451" strokeWidth="2" strokeDasharray="4 4" opacity="0.3" className="animate-spin" style={{ animationDuration: '10s' }} />
                <circle cx="150" cy="90" r="15" stroke="#ffb3ad" strokeWidth="2" strokeDasharray="4 4" opacity="0.3" className="animate-spin" style={{ animationDuration: '15s' }} />
              </svg>
              {/* Play logo overlay */}
              <div className="absolute bg-[#ff5451]/10 border border-[#ff5451]/30 p-4 rounded-full shadow-lg shadow-[#ff5451]/10">
                <Tv className="w-8 h-8 text-[#ff5451]" />
              </div>
            </div>

            <h3 className="font-[Geist,sans-serif] font-bold text-xl text-[#e5e1e4] mb-2">
              No Active Watch Parties
            </h3>
            <p className="font-[Inter,sans-serif] text-[14px] text-[#e4beba]/60 leading-relaxed mb-6 max-w-sm">
              All theater screens are currently dark. Be the first to start a party, queue up videos, and invite friends!
            </p>

            <button
              onClick={() => setShowCreate(true)}
              className="px-5 py-2.5 bg-[#ff5451] hover:bg-[#ffb3ad] text-white hover:text-[#68000a] font-[Geist,sans-serif] font-bold text-[14px] rounded-lg transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(255,84,81,0.25)] hover:shadow-[0_0_20px_rgba(255,84,81,0.4)]"
            >
              <Plus className="w-4 h-4" />
              Create Room
            </button>
          </div>
        )}
      </main>

      <Footer />

      {/* Navbar modals */}
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
        prefillCode={prefillCode}
        isLoading={isLoadingJoin}
      />
    </div>
  )
}

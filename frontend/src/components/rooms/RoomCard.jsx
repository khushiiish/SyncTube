import { useState } from 'react'
import { Users, Tv, Trash2, Copy, Check, ExternalLink, Calendar, Shield } from 'lucide-react'
import { useSocketContext } from '../../context/SocketContext'
import { deleteRoom } from '../../services/api'
import { toast } from 'react-hot-toast'

export default function RoomCard({ room, onJoin, onDeleteSuccess }) {
  const { socket } = useSocketContext()
  const [copied, setCopied] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const isHost = socket?.id && socket.id === room.hostSocketId
  const inviteUrl = `${window.location.origin}/room/${room.roomId}`

  const handleCopyLink = (e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    toast.success('Copied invite link!')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDelete = async (e) => {
    e.stopPropagation()
    if (!window.confirm(`Are you sure you want to delete room "${room.roomName}"?`)) return

    setIsDeleting(true)
    try {
      await deleteRoom(room.roomId, socket.id)
      toast.success('Room deleted successfully')
      if (onDeleteSuccess) onDeleteSuccess()
    } catch (err) {
      toast.error(err.message || 'Failed to delete room')
    } finally {
      setIsDeleting(false)
    }
  }

  // Format creation time
  const formatTime = (timeStr) => {
    try {
      const date = new Date(timeStr)
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch (e) {
      return 'Recently'
    }
  }

  // Status styling map
  const statusStyles = {
    Playing: 'bg-green-500/10 border-green-500/30 text-green-400',
    Waiting: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    Active: 'bg-[#ff5451]/10 border-[#ff5451]/30 text-[#ffb3ad]',
    Empty: 'bg-gray-500/10 border-gray-500/20 text-gray-400'
  }

  return (
    <div className="bg-[#1b1a20]/40 backdrop-blur-md border border-[#5b403e]/15 rounded-xl p-5 hover:border-[#ff5451]/40 transition-all duration-300 shadow-lg relative group overflow-hidden flex flex-col justify-between h-[230px]">
      {/* Dynamic light accent top corner */}
      <div className="absolute -top-10 -right-10 w-24 h-24 bg-[#ff5451]/5 rounded-full blur-xl pointer-events-none group-hover:bg-[#ff5451]/10 transition-colors duration-300" />
      
      <div>
        {/* Header: Name and Status Badge */}
        <div className="flex justify-between items-start gap-2 mb-3">
          <div className="min-w-0">
            <h3 className="font-[Geist,sans-serif] font-bold text-[16px] text-[#e5e1e4] truncate group-hover:text-[#ffb3ad] transition-colors" title={room.roomName}>
              {room.roomName}
            </h3>
            <span className="font-[Inter,sans-serif] text-[12px] text-[#e4beba]/50 font-mono">
              #{room.roomId}
            </span>
          </div>
          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold font-[Geist,sans-serif] border ${statusStyles[room.status] || statusStyles.Active}`}>
            {room.status}
          </span>
        </div>

        {/* Info Grid */}
        <div className="space-y-2 mb-4 font-[Inter,sans-serif] text-[12px]">
          {/* Host */}
          <div className="flex items-center gap-2 text-[#e4beba]/70">
            <Shield className="w-3.5 h-3.5 text-[#ff5451]" />
            <span>Host: <strong className="text-[#e5e1e4] font-medium">{room.hostName}</strong></span>
          </div>

          {/* Members */}
          <div className="flex items-center gap-2 text-[#e4beba]/70">
            <Users className="w-3.5 h-3.5 text-[#ffb3ad]" />
            <span>Participants: <strong className="text-[#e5e1e4] font-medium">{room.participantCount}</strong></span>
          </div>

          {/* Current Video */}
          <div className="flex items-center gap-2 text-[#e4beba]/70 min-w-0">
            <Tv className="w-3.5 h-3.5 text-[#ffb3ad]" />
            <span className="truncate">
              Video: <strong className="text-[#e5e1e4] font-medium" title={room.currentVideoTitle || 'None'}>
                {room.currentVideoTitle || 'Idle'}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Footer: Date and Action Buttons */}
      <div className="flex justify-between items-center border-t border-[#5b403e]/10 pt-3 mt-auto">
        <span className="font-[Inter,sans-serif] text-[11px] text-[#e4beba]/40 flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />
          {formatTime(room.createdAt)}
        </span>

        <div className="flex items-center gap-2">
          {/* Copy link */}
          <button
            onClick={handleCopyLink}
            className="p-2 border border-[#27272A] hover:border-[#ff5451]/30 hover:bg-[#ff5451]/5 text-[#e4beba] hover:text-[#ffb3ad] rounded-lg transition-colors"
            title="Copy Invite Link"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Delete (Host only) */}
          {isHost && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="p-2 border border-transparent hover:bg-red-500/10 text-[#ff5451] rounded-lg transition-colors disabled:opacity-50"
              title="Delete Room"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Join */}
          <button
            onClick={() => onJoin(room.roomId)}
            className="px-3 py-1.5 bg-[#ff5451] hover:bg-[#ffb3ad] text-white hover:text-[#68000a] font-[Geist,sans-serif] font-bold text-[12px] rounded-lg transition-all flex items-center gap-1 shadow-[0_0_10px_rgba(255,84,81,0.15)]"
          >
            Join
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

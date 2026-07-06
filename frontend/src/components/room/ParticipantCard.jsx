import { motion, AnimatePresence } from 'framer-motion'
import { Star, UserMinus, Crown } from 'lucide-react'
import Avatar from '../ui/Avatar'
import Badge from '../ui/Badge'
import { useRoomContext } from '../../context/RoomContext'
import { useSocketContext } from '../../context/SocketContext'
import { emitAssignRole, emitRemoveParticipant, emitTransferHost } from '../../services/socketService'
import { toast } from 'react-hot-toast'

/**
 * ParticipantCard — individual row in the participants list.
 * Matches Stitch participant card design with hover action menu.
 */
export default function ParticipantCard({ participant }) {
  const { isHost, currentUser, room } = useRoomContext()
  const { socket } = useSocketContext()

  const isMe = participant.socketId === currentUser?.socketId
  const canManage = isHost && !isMe && participant.role !== 'host'

  const handleMakeModerator = () => {
    emitAssignRole(socket, {
      roomId: room.roomId,
      targetSocketId: participant.socketId,
      role: participant.role === 'moderator' ? 'participant' : 'moderator',
    })
  }

  const handleRemove = () => {
    if (!confirm(`Remove ${participant.username} from the room?`)) return
    emitRemoveParticipant(socket, {
      roomId: room.roomId,
      targetSocketId: participant.socketId,
    })
  }

  const handleTransferHost = () => {
    if (!confirm(`Transfer host to ${participant.username}?`)) return
    emitTransferHost(socket, {
      roomId: room.roomId,
      targetSocketId: participant.socketId,
    })
  }

  const statusMap = {
    online: 'online',
    buffering: 'buffering',
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className={`
        glass-panel rounded-xl p-3 flex items-center gap-3 group relative overflow-hidden
        ${participant.role === 'host' ? '' : 'hover:bg-[#353437]/30'}
        transition-colors border
        ${participant.role === 'host'
          ? 'border-[#ffb3ad]/20'
          : 'border-transparent hover:border-[#5b403e]/10'
        }
      `}
    >
      {/* Host background tint */}
      {participant.role === 'host' && (
        <div className="absolute inset-0 bg-[#ffb3ad]/5 pointer-events-none" />
      )}

      {/* Avatar */}
      <Avatar
        username={participant.username}
        size="md"
        status={statusMap[participant.status] || 'online'}
        bordered={participant.role === 'host'}
      />

      {/* Info */}
      <div className="flex-1 z-10 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-[Geist,sans-serif] font-semibold text-[14px] text-[#e5e1e4] truncate">
            {participant.username}
            {isMe && <span className="text-[#e4beba] font-normal"> (you)</span>}
          </span>
          <Badge role={participant.role} />
        </div>
        <span className={`font-[Geist,sans-serif] text-[12px] ${
          participant.status === 'buffering' ? 'text-yellow-400' : 'text-[#e4beba]'
        }`}>
          {participant.status === 'buffering' ? 'Buffering...' : 'Synced'}
        </span>
      </div>

      {/* Host action menu — appears on hover for other participants */}
      {canManage && (
        <div className="hidden group-hover:flex items-center gap-1 bg-[#2a2a2c] rounded-lg p-1 shadow-md border border-[#5b403e]/20 z-20">
          {/* Make/Remove Moderator */}
          <button
            onClick={handleMakeModerator}
            className="p-1.5 rounded hover:bg-[#353437] text-[#e4beba] hover:text-[#d0bcff] transition-colors"
            title={participant.role === 'moderator' ? 'Remove Moderator' : 'Make Moderator'}
          >
            <Star className="w-4 h-4" />
          </button>
          {/* Transfer Host */}
          <button
            onClick={handleTransferHost}
            className="p-1.5 rounded hover:bg-[#353437] text-[#e4beba] hover:text-[#ffb3ad] transition-colors"
            title="Transfer Host"
          >
            <Crown className="w-4 h-4" />
          </button>
          {/* Remove */}
          <button
            onClick={handleRemove}
            className="p-1.5 rounded hover:bg-[#353437] text-[#e4beba] hover:text-[#ffb4ab] transition-colors"
            title="Remove from room"
          >
            <UserMinus className="w-4 h-4" />
          </button>
        </div>
      )}
    </motion.div>
  )
}

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Eye, User, UserMinus, Crown, MoreVertical } from 'lucide-react'
import Avatar from '../ui/Avatar'
import Badge from '../ui/Badge'
import { useRoomContext } from '../../context/RoomContext'
import { useSocketContext } from '../../context/SocketContext'
import { emitAssignRole, emitRemoveParticipant, emitTransferHost } from '../../services/socketService'

/**
 * ParticipantCard — individual row in the participants list.
 * Identifies and operates on stable participantId.
 */
export default function ParticipantCard({ participant }) {
  const { isHost, currentUser, room } = useRoomContext()
  const { socket } = useSocketContext()
  const [showMobileActions, setShowMobileActions] = useState(false)

  const isMe = participant.participantId
    ? participant.participantId === currentUser?.participantId
    : participant.socketId === currentUser?.socketId

  const canManage = isHost && !isMe && participant.role !== 'host'

  const handleAssignRole = (newRole) => {
    if (participant.role === newRole) return
    emitAssignRole(socket, {
      roomId: room.roomId,
      targetParticipantId: participant.participantId,
      role: newRole,
    })
    setShowMobileActions(false)
  }

  const handleRemove = () => {
    if (!confirm(`Remove ${participant.username} from the room?`)) return
    emitRemoveParticipant(socket, {
      roomId: room.roomId,
      targetParticipantId: participant.participantId,
    })
    setShowMobileActions(false)
  }

  const handleTransferHost = () => {
    if (!confirm(`Transfer host to ${participant.username}?`)) return
    emitTransferHost(socket, {
      roomId: room.roomId,
      targetParticipantId: participant.participantId,
    })
    setShowMobileActions(false)
  }

  const statusMap = {
    online: 'online',
    buffering: 'buffering',
    reconnecting: 'offline',
    offline: 'offline',
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className={`
        glass-panel rounded-xl p-3 flex flex-col gap-2 group relative overflow-hidden
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

      {/* Main card row */}
      <div className="flex items-center gap-3 w-full">
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
            participant.status === 'buffering'
              ? 'text-yellow-400'
              : participant.status === 'reconnecting'
                ? 'text-orange-400'
                : 'text-[#e4beba]'
          }`}>
            {participant.status === 'buffering'
              ? 'Buffering...'
              : participant.status === 'reconnecting'
                ? 'Reconnecting...'
                : 'Synced'}
          </span>
        </div>

        {/* Mobile action toggle button (visible on touch / mobile screens only) */}
        {canManage && (
          <button
            type="button"
            onClick={() => setShowMobileActions(!showMobileActions)}
            className="md:hidden p-2 text-[#e4beba]/70 hover:text-[#ffb3ad] hover:bg-[#2a2a2c] rounded-lg transition-colors cursor-pointer"
            aria-label="Manage participant"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        )}

        {/* Desktop Host action menu — appears on hover for other participants */}
        {canManage && (
          <div className="hidden md:group-hover:flex items-center gap-1 bg-[#2a2a2c] rounded-lg p-1 shadow-md border border-[#5b403e]/20 z-20">
            {/* Assign Moderator */}
            <button
              onClick={() => handleAssignRole('moderator')}
              className={`p-1.5 rounded transition-colors cursor-pointer ${
                participant.role === 'moderator'
                  ? 'bg-[#571bc1]/30 text-[#d0bcff]'
                  : 'hover:bg-[#353437] text-[#e4beba] hover:text-[#d0bcff]'
              }`}
              title="Set as Moderator"
            >
              <Shield className="w-4.5 h-4.5" />
            </button>

            {/* Assign Participant */}
            <button
              onClick={() => handleAssignRole('participant')}
              className={`p-1.5 rounded transition-colors cursor-pointer ${
                participant.role === 'participant'
                  ? 'bg-[#353437]/80 text-[#e4beba] border border-[#5b403e]/30'
                  : 'hover:bg-[#353437] text-[#e4beba] hover:text-[#ffb3ad]'
              }`}
              title="Set as Participant"
            >
              <User className="w-4.5 h-4.5" />
            </button>

            {/* Assign Viewer */}
            <button
              onClick={() => handleAssignRole('viewer')}
              className={`p-1.5 rounded transition-colors cursor-pointer ${
                participant.role === 'viewer'
                  ? 'bg-[#005f73]/30 text-[#94d2bd]'
                  : 'hover:bg-[#353437] text-[#e4beba] hover:text-[#94d2bd]'
              }`}
              title="Set as Viewer"
            >
              <Eye className="w-4.5 h-4.5" />
            </button>

            {/* Spacer */}
            <div className="w-[1px] h-4 bg-[#5b403e]/30 mx-1" />

            {/* Transfer Host */}
            <button
              onClick={handleTransferHost}
              className="p-1.5 rounded hover:bg-[#353437] text-[#e4beba] hover:text-[#ffb3ad] transition-colors cursor-pointer"
              title="Transfer Host"
            >
              <Crown className="w-4.5 h-4.5" />
            </button>

            {/* Remove */}
            <button
              onClick={handleRemove}
              className="p-1.5 rounded hover:bg-[#353437] text-[#e4beba] hover:text-[#ffb4ab] transition-colors cursor-pointer"
              title="Remove from room"
            >
              <UserMinus className="w-4.5 h-4.5" />
            </button>
          </div>
        )}
      </div>

      {/* Expanded Mobile Action Row */}
      <AnimatePresence>
        {canManage && showMobileActions && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden flex items-center justify-between gap-1 pt-2 border-t border-[#5b403e]/20"
          >
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleAssignRole('moderator')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors ${
                  participant.role === 'moderator'
                    ? 'bg-[#571bc1]/40 text-[#d0bcff] border border-[#571bc1]'
                    : 'bg-[#2a2a2c] text-[#e4beba]'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Mod</span>
              </button>

              <button
                type="button"
                onClick={() => handleAssignRole('participant')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors ${
                  participant.role === 'participant'
                    ? 'bg-[#353437] text-[#ffb3ad] border border-[#ffb3ad]/40'
                    : 'bg-[#2a2a2c] text-[#e4beba]'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Member</span>
              </button>

              <button
                type="button"
                onClick={() => handleAssignRole('viewer')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors ${
                  participant.role === 'viewer'
                    ? 'bg-[#005f73]/40 text-[#94d2bd] border border-[#005f73]'
                    : 'bg-[#2a2a2c] text-[#e4beba]'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Viewer</span>
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleTransferHost}
                className="p-1.5 bg-[#2a2a2c] hover:bg-[#ffb3ad]/20 text-[#e4beba] hover:text-[#ffb3ad] rounded-lg transition-colors"
                title="Transfer Host"
              >
                <Crown className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleRemove}
                className="p-1.5 bg-[#2a2a2c] hover:bg-[#ff5451]/20 text-[#e4beba] hover:text-[#ff5451] rounded-lg transition-colors"
                title="Remove from room"
              >
                <UserMinus className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

import { useState } from 'react'
import { Users, MessageSquare, ListVideo, Copy, Check, LogOut, HelpCircle, UserPlus } from 'lucide-react'
import ParticipantList from './ParticipantList'
import Chat from './Chat'
import Avatar from '../ui/Avatar'
import { useRoomContext } from '../../context/RoomContext'
import { useSocketContext } from '../../context/SocketContext'
import { emitLeaveRoom } from '../../services/socketService'
import useCopyToClipboard from '../../hooks/useCopyToClipboard'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'

const TABS = [
  { id: 'participants', label: 'Participants', icon: Users },
  { id: 'chat',         label: 'Chat',         icon: MessageSquare },
  { id: 'queue',        label: 'Queue',         icon: ListVideo },
]

/**
 * Sidebar — right panel with tabs: Participants | Chat | Queue.
 * Matches Stitch watch room sidebar design exactly.
 * - Glassmorphic panel
 * - Room name + host avatar header
 * - Tabbed navigation with active indicator
 * - Footer: Invite Friends, Help, Leave
 */
export default function Sidebar() {
  const [activeTab, setActiveTab] = useState('participants')
  const { room, currentUser, participants, resetRoom } = useRoomContext()
  const { socket } = useSocketContext()
  const navigate = useNavigate()
  const { copied, copy } = useCopyToClipboard()

  const inviteUrl = room ? `${window.location.origin}/room/${room.roomId}` : ''
  const host = participants.find(p => p.role === 'host')
  const participantCount = participants.length

  const handleLeave = () => {
    if (room?.roomId && socket) {
      emitLeaveRoom(socket, { roomId: room.roomId })
    }
    resetRoom()
    navigate('/')
    toast('Left the room.', { icon: '👋' })
  }

  return (
    <aside className="hidden md:flex flex-col w-[320px] lg:w-[380px] h-full bg-[#201f22]/80 backdrop-blur-xl border-l border-[#5b403e]/20 shadow-xl z-40 relative flex-shrink-0">
      {/* Header */}
      <div className="p-6 border-b border-[#5b403e]/10 flex items-center gap-4">
        {host && <Avatar username={host.username} size="lg" bordered />}
        <div className="flex-1 min-w-0">
          <h3 className="font-[Geist,sans-serif] font-bold text-[#ffb3ad] truncate">
            {room?.roomName || 'Watch Room'}
          </h3>
          <p className="font-[Geist,sans-serif] text-[12px] text-[#e4beba] truncate">
            {host ? `Hosted by ${host.username}` : 'Loading...'} • {participantCount} watching
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#5b403e]/10 px-4 pt-2">
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-1 pb-3 pt-2 flex items-center justify-center gap-1.5 relative
                font-[Geist,sans-serif] font-medium text-[13px] transition-colors duration-200
                ${isActive
                  ? 'text-[#ffb3ad] border-b-2 border-[#ffb3ad]'
                  : 'text-[#e4beba] hover:text-[#ffb3ad]'
                }
              `}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {/* Unread indicator for chat */}
              {tab.id === 'chat' && activeTab !== 'chat' && (
                <span className="absolute top-1 right-2 w-2 h-2 bg-[#ffb3ad] rounded-full" />
              )}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'participants' && <ParticipantList />}
        {activeTab === 'chat' && <Chat />}
        {activeTab === 'queue' && (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-[#e4beba]/40 p-8">
            <ListVideo className="w-10 h-10" />
            <p className="font-[Inter,sans-serif] text-[14px] text-center">
              Queue is empty. Coming soon!
            </p>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-[#5b403e]/10 space-y-3">
        {/* Invite Friends */}
        <button
          id="invite-btn"
          onClick={() => copy(inviteUrl)}
          className="w-full py-2.5 bg-[#ffb3ad]/10 hover:bg-[#ffb3ad]/20 text-[#ffb3ad] border border-[#ffb3ad]/20 rounded-lg font-[Geist,sans-serif] font-semibold text-[13px] transition-colors flex items-center justify-center gap-2"
        >
          {copied ? <><Check className="w-4 h-4" /> Link Copied!</> : <><UserPlus className="w-4 h-4" /> Invite Friends</>}
        </button>

        {/* Help + Leave row */}
        <div className="flex justify-between items-center px-2">
          <button className="text-[#e4beba] hover:text-[#ffb3ad] transition-colors flex items-center gap-2">
            <HelpCircle className="w-4 h-4" />
            <span className="font-[Geist,sans-serif] text-[12px]">Help</span>
          </button>
          <button
            id="leave-btn"
            onClick={handleLeave}
            className="text-[#e4beba] hover:text-[#ffb4ab] transition-colors flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span className="font-[Geist,sans-serif] text-[12px]">Leave</span>
          </button>
        </div>
      </div>
    </aside>
  )
}

import { AnimatePresence, motion } from 'framer-motion'
import { X, Users, MessageSquare, ListVideo, UserPlus, Check, LogOut } from 'lucide-react'
import ParticipantList from './ParticipantList'
import Chat from './Chat'
import QueueList from './QueueList'
import Avatar from '../ui/Avatar'
import useCopyToClipboard from '../../hooks/useCopyToClipboard'
import { useRoomContext } from '../../context/RoomContext'

const TABS = [
  { id: 'participants', label: 'Participants', icon: Users },
  { id: 'chat',         label: 'Chat',         icon: MessageSquare },
  { id: 'queue',        label: 'Queue',        icon: ListVideo },
]

/**
 * MobileRoomDrawer — Slide-up bottom sheet panel for mobile viewports (< md).
 * Provides full access to Chat (text & voice), Queue, and Participants list
 * without sacrificing screen real-estate or cluttering the video player.
 */
export default function MobileRoomDrawer({
  isOpen,
  activeTab,
  onSelectTab,
  onClose,
  onLeave,
}) {
  const { room, participants, queue } = useRoomContext()
  const { copied, copy } = useCopyToClipboard()

  const inviteUrl = room ? `${window.location.origin}/room/${room.roomId}` : ''
  const host = participants.find(p => p.role === 'host')

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop overlay */}
          <motion.div
            key="mobile-drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 md:hidden"
            aria-hidden="true"
          />

          {/* Slide-up Sheet */}
          <motion.aside
            key="mobile-drawer-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 h-[88dvh] max-h-[88dvh] bg-[#1a191d] border-t border-[#5b403e]/30 rounded-t-3xl shadow-2xl flex flex-col overflow-hidden md:hidden"
            role="dialog"
            aria-modal="true"
          >
            {/* Drag Handle Bar & Header */}
            <div className="pt-3 px-4 pb-2 border-b border-[#5b403e]/15 flex-shrink-0 bg-[#1e1d21]/70">
              {/* Pill Handle */}
              <div
                onClick={onClose}
                className="w-12 h-1.5 bg-[#5b403e]/50 rounded-full mx-auto mb-2 cursor-pointer active:bg-[#ffb3ad]"
                title="Tap or drag to close"
              />

              {/* Room info row with close button */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {host && <Avatar username={host.username} size="sm" bordered />}
                  <div className="min-w-0">
                    <h3 className="font-[Geist,sans-serif] font-bold text-[14px] text-[#ffb3ad] truncate">
                      {room?.roomName || 'Watch Party'}
                    </h3>
                    <p className="font-[Geist,sans-serif] text-[11px] text-[#e4beba]/70 truncate">
                      {host ? `Host: ${host.username}` : 'Loading...'} • {participants.length} watching
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  id="mobile-drawer-close-btn"
                  onClick={onClose}
                  className="p-1.5 text-[#e4beba]/70 hover:text-[#e5e1e4] hover:bg-[#2a2a2c] rounded-full transition-colors cursor-pointer"
                  aria-label="Close drawer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tabs selector */}
              <div className="flex border-t border-[#5b403e]/15 mt-2.5 pt-1">
                {TABS.map((tab) => {
                  const Icon = tab.icon
                  const isActive = activeTab === tab.id
                  const count =
                    tab.id === 'participants' ? participants.length :
                    tab.id === 'queue' ? queue.length : null

                  return (
                    <button
                      key={tab.id}
                      id={`mobile-tab-${tab.id}`}
                      type="button"
                      onClick={() => onSelectTab(tab.id)}
                      className={`
                        flex-1 py-2 flex items-center justify-center gap-1.5 relative
                        font-[Geist,sans-serif] font-medium text-[13px] transition-colors cursor-pointer
                        ${isActive
                          ? 'text-[#ffb3ad] border-b-2 border-[#ffb3ad]'
                          : 'text-[#e4beba]/70 hover:text-[#ffb3ad]'
                        }
                      `}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{tab.label}</span>
                      {count !== null && (
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-[#ffb3ad]/20 text-[#ffb3ad]' : 'bg-[#2a2a2c] text-[#e4beba]/60'}`}>
                          {count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Tab Body Content */}
            <div className="flex-1 flex flex-col overflow-hidden bg-[#161518]">
              {activeTab === 'participants' && <ParticipantList />}
              {activeTab === 'chat' && <Chat />}
              {activeTab === 'queue' && <QueueList />}
            </div>

            {/* Drawer Footer Actions (Invite & Leave) */}
            <div className="p-3 border-t border-[#5b403e]/15 bg-[#1a191d] flex-shrink-0 space-y-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="flex gap-2">
                <button
                  id="mobile-drawer-invite-btn"
                  type="button"
                  onClick={() => copy(inviteUrl)}
                  className="flex-1 py-2 px-3 bg-[#ffb3ad]/10 hover:bg-[#ffb3ad]/20 text-[#ffb3ad] border border-[#ffb3ad]/20 rounded-xl font-[Geist,sans-serif] font-semibold text-[13px] transition-colors flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                >
                  {copied ? (
                    <><Check className="w-4 h-4 text-green-400" /> Link Copied!</>
                  ) : (
                    <><UserPlus className="w-4 h-4" /> Invite Friends</>
                  )}
                </button>

                {onLeave && (
                  <button
                    id="mobile-drawer-leave-btn"
                    type="button"
                    onClick={onLeave}
                    className="py-2 px-4 bg-[#201f22] hover:bg-[#ffb4ab]/10 text-[#e4beba] hover:text-[#ffb4ab] border border-[#5b403e]/20 rounded-xl font-[Geist,sans-serif] font-medium text-[13px] transition-colors flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Leave</span>
                  </button>
                )}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

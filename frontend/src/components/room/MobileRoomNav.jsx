import { Tv, MessageSquare, ListVideo, Users, LogOut } from 'lucide-react'

/**
 * MobileRoomNav — Fixed bottom navigation bar for mobile viewports (< md).
 * Provides fast 1-tap switching between Video, Chat, Queue, Participants, and Leave.
 * Includes unread badges and count indicators.
 */
export default function MobileRoomNav({
  activeTab,
  onSelectTab,
  unreadChat = false,
  queueCount = 0,
  participantCount = 0,
  onLeave,
}) {
  const navItems = [
    {
      id: 'player',
      label: 'Player',
      icon: Tv,
      badge: null,
    },
    {
      id: 'chat',
      label: 'Chat',
      icon: MessageSquare,
      badge: unreadChat ? '•' : null,
      badgeColor: 'bg-[#ff5451]',
    },
    {
      id: 'queue',
      label: 'Queue',
      icon: ListVideo,
      badge: queueCount > 0 ? queueCount : null,
      badgeColor: 'bg-[#5b403e]',
    },
    {
      id: 'participants',
      label: 'Members',
      icon: Users,
      badge: participantCount > 0 ? participantCount : null,
      badgeColor: 'bg-[#2a2a2c]',
    },
  ]

  return (
    <nav
      aria-label="Room mobile navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#161518]/95 backdrop-blur-xl border-t border-[#5b403e]/25 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.5)]"
    >
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id || (!activeTab && item.id === 'player')

          return (
            <button
              key={item.id}
              id={`mobile-nav-${item.id}`}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`
                flex-1 py-1 px-1.5 flex flex-col items-center justify-center relative rounded-xl transition-all duration-200 cursor-pointer min-h-[48px]
                ${isActive
                  ? 'text-[#ffb3ad] font-semibold'
                  : 'text-[#e4beba]/70 hover:text-[#e4beba] active:scale-95 font-medium'
                }
              `}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />

                {/* Badge indicator */}
                {item.badge && (
                  <span
                    className={`
                      absolute -top-1 -right-2.5 text-[10px] font-bold px-1.5 py-0.2 rounded-full leading-tight text-white flex items-center justify-center
                      ${item.badgeColor || 'bg-[#ff5451]'}
                    `}
                  >
                    {item.badge}
                  </span>
                )}
              </div>

              <span className="font-[Geist,sans-serif] text-[11px] mt-0.5 tracking-tight">
                {item.label}
              </span>

              {/* Active subtle pill dot */}
              {isActive && (
                <span className="w-1 h-1 rounded-full bg-[#ffb3ad] mt-0.5" />
              )}
            </button>
          )
        })}

        {/* Leave button */}
        {onLeave && (
          <button
            id="mobile-nav-leave"
            type="button"
            onClick={onLeave}
            className="flex-1 py-1 px-1.5 flex flex-col items-center justify-center relative rounded-xl text-[#e4beba]/60 hover:text-[#ffb4ab] active:scale-95 transition-all duration-200 cursor-pointer min-h-[48px]"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-[Geist,sans-serif] text-[11px] font-medium mt-0.5 tracking-tight">
              Leave
            </span>
          </button>
        )}
      </div>
    </nav>
  )
}

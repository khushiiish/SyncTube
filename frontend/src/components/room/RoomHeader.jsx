import { Copy, Check, Wifi, WifiOff } from 'lucide-react'
import useCopyToClipboard from '../../hooks/useCopyToClipboard'
import { useSocketContext } from '../../context/SocketContext'
import { useRoomContext } from '../../context/RoomContext'

/**
 * RoomHeader — top bar inside the watch room.
 * Shows: SyncTube brand, room name, room code chip, copy button, connection status.
 * Matches Stitch watch room header design exactly.
 */
export default function RoomHeader() {
  const { room } = useRoomContext()
  const { isConnected } = useSocketContext()
  const { copied, copy } = useCopyToClipboard()

  const roomId = room?.roomId || ''
  const inviteUrl = `${window.location.origin}/room/${roomId}`

  return (
    <header className="bg-[#131315]/80 backdrop-blur-md shadow-sm fixed top-0 w-full z-40 flex justify-between items-center px-3 sm:px-6 py-2.5 sm:py-4 border-b border-[#5b403e]/20 min-h-[56px] sm:min-h-[72px]">
      {/* Left: Brand + Room Info */}
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <h1 className="font-[Geist,sans-serif] text-[18px] sm:text-[24px] font-bold text-[#ffb3ad] tracking-[-0.01em] shrink-0">
          SyncTube
        </h1>

        <div className="h-5 sm:h-6 w-px bg-[#5b403e]/30 hidden sm:block" />

        {/* Room code chip — Desktop */}
        {room && (
          <div className="hidden md:flex items-center gap-2 glass-floating px-3 py-1 rounded-full">
            {/* Connection dot */}
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse-green' : 'bg-yellow-500'}`} />
            <span className="font-[Geist,sans-serif] font-medium text-[14px] text-[#e5e1e4] max-w-[180px] truncate">
              {room.roomName}
            </span>
            <span className="font-[Geist,sans-serif] text-[12px] text-[#e4beba] ml-1 bg-[#131315] px-2 py-0.5 rounded">
              #{roomId}
            </span>
            <button
              id="copy-invite-btn"
              onClick={() => copy(inviteUrl)}
              className="text-[#e4beba] hover:text-[#ffb3ad] transition-colors ml-1 cursor-pointer"
              title="Copy invite link"
            >
              {copied
                ? <Check className="w-4 h-4 text-green-400" />
                : <Copy className="w-4 h-4" />
              }
            </button>
          </div>
        )}

        {/* Room code chip — Mobile */}
        {room && (
          <div className="flex md:hidden items-center gap-1.5 bg-[#1b1a1f] border border-[#5b403e]/30 px-2.5 py-1 rounded-full text-[12px] min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
            <span className="font-[Geist,sans-serif] font-medium text-[#e5e1e4] max-w-[90px] sm:max-w-[140px] truncate">
              {room.roomName}
            </span>
            <span className="font-mono text-[10px] text-[#e4beba]/70 shrink-0">
              #{roomId.slice(0, 6)}
            </span>
          </div>
        )}
      </div>

      {/* Right: Actions & Connection indicator */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Mobile Quick Copy Link Button */}
        <button
          id="mobile-copy-invite-btn"
          type="button"
          onClick={() => copy(inviteUrl)}
          className="flex md:hidden items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#ffb3ad]/10 text-[#ffb3ad] border border-[#ffb3ad]/20 text-[12px] font-medium transition-colors active:scale-95 cursor-pointer"
          title="Copy invite link"
        >
          {copied ? (
            <><Check className="w-3.5 h-3.5 text-green-400" /> <span>Copied</span></>
          ) : (
            <><Copy className="w-3.5 h-3.5" /> <span>Share</span></>
          )}
        </button>

        {/* Desktop Connection status badge */}
        <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border text-[12px] font-[Geist,sans-serif] font-medium ${
          isConnected
            ? 'bg-green-500/10 border-green-500/20 text-green-400'
            : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
        }`}>
          {isConnected
            ? <><Wifi className="w-3.5 h-3.5" /> Connected</>
            : <><WifiOff className="w-3.5 h-3.5" /> Reconnecting...</>
          }
        </div>
      </div>
    </header>
  )
}

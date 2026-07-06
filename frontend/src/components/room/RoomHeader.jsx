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
    <header className="bg-[#131315]/60 backdrop-blur-md shadow-sm fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4 border-b border-[#5b403e]/20">
      {/* Left: Brand + Room Info */}
      <div className="flex items-center gap-4">
        <h1 className="font-[Geist,sans-serif] text-[24px] font-bold text-[#ffb3ad] tracking-[-0.01em]">
          SyncTube
        </h1>

        <div className="h-6 w-px bg-[#5b403e]/30 hidden md:block" />

        {/* Room code chip */}
        {room && (
          <div className="hidden md:flex items-center gap-2 glass-floating px-3 py-1 rounded-full">
            {/* Connection dot */}
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse-green' : 'bg-yellow-500'}`} />
            <span className="font-[Geist,sans-serif] font-medium text-[14px] text-[#e5e1e4]">
              {room.roomName}
            </span>
            <span className="font-[Geist,sans-serif] text-[12px] text-[#e4beba] ml-1 bg-[#131315] px-2 py-0.5 rounded">
              #{roomId}
            </span>
            <button
              id="copy-invite-btn"
              onClick={() => copy(inviteUrl)}
              className="text-[#e4beba] hover:text-[#ffb3ad] transition-colors ml-1"
              title="Copy invite link"
            >
              {copied
                ? <Check className="w-4 h-4 text-green-400" />
                : <Copy className="w-4 h-4" />
              }
            </button>
          </div>
        )}
      </div>

      {/* Right: Connection indicator */}
      <div className="flex items-center gap-3">
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

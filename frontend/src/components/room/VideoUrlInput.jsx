import { useState } from 'react'
import { Link2, Play } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useRoomContext } from '../../context/RoomContext'
import { useSocketContext } from '../../context/SocketContext'
import { emitChangeVideo } from '../../services/socketService'
import { extractVideoId } from '../../utils/youtubeUtils'

/**
 * VideoUrlInput — empty state shown when no video is loaded.
 * Matches Stitch "Empty State Canvas" design.
 * Only the host can load a video (enforced on backend too).
 */
export default function VideoUrlInput() {
  const [url, setUrl] = useState('')
  const { canControl, room } = useRoomContext()
  const { socket } = useSocketContext()

  const handleLoad = () => {
    const videoId = extractVideoId(url.trim())
    if (!videoId) {
      toast.error('Invalid YouTube URL. Please paste a valid YouTube link.')
      return
    }
    if (!room?.roomId) return

    emitChangeVideo(socket, {
      roomId: room.roomId,
      videoId,
      title: 'YouTube Video',
    })
    setUrl('')
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-8">
      {/* Decorative illustration area */}
      <div className="mb-8 relative">
        <div className="w-40 h-40 rounded-2xl border-2 border-dashed border-[#5b403e]/40 flex items-center justify-center">
          <Play className="w-16 h-16 text-[#5b403e]/50" />
        </div>
        {/* Ambient glow */}
        <div className="absolute inset-0 bg-[#ffb3ad]/5 rounded-2xl blur-xl" />
      </div>

      <h3 className="font-[Geist,sans-serif] font-semibold text-[24px] tracking-[-0.01em] text-[#e5e1e4] mb-2">
        No Video Loaded
      </h3>

      <p className="font-[Inter,sans-serif] text-[14px] text-[#e4beba] text-center max-w-sm mb-8">
        {canControl
          ? 'Paste a YouTube link below to start watching together.'
          : 'Waiting for the host or moderator to load a video...'}
      </p>

      {/* URL Input — shown to host/mods */}
      {canControl && (
        <div
          id="video-url-input-group"
          className="flex w-full max-w-lg bg-[#0e0e10] border border-[#5b403e]/50 rounded-lg overflow-hidden p-1 shadow-lg focus-within:border-[#ffb3ad]/50 transition-colors"
        >
          <div className="flex items-center pl-3 pr-2 text-[#e4beba]">
            <Link2 className="w-4 h-4" />
          </div>
          <input
            id="video-url-input"
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLoad()}
            placeholder="Paste YouTube URL here..."
            className="flex-1 bg-transparent border-none text-[#e5e1e4] font-[Inter,sans-serif] text-[14px] focus:outline-none px-2 py-2 placeholder:text-[#e4beba]/50"
          />
          <button
            id="load-video-btn"
            onClick={handleLoad}
            className="bg-[#ff5451] hover:bg-[#ffb3ad] hover:text-[#68000a] text-white rounded px-4 py-2 font-[Geist,sans-serif] font-bold text-[13px] flex items-center gap-1.5 transition-all duration-200"
          >
            <Play className="w-4 h-4" />
            Load
          </button>
        </div>
      )}

      {!canControl && (
        <div className="flex items-center gap-2 text-[#e4beba]/60">
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <span className="font-[Inter,sans-serif] text-[14px]">Waiting for host or moderator...</span>
        </div>
      )}
    </div>
  )
}

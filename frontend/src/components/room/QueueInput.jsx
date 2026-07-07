import { useState } from 'react'
import { Plus, ListVideo, Play, Sparkles } from 'lucide-react'
import { useRoomContext } from '../../context/RoomContext'
import { useSocketContext } from '../../context/SocketContext'
import { emitQueueAdd } from '../../services/socketService'
import { toast } from 'react-hot-toast'

export default function QueueInput() {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { canControl, room, queue, videoState } = useRoomContext()
  const { socket } = useSocketContext()

  const extractVideoId = (inputUrl) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/
    const match = inputUrl.match(regExp)
    return match && match[2].length === 11 ? match[2] : null
  }

  const handleAddToQueue = async () => {
    const trimmed = url.trim()
    if (!trimmed) return

    const videoId = extractVideoId(trimmed)
    if (!videoId) {
      toast.error('Invalid YouTube link. Please check the URL.')
      return
    }

    setIsLoading(true)
    try {
      // Fetch metadata from OEmbed (no API key needed, fully CORS-friendly)
      const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`)
      const data = await res.json()
      
      const title = data.title || 'YouTube Video'
      const thumbnail = data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
      const duration = 0 // Will sync playing duration from Player events

      if (!room?.roomId) return

      emitQueueAdd(socket, {
        roomId: room.roomId,
        videoId,
        title,
        thumbnail,
        duration,
      })

      toast.success('Added video to queue!')
      setUrl('')
    } catch (err) {
      console.error(err)
      toast.error('Failed to retrieve video details. Adding with default title.')
      // Fallback: add with generic details
      emitQueueAdd(socket, {
        roomId: room?.roomId,
        videoId,
        title: 'YouTube Video',
        thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        duration: 0,
      })
      setUrl('')
    } finally {
      setIsLoading(false)
    }
  }

  const nextVideo = queue && queue[0]

  return (
    <div className="w-full bg-[#1b1a20]/60 backdrop-blur-md border border-[#5b403e]/20 rounded-xl p-4 flex flex-col md:flex-row gap-4 justify-between items-center shadow-lg relative overflow-hidden group">
      {/* Decorative gradient corner */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-[#ff5451]/5 rounded-full blur-xl pointer-events-none" />

      {/* Left side: Status indicators */}
      <div className="flex flex-col gap-1 items-start w-full md:w-auto">
        <div className="flex items-center gap-2">
          {videoState.videoId ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              <span className="font-[Geist,sans-serif] font-bold text-[12px] uppercase tracking-wider text-[#ffb3ad]">
                Currently Playing
              </span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-gray-500" />
              <span className="font-[Geist,sans-serif] font-bold text-[12px] uppercase tracking-wider text-[#e4beba]/60">
                Idle
              </span>
            </>
          )}
        </div>
        <p className="font-[Inter,sans-serif] text-[14px] font-medium text-[#e5e1e4] max-w-sm truncate">
          {videoState.title || 'No video loaded'}
        </p>
        {nextVideo && (
          <p className="font-[Inter,sans-serif] text-[12px] text-[#e4beba]/60 flex items-center gap-1.5 mt-0.5">
            <Sparkles className="w-3.5 h-3.5 text-[#ff5451]" />
            Next up: <span className="text-[#e5e1e4] font-medium max-w-[200px] truncate">{nextVideo.title}</span>
          </p>
        )}
      </div>

      {/* Right side: Input fields (Host/Mods only) */}
      <div className="flex items-center gap-3 w-full md:w-auto justify-end">
        {canControl ? (
          <div className="flex items-center bg-[#0d0d0f] border border-[#5b403e]/40 rounded-lg p-1 w-full md:w-[360px] focus-within:border-[#ff5451]/50 transition-colors">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddToQueue()}
              placeholder="Paste YouTube link to queue..."
              disabled={isLoading}
              className="bg-transparent border-none text-[#e5e1e4] font-[Inter,sans-serif] text-[13px] focus:outline-none px-3 py-1.5 flex-1 placeholder:text-[#e4beba]/30 disabled:opacity-50"
            />
            <button
              onClick={handleAddToQueue}
              disabled={isLoading || !url.trim()}
              className="bg-[#ff5451] hover:bg-[#ffb3ad] hover:text-[#68000a] text-white disabled:opacity-50 disabled:hover:bg-[#ff5451] disabled:hover:text-white rounded-md p-1.5 transition-all duration-200"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-[#0d0d0f]/40 border border-[#5b403e]/10 rounded-lg px-4 py-2 text-[#e4beba]/60">
            <ListVideo className="w-4 h-4 text-[#ff5451]" />
            <span className="font-[Inter,sans-serif] text-[13px]">
              Queue Count: <strong className="text-[#e5e1e4]">{queue?.length || 0}</strong>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

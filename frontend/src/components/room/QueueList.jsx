import { Play, Trash2, ArrowUp, ArrowDown, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRoomContext } from '../../context/RoomContext'
import { useSocketContext } from '../../context/SocketContext'
import { emitQueueRemove, emitQueueClear, emitQueueReorder, emitChangeVideo } from '../../services/socketService'
import { toast } from 'react-hot-toast'

export default function QueueList() {
  const { queue, room, currentUser, canControl, isHost, isModerator } = useRoomContext()
  const { socket } = useSocketContext()

  const handlePlayNow = (item) => {
    if (!room?.roomId || !socket) return

    // Play now works by loading this video immediately and removing it from the queue
    emitChangeVideo(socket, {
      roomId: room.roomId,
      videoId: item.videoId,
      title: item.title,
    })
    
    emitQueueRemove(socket, {
      roomId: room.roomId,
      queueItemId: item._id,
    })

    toast.success(`Playing: ${item.title}`)
  }

  const handleRemove = (item) => {
    if (!room?.roomId || !socket) return

    const isOwnItem = item.addedBy === currentUser?.username
    if (!isHost && !(isModerator && isOwnItem)) {
      toast.error('Only the host, or moderator who added this video, can remove it.')
      return
    }

    emitQueueRemove(socket, {
      roomId: room.roomId,
      queueItemId: item._id,
    })
    toast.success('Removed video from queue.')
  }

  const handleClearQueue = () => {
    if (!room?.roomId || !socket || !isHost) return
    emitQueueClear(socket, { roomId: room.roomId })
    toast.success('Queue cleared.')
  }

  const handleMove = (index, direction) => {
    if (!room?.roomId || !socket || !isHost) return

    const newQueue = [...queue]
    const targetIndex = index + direction

    if (targetIndex < 0 || targetIndex >= newQueue.length) return

    // Swap items
    const temp = newQueue[index]
    newQueue[index] = newQueue[targetIndex]
    newQueue[targetIndex] = temp

    const newOrderIds = newQueue.map(item => item._id)
    emitQueueReorder(socket, {
      roomId: room.roomId,
      newOrderIds,
    })
  }

  if (!queue || queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4 p-8 text-[#e4beba]/30">
        <div className="w-16 h-16 rounded-full bg-[#ffb3ad]/5 border border-[#5b403e]/20 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-[#ffb3ad]/40" />
        </div>
        <div className="text-center space-y-1">
          <p className="font-[Geist,sans-serif] font-semibold text-[15px] text-[#e5e1e4]">
            Queue is Empty
          </p>
          <p className="font-[Inter,sans-serif] text-[12px] max-w-[200px] mx-auto text-[#e4beba]/40 leading-relaxed">
            {canControl
              ? 'Paste a YouTube link in the input above to queue videos.'
              : 'Waiting for the host or moderator to queue videos.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-thin">
        <AnimatePresence initial={false}>
          {queue.map((item, index) => {
            const isOwnItem = item.addedBy === currentUser?.username
            const canDelete = isHost || (isModerator && isOwnItem)
            
            return (
              <motion.div
                key={item._id}
                layoutId={item._id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-3 p-2 rounded-lg bg-[#1b1a20]/40 border border-[#5b403e]/10 hover:border-[#ffb3ad]/20 transition-all duration-200 group relative"
              >
                {/* Thumbnail */}
                <div className="w-20 aspect-video rounded overflow-hidden bg-black flex-shrink-0 relative">
                  <img
                    src={item.thumbnail || `https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                  {index === 0 && (
                    <span className="absolute top-1 left-1 bg-[#ff5451] text-white text-[9px] font-bold px-1 py-0.5 rounded leading-none">
                      Next
                    </span>
                  )}
                </div>

                {/* Title & Metadata */}
                <div className="flex-1 min-w-0 pr-1">
                  <h4 className="font-[Inter,sans-serif] font-medium text-[13px] text-[#e5e1e4] truncate mb-0.5" title={item.title}>
                    {item.title}
                  </h4>
                  <p className="font-[Inter,sans-serif] text-[11px] text-[#e4beba]/50 truncate">
                    Added by {item.addedBy}
                  </p>
                </div>

                {/* Action Buttons Overlay on Hover */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-[#1b1a20]/95 absolute right-2 py-1 px-1.5 rounded-md border border-[#5b403e]/20 shadow-md">
                  {/* Play Now (Host/Mod) */}
                  {canControl && (
                    <button
                      onClick={() => handlePlayNow(item)}
                      title="Play Now"
                      className="p-1 hover:text-[#ffb3ad] text-[#e4beba]/75 hover:bg-[#ffb3ad]/10 rounded transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Move Up (Host only) */}
                  {isHost && index > 0 && (
                    <button
                      onClick={() => handleMove(index, -1)}
                      title="Move Up"
                      className="p-1 hover:text-[#ffb3ad] text-[#e4beba]/75 hover:bg-[#ffb3ad]/10 rounded transition-colors"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Move Down (Host only) */}
                  {isHost && index < queue.length - 1 && (
                    <button
                      onClick={() => handleMove(index, 1)}
                      title="Move Down"
                      className="p-1 hover:text-[#ffb3ad] text-[#e4beba]/75 hover:bg-[#ffb3ad]/10 rounded transition-colors"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Remove */}
                  {canDelete && (
                    <button
                      onClick={() => handleRemove(item)}
                      title="Remove"
                      className="p-1 hover:text-[#ff5451] text-[#e4beba]/75 hover:bg-[#ff5451]/10 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* Footer (Clear Queue) */}
      {isHost && (
        <div className="p-4 border-t border-[#5b403e]/10 bg-[#161518]/60">
          <button
            onClick={handleClearQueue}
            className="w-full py-2 border border-[#ff5451]/30 hover:bg-[#ff5451]/10 text-[#ff5451] font-[Geist,sans-serif] font-bold text-[12px] rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Queue
          </button>
        </div>
      )}
    </div>
  )
}

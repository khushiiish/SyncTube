import { useState, useEffect, useRef } from 'react'
import { Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react'
import { useRoomContext } from '../../context/RoomContext'
import { useSocketContext } from '../../context/SocketContext'
import { emitPlay, emitPause, emitSeek } from '../../services/socketService'
import { formatDuration } from '../../utils/youtubeUtils'

/**
 * VideoControls — floating playback controls overlay.
 * Matches Stitch watch room controls design:
 * - Gradient overlay from bottom
 * - Progress bar with scrubber
 * - Play/Pause, Volume slider, time display
 * - Fullscreen
 *
 * Only emits socket events if canControl (host/moderator).
 */
export default function VideoControls({ playerRef, isPlayerReady, isSyncedUpdateRef }) {
  const { canControl, room, videoState, setVideoState } = useRoomContext()
  const { socket } = useSocketContext()

  const [volume, setVolume] = useState(80)
  const [isMuted, setIsMuted] = useState(false)
  const [showVolume, setShowVolume] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const rafRef = useRef(null)
  const progressRef = useRef(null)

  // Poll current time every 500ms
  useEffect(() => {
    if (!isPlayerReady) return
    const tick = () => {
      if (playerRef.current) {
        setCurrentTime(playerRef.current.getCurrentTime?.() || 0)
        setDuration(playerRef.current.getDuration?.() || 0)
      }
      rafRef.current = setTimeout(tick, 500)
    }
    tick()
    return () => clearTimeout(rafRef.current)
  }, [isPlayerReady, playerRef])

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  const handlePlayPause = () => {
    if (!canControl || !room?.roomId) return
    if (videoState.isPlaying) {
      isSyncedUpdateRef.current = true
      playerRef.current?.pauseVideo()
      setVideoState({ isPlaying: false })
      emitPause(socket, { roomId: room.roomId, currentTime })
    } else {
      isSyncedUpdateRef.current = true
      playerRef.current?.playVideo()
      setVideoState({ isPlaying: true })
      emitPlay(socket, { roomId: room.roomId, currentTime })
    }
  }

  const handleProgressClick = (e) => {
    if (!canControl || !duration || !progressRef.current) return
    const rect = progressRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const newTime = ratio * duration
    isSyncedUpdateRef.current = true
    playerRef.current?.seekTo(newTime, true)
    setCurrentTime(newTime)
    emitSeek(socket, { roomId: room.roomId, currentTime: newTime })
  }

  const handleVolumeChange = (e) => {
    const val = Number(e.target.value)
    setVolume(val)
    playerRef.current?.setVolume(val)
    setIsMuted(val === 0)
  }

  const toggleMute = () => {
    if (isMuted) {
      playerRef.current?.unMute()
      playerRef.current?.setVolume(volume || 80)
    } else {
      playerRef.current?.mute()
    }
    setIsMuted(!isMuted)
  }

  const handleFullscreen = () => {
    const container = document.getElementById('player-container')
    if (!container) return

    if (!document.fullscreenElement) {
      if (container.requestFullscreen) {
        container.requestFullscreen()
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
      }
    }
  }

  return (
    <div className="absolute bottom-0 left-0 w-full px-3 sm:px-4 pb-2.5 sm:pb-4 pt-12 sm:pt-16 bg-gradient-to-t from-black/85 via-black/45 to-transparent flex flex-col justify-end pointer-events-auto">
      {/* Progress Bar with generous touch target */}
      <div
        className="w-full py-2 -my-1.5 cursor-pointer"
        onClick={handleProgressClick}
      >
        <div
          ref={progressRef}
          id="progress-bar"
          className={`w-full h-2 sm:h-1.5 bg-[#353437]/60 rounded-full relative overflow-hidden group/bar ${canControl ? 'cursor-pointer' : 'cursor-default'}`}
        >
          {/* Fill */}
          <div
            className="absolute top-0 left-0 h-full bg-[#ffb3ad] rounded-full transition-none"
            style={{ width: `${progress}%` }}
          >
            {/* Scrubber dot */}
            {canControl && (
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-3 sm:h-3 bg-white rounded-full shadow opacity-100 md:opacity-0 md:group-hover/bar:opacity-100 transition-opacity -mr-1.5" />
            )}
          </div>
          {/* Buffer indicator */}
          <div className="absolute top-0 left-0 h-full bg-white/10 rounded-full" style={{ width: `${Math.min(progress + 15, 100)}%` }} />
        </div>
      </div>

      {/* Controls Row */}
      <div className="flex items-center justify-between gap-2 mt-1 sm:mt-2">
        {/* Left controls */}
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          {/* Play/Pause */}
          <button
            id="play-pause-btn"
            onClick={handlePlayPause}
            disabled={!canControl}
            className={`p-1 text-[#e5e1e4] transition-colors flex items-center justify-center shrink-0 ${canControl ? 'hover:text-[#ffb3ad] cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
            title={canControl ? (videoState.isPlaying ? 'Pause' : 'Play') : 'Only host/moderator can control'}
          >
            {videoState.isPlaying
              ? <Pause className="w-6 h-6 sm:w-7 sm:h-7 fill-current" />
              : <Play className="w-6 h-6 sm:w-7 sm:h-7 fill-current" />
            }
          </button>

          {/* Volume */}
          <div
            className="flex items-center gap-1.5 sm:gap-2 group/vol relative shrink-0"
            onMouseEnter={() => setShowVolume(true)}
            onMouseLeave={() => setShowVolume(false)}
          >
            <button
              onClick={toggleMute}
              className="p-1 text-[#e5e1e4] hover:text-[#ffb3ad] transition-colors cursor-pointer"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0
                ? <VolumeX className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
                : <Volume2 className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
              }
            </button>
            <div className={`hidden sm:flex overflow-hidden transition-all duration-300 ease-out items-center ${showVolume ? 'w-20' : 'w-0'}`}>
              <input
                type="range"
                min="0"
                max="100"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-full h-1 accent-[#ffb3ad] cursor-pointer"
              />
            </div>
          </div>

          {/* Time */}
          <span className="font-[Geist,sans-serif] text-[11px] sm:text-[12px] text-[#e4beba] whitespace-nowrap truncate">
            {formatDuration(currentTime)} / {formatDuration(duration)}
          </span>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <button
            onClick={handleFullscreen}
            className="p-1.5 text-[#e5e1e4] hover:text-[#ffb3ad] transition-colors cursor-pointer"
            title="Fullscreen"
          >
            <Maximize className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}

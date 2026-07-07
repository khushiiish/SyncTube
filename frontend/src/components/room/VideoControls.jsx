import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Play, Pause, Volume2, VolumeX, Maximize, SkipForward } from 'lucide-react'
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
  const [isDragging, setIsDragging] = useState(false)
  const rafRef = useRef(null)
  const progressRef = useRef(null)

  // Poll current time every 500ms
  useEffect(() => {
    if (!isPlayerReady) return
    const tick = () => {
      if (!isDragging && playerRef.current) {
        setCurrentTime(playerRef.current.getCurrentTime?.() || 0)
        setDuration(playerRef.current.getDuration?.() || 0)
      }
      rafRef.current = setTimeout(tick, 500)
    }
    tick()
    return () => clearTimeout(rafRef.current)
  }, [isPlayerReady, isDragging, playerRef])

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
    <div className="absolute bottom-0 left-0 w-full px-4 pb-4 pt-16 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col justify-end pointer-events-auto">
      {/* Progress Bar */}
      <div
        ref={progressRef}
        id="progress-bar"
        className={`w-full h-1.5 bg-[#353437]/50 rounded-full mb-4 relative overflow-hidden group/bar ${canControl ? 'cursor-pointer' : 'cursor-default'}`}
        onClick={handleProgressClick}
      >
        {/* Fill */}
        <div
          className="absolute top-0 left-0 h-full bg-[#ffb3ad] rounded-full transition-none"
          style={{ width: `${progress}%` }}
        >
          {/* Scrubber dot */}
          {canControl && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover/bar:opacity-100 transition-opacity -mr-1.5" />
          )}
        </div>
        {/* Buffer indicator */}
        <div className="absolute top-0 left-0 h-full bg-white/10 rounded-full" style={{ width: `${Math.min(progress + 15, 100)}%` }} />
      </div>

      {/* Controls Row */}
      <div className="flex items-center justify-between">
        {/* Left controls */}
        <div className="flex items-center gap-4">
          {/* Play/Pause */}
          <button
            id="play-pause-btn"
            onClick={handlePlayPause}
            disabled={!canControl}
            className={`text-[#e5e1e4] transition-colors ${canControl ? 'hover:text-[#ffb3ad] cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
            title={canControl ? (videoState.isPlaying ? 'Pause' : 'Play') : 'Only host/moderator can control'}
          >
            {videoState.isPlaying
              ? <Pause className="w-7 h-7 fill-current" />
              : <Play className="w-7 h-7 fill-current" />
            }
          </button>

          {/* Volume */}
          <div
            className="flex items-center gap-2 group/vol relative"
            onMouseEnter={() => setShowVolume(true)}
            onMouseLeave={() => setShowVolume(false)}
          >
            <button onClick={toggleMute} className="text-[#e5e1e4] hover:text-[#ffb3ad] transition-colors">
              {isMuted || volume === 0
                ? <VolumeX className="w-5 h-5" />
                : <Volume2 className="w-5 h-5" />
              }
            </button>
            <div className={`overflow-hidden transition-all duration-300 ease-out flex items-center ${showVolume ? 'w-20' : 'w-0'}`}>
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
          <span className="font-[Geist,sans-serif] text-[12px] text-[#e4beba] ml-1">
            {formatDuration(currentTime)} / {formatDuration(duration)}
          </span>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleFullscreen}
            className="text-[#e5e1e4] hover:text-[#ffb3ad] transition-colors"
            title="Fullscreen"
          >
            <Maximize className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}

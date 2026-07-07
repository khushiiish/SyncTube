import { useRef, useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import VideoControls from './VideoControls'
import VideoUrlInput from './VideoUrlInput'
import { useRoomContext } from '../../context/RoomContext'
import { useSocketContext } from '../../context/SocketContext'
import { EVENTS, emitQueueNext, emitSeek, emitPlay, emitPause } from '../../services/socketService'

/**
 * VideoPlayer — YouTube IFrame API container.
 */
export default function VideoPlayer() {
  const { canControl, videoState, room } = useRoomContext()
  const { socket } = useSocketContext()
  const playerRef = useRef(null)
  const isSyncedUpdateRef = useRef(false)
  const isReadyRef = useRef(false)
  const [showControls, setShowControls] = useState(false)
  const [isPlayerReady, setIsPlayerReady] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const clickTimeoutRef = useRef(null)
  const lastEmitTimeRef = useRef(0)

  const triggerNonControllerFeedback = () => {
    setShowTooltip(true)
    setTimeout(() => setShowTooltip(false), 2500)
  }

  const togglePlayPause = () => {
    if (!playerRef.current || !isPlayerReady) return

    const now = Date.now()
    if (now - lastEmitTimeRef.current < 500) return // Prevent socket event flooding
    lastEmitTimeRef.current = now

    if (canControl) {
      const isPlaying = videoState.isPlaying
      const currentTime = playerRef.current.getCurrentTime() || 0
      
      if (isPlaying) {
        emitPause(socket, { roomId: room?.roomId, currentTime })
      } else {
        emitPlay(socket, { roomId: room?.roomId, currentTime })
      }
    } else {
      triggerNonControllerFeedback()
    }
  }

  const handleFullscreenToggle = () => {
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

  const handlePlayerClick = () => {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
      clickTimeoutRef.current = null
      // Double click
      handleFullscreenToggle()
      return
    }

    clickTimeoutRef.current = setTimeout(() => {
      clickTimeoutRef.current = null
      // Single click
      togglePlayPause()
    }, 250)
  }

  // Periodic Host heartbeat to keep everyone in sync
  useEffect(() => {
    if (currentUser?.role !== 'host' || !playerRef.current || !isPlayerReady || !videoState.isPlaying) return

    const interval = setInterval(() => {
      const currentTime = playerRef.current.getCurrentTime?.() || 0
      emitSeek(socket, { roomId: room?.roomId, currentTime })
    }, 5000)

    return () => clearInterval(interval)
  }, [isPlayerReady, currentUser?.role, videoState.isPlaying, room?.roomId, socket])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in input/textarea
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return
      if (!playerRef.current || !isPlayerReady) return

      const key = e.key.toLowerCase()

      if (key === ' ') {
        e.preventDefault()
        togglePlayPause()
      } else if (key === 'arrowleft') {
        e.preventDefault()
        if (canControl) {
          const newTime = Math.max(0, playerRef.current.getCurrentTime() - 5)
          emitSeek(socket, { roomId: room?.roomId, currentTime: newTime })
        } else {
          triggerNonControllerFeedback()
        }
      } else if (key === 'arrowright') {
        e.preventDefault()
        if (canControl) {
          const duration = playerRef.current.getDuration() || 0
          const newTime = Math.min(duration, playerRef.current.getCurrentTime() + 5)
          emitSeek(socket, { roomId: room?.roomId, currentTime: newTime })
        } else {
          triggerNonControllerFeedback()
        }
      } else if (key === 'm') {
        e.preventDefault()
        if (playerRef.current.isMuted()) {
          playerRef.current.unMute()
          toast.success('Unmuted')
        } else {
          playerRef.current.mute()
          toast.success('Muted')
        }
      } else if (key === 'f') {
        e.preventDefault()
        handleFullscreenToggle()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPlayerReady, canControl, room, videoState])

  const videoId = videoState?.videoId

  // Initialize / reload YouTube player when videoId changes
  useEffect(() => {
    if (!videoId) return

    function initPlayer() {
      if (playerRef.current) {
        // Reload video in existing player
        isSyncedUpdateRef.current = true
        playerRef.current.loadVideoById({
          videoId,
          startSeconds: videoState.currentTime || 0,
        })
        return
      }

      playerRef.current = new window.YT.Player('yt-player', {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 0,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          playsinline: 1,
          start: Math.floor(videoState.currentTime || 0),
        },
        events: {
          onReady: (e) => {
            isReadyRef.current = true
            setIsPlayerReady(true)
            // Apply initial state
            if (videoState.isPlaying) e.target.playVideo()
            else e.target.pauseVideo()
          },
          onStateChange: (e) => {
            // If this is a synced update from socket, skip emitting
            if (isSyncedUpdateRef.current) {
              isSyncedUpdateRef.current = false
            }

            // Auto-play next video in queue when current ends
            if (window.YT && e.data === window.YT.PlayerState.ENDED) {
              if (canControl && room?.roomId) {
                emitQueueNext(socket, {
                  roomId: room.roomId,
                  currentVideoId: videoState.videoId,
                })
              }
            }
          },
        },
      })
    }

    if (window.YT && window.YT.Player) {
      initPlayer()
    } else {
      // Load the IFrame API script
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script')
        tag.src = 'https://www.youtube.com/iframe_api'
        document.head.appendChild(tag)
      }
      window.onYouTubeIframeAPIReady = initPlayer
    }
  }, [videoId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync isPlaying changes from socket
  useEffect(() => {
    if (!isReadyRef.current || !playerRef.current) return
    isSyncedUpdateRef.current = true
    if (videoState.isPlaying) {
      playerRef.current.playVideo?.()
    } else {
      playerRef.current.pauseVideo?.()
    }
  }, [videoState.isPlaying])

  // Sync seek from socket
  useEffect(() => {
    if (!isReadyRef.current || !playerRef.current || !videoState.currentTime) return
    // Only seek if we're off by more than 2 seconds to avoid jitter
    const currentPlayerTime = playerRef.current.getCurrentTime?.() || 0
    if (Math.abs(currentPlayerTime - videoState.currentTime) > 2) {
      isSyncedUpdateRef.current = true
      playerRef.current.seekTo?.(videoState.currentTime, true)
    }
  }, [videoState.currentTime])

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-6">
      {/* Player Container */}
      <div
        id="player-container"
        className="relative w-full aspect-video rounded-xl overflow-hidden border border-[#5b403e]/10 bg-black shadow-2xl group"
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => setShowControls(false)}
      >
        {/* Ambient glow behind player */}
        <div className="absolute inset-0 z-0 flex items-center justify-center opacity-20 pointer-events-none">
          <div className="w-3/4 h-3/4 bg-[#ffb3ad]/20 rounded-full blur-[120px]" />
        </div>

        {!videoId ? (
          <VideoUrlInput />
        ) : (
          <>
            {/* YouTube IFrame target */}
            <div id="yt-player" className="w-full h-full" />

            {/* Click & Double-click detector overlay */}
            <div
              className="absolute inset-0 z-10 bg-transparent cursor-pointer"
              onClick={handlePlayerClick}
            />

            {/* Glowing glassmorphic tooltip feedback for non-controllers */}
            {showTooltip && (
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30 bg-black/85 backdrop-blur-md border border-[#ff5451]/30 text-white px-5 py-2.5 rounded-xl font-[Geist,sans-serif] text-[13px] flex items-center gap-2.5 shadow-2xl animate-fade-in pointer-events-none">
                <AlertCircle className="w-4.5 h-4.5 text-[#ff5451]" />
                <span>Only the Host or Moderator can control playback.</span>
              </div>
            )}

            {/* Controls overlay */}
            <div className={`absolute inset-0 z-20 transition-opacity duration-300 ${showControls || !videoState.isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              <VideoControls
                playerRef={playerRef}
                isPlayerReady={isPlayerReady}
                isSyncedUpdateRef={isSyncedUpdateRef}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

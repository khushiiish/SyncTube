import { useRef, useEffect, useState } from 'react'
import VideoControls from './VideoControls'
import VideoUrlInput from './VideoUrlInput'
import { useRoomContext } from '../../context/RoomContext'

/**
 * VideoPlayer — YouTube IFrame API container.
 *
 * Renders:
 * - Empty state (VideoUrlInput) when no videoId
 * - YouTube player when videoId is set
 * - Floating VideoControls overlay on hover
 *
 * Architecture:
 * The YT.Player is attached to a div with id="yt-player".
 * We pass playerRef and isSyncedUpdateRef down to VideoControls.
 */
export default function VideoPlayer() {
  const { videoState } = useRoomContext()
  const playerRef = useRef(null)
  const isSyncedUpdateRef = useRef(false)
  const isReadyRef = useRef(false)
  const [showControls, setShowControls] = useState(false)
  const [isPlayerReady, setIsPlayerReady] = useState(false)

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

            {/* Controls overlay */}
            <div className={`absolute inset-0 transition-opacity duration-300 ${showControls || !videoState.isPlaying ? 'opacity-100' : 'opacity-0'}`}>
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

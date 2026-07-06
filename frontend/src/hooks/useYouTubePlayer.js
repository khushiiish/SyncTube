import { useEffect, useRef, useCallback } from 'react'
import { useRoomContext } from '../context/RoomContext'
import { useSocketContext } from '../context/SocketContext'
import { emitPlay, emitPause, emitSeek } from '../services/socketService'

/**
 * useYouTubePlayer — manages the YouTube IFrame API lifecycle.
 *
 * Anti-feedback-loop pattern:
 * When we receive a socket event (e.g., someone else pressed play),
 * we set isSyncedUpdate.current = true BEFORE calling player methods.
 * The onStateChange handler skips emitting if that flag is true.
 * This prevents: remote play → local onStateChange → emitPlay → remote play → loop.
 */
export default function useYouTubePlayer({ containerId, roomId }) {
  const playerRef = useRef(null)
  const isSyncedUpdate = useRef(false) // true when change comes from socket
  const isReady = useRef(false)

  const { canControl, videoState } = useRoomContext()
  const { socket } = useSocketContext()

  // Load the YouTube IFrame API script once
  useEffect(() => {
    if (window.YT && window.YT.Player) return // already loaded

    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  }, [])

  // Initialize player when a videoId is available
  useEffect(() => {
    if (!videoState.videoId) return

    function initPlayer() {
      if (playerRef.current) {
        // Player already exists — just load the new video
        playerRef.current.loadVideoById({
          videoId: videoState.videoId,
          startSeconds: videoState.currentTime,
        })
        if (!videoState.isPlaying) {
          playerRef.current.pauseVideo()
        }
        return
      }

      playerRef.current = new window.YT.Player(containerId, {
        videoId: videoState.videoId,
        playerVars: {
          autoplay: videoState.isPlaying ? 1 : 0,
          controls: 0,       // We render our own controls
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          start: Math.floor(videoState.currentTime),
        },
        events: {
          onReady: handleReady,
          onStateChange: handleStateChange,
        },
      })
    }

    if (window.YT && window.YT.Player) {
      initPlayer()
    } else {
      window.onYouTubeIframeAPIReady = initPlayer
    }

    return () => {
      // Do NOT destroy on every re-render — only when videoId changes
    }
  }, [videoState.videoId]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleReady() {
    isReady.current = true
    // Apply the initial playback state
    if (videoState.isPlaying) {
      playerRef.current?.playVideo()
    } else {
      playerRef.current?.pauseVideo()
    }
    playerRef.current?.seekTo(videoState.currentTime, true)
  }

  function handleStateChange(event) {
    if (!canControl) return           // participants can't emit
    if (isSyncedUpdate.current) {     // change came from socket, skip emit
      isSyncedUpdate.current = false
      return
    }
    if (!roomId) return

    const YT_PLAYING = 1
    const YT_PAUSED  = 2

    if (event.data === YT_PLAYING) {
      const t = playerRef.current?.getCurrentTime() || 0
      emitPlay(socket, { roomId, currentTime: t })
    } else if (event.data === YT_PAUSED) {
      const t = playerRef.current?.getCurrentTime() || 0
      emitPause(socket, { roomId, currentTime: t })
    }
  }

  // --- Methods exposed to components ---

  const play = useCallback((time) => {
    isSyncedUpdate.current = true
    if (isReady.current) {
      if (time !== undefined) playerRef.current?.seekTo(time, true)
      playerRef.current?.playVideo()
    }
  }, [])

  const pause = useCallback((time) => {
    isSyncedUpdate.current = true
    if (isReady.current) {
      if (time !== undefined) playerRef.current?.seekTo(time, true)
      playerRef.current?.pauseVideo()
    }
  }, [])

  const seekTo = useCallback((time) => {
    isSyncedUpdate.current = true
    if (isReady.current) {
      playerRef.current?.seekTo(time, true)
    }
  }, [])

  const getCurrentTime = useCallback(() => {
    return playerRef.current?.getCurrentTime() || 0
  }, [])

  const getDuration = useCallback(() => {
    return playerRef.current?.getDuration() || 0
  }, [])

  const handleSeek = useCallback((time) => {
    if (!canControl || !roomId) return
    seekTo(time)
    emitSeek(socket, { roomId, currentTime: time })
  }, [canControl, roomId, seekTo, socket])

  return { play, pause, seekTo, getCurrentTime, getDuration, handleSeek, playerRef, isReady }
}

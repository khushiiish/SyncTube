import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, AlertCircle } from 'lucide-react'
import { formatAudioDuration } from '../../utils/audioFormat'

/**
 * VoiceMessageBubble — In-room audio player bubble for voice chat messages.
 *
 * Features:
 * - Sleek sound-wave visualization and interactive scrubber
 * - Audio mutual exclusion (pauses any other playing audio in the room)
 * - Safe play/pause state synchronization
 * - Accurate duration timestamps
 */
export default function VoiceMessageBubble({ message, isMe }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [loadError, setLoadError] = useState(false)
  const audioRef = useRef(null)

  const audioData = message?.audio || {}
  const totalDuration = audioData.duration || 0
  const audioUrl = audioData.url
  const msgId = message?.messageId || message?.id || message?._id || 'msg_bubble'

  // Play / Pause toggle with mutual exclusion
  const togglePlayPause = useCallback(() => {
    if (!audioRef.current || !audioUrl) return

    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      // Pause any other voice messages or preview currently playing
      window.dispatchEvent(new CustomEvent('synctube:pause_audio', { detail: { id: msgId } }))
      audioRef.current.play().then(() => {
        setIsPlaying(true)
      }).catch(err => {
        console.warn('[VoiceMessageBubble] Audio play failed:', err.message)
        setLoadError(true)
        setIsPlaying(false)
      })
    }
  }, [isPlaying, audioUrl, msgId])

  // Listen for global pause audio events from other message bubbles
  useEffect(() => {
    const handlePauseOthers = (e) => {
      if (e.detail?.id !== msgId && audioRef.current) {
        audioRef.current.pause()
        setIsPlaying(false)
      }
    }
    window.addEventListener('synctube:pause_audio', handlePauseOthers)
    return () => window.removeEventListener('synctube:pause_audio', handlePauseOthers)
  }, [msgId])

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }

    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    const handleError = () => {
      console.warn('[VoiceMessageBubble] Audio loading error')
      setLoadError(true)
      setIsPlaying(false)
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
    }
  }, [audioUrl])

  // Scrubbing handler
  const handleScrub = (e) => {
    const audio = audioRef.current
    if (!audio || !totalDuration) return

    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const percent = Math.max(0, Math.min(1, clickX / rect.width))
    const newTime = percent * (audio.duration || totalDuration)

    audio.currentTime = newTime
    setCurrentTime(newTime)
  }

  // Calculate percentage for scrubber fill
  const effectiveDuration = (audioRef.current?.duration && !isNaN(audioRef.current.duration))
    ? audioRef.current.duration
    : (totalDuration || 1)
  const progressPercent = Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100))

  return (
    <div
      className={`
        px-3.5 py-2.5 rounded-2xl border transition-all flex flex-col gap-1.5 min-w-[210px] sm:min-w-[240px]
        ${isMe
          ? 'bg-[#ffb3ad]/15 border-[#ffb3ad]/25 text-[#e5e1e4] rounded-tr-sm shadow-[0_2px_12px_rgba(255,179,173,0.05)]'
          : 'bg-[#1b1a1d] border-[#27272A] text-[#e5e1e4] rounded-tl-sm shadow-[0_2px_12px_rgba(0,0,0,0.2)]'
        }
      `}
    >
      {/* Hidden audio element */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
        />
      )}

      {/* Main player controls row */}
      <div className="flex items-center gap-2.5">
        {/* Play/Pause button */}
        <button
          type="button"
          onClick={togglePlayPause}
          disabled={loadError || !audioUrl}
          aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
          className={`
            w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-transform active:scale-95
            ${loadError
              ? 'bg-[#ef4444]/20 text-[#ef4444] cursor-not-allowed'
              : isMe
                ? 'bg-[#ffb3ad] text-[#201f22] hover:bg-[#ffcdc8]'
                : 'bg-[#ffb3ad]/20 text-[#ffb3ad] hover:bg-[#ffb3ad]/30'
            }
          `}
        >
          {loadError ? (
            <AlertCircle className="w-4 h-4" />
          ) : isPlaying ? (
            <Pause className="w-3.5 h-3.5 fill-current" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
          )}
        </button>

        {/* Waveform / Scrubber bar */}
        <div
          className="flex-1 flex flex-col justify-center gap-1 cursor-pointer py-1 select-none"
          onClick={handleScrub}
          role="slider"
          aria-valuenow={currentTime}
          aria-valuemin={0}
          aria-valuemax={effectiveDuration}
          tabIndex={0}
        >
          {/* Simulated waveform bars */}
          <div className="flex items-center gap-[2px] h-4">
            {[40, 70, 90, 60, 100, 75, 45, 85, 95, 55, 65, 80, 50, 90, 70, 40, 85, 60, 75, 50].map((h, i) => {
              const barPercent = (i / 20) * 100
              const isFilled = barPercent <= progressPercent
              return (
                <div
                  key={i}
                  style={{ height: `${h}%` }}
                  className={`
                    w-1 rounded-full transition-colors
                    ${isFilled
                      ? 'bg-[#ffb3ad]'
                      : 'bg-[#3b3a3e]'
                    }
                  `}
                />
              )
            })}
          </div>

          {/* Progress bar line */}
          <div className="w-full h-1 bg-[#27272A] rounded-full overflow-hidden relative">
            <div
              className="h-full transition-[width] duration-100 bg-[#ffb3ad]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Duration and timestamps row */}
      <div className="flex items-center justify-between text-[11px] font-[Geist,sans-serif] text-[#e4beba]/60 px-0.5">
        <span>
          {loadError ? (
            <span className="text-[#ef4444]">Audio unavailable</span>
          ) : (
            isPlaying
              ? `${formatAudioDuration(currentTime)} / ${formatAudioDuration(effectiveDuration)}`
              : formatAudioDuration(totalDuration)
          )}
        </span>
        <span className="text-[10px] text-[#e4beba]/40">
          Voice
        </span>
      </div>
    </div>
  )
}

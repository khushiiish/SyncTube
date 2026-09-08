import { useState, useRef, useEffect } from 'react'
import { Square, Trash2, Send, Play, Pause, Loader2, AlertCircle, Mic } from 'lucide-react'
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder'
import { formatAudioDuration } from '../../utils/audioFormat'

/**
 * VoiceRecorder — In-chat voice recording and preview composer.
 *
 * States handled:
 * - Requesting: Connecting microphone hardware
 * - Recording: Actively capturing voice with live duration timer
 * - Preview: Play/pause review before submitting
 * - Idle / Error: Clear recovery actions (Retry / Cancel)
 */
export default function VoiceRecorder({ onSendVoice, onCancel, isSending = false }) {
  const {
    isRequesting,
    isRecording,
    isPreview,
    isIdle,
    duration,
    audioBlob,
    audioUrl,
    mimeType,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceRecorder({ maxDurationSeconds: 60 })

  const [previewPlaying, setPreviewPlaying] = useState(false)
  const previewAudioRef = useRef(null)
  const durationRef = useRef(0)
  durationRef.current = duration

  // Automatically request microphone on mount
  useEffect(() => {
    startRecording()
    return () => {
      cancelRecording()
    }
  }, [startRecording, cancelRecording])

  // Listen for global audio pause events from other players
  useEffect(() => {
    const handlePauseAudio = (e) => {
      if (e.detail?.id !== 'preview' && previewAudioRef.current) {
        previewAudioRef.current.pause()
        setPreviewPlaying(false)
      }
    }
    window.addEventListener('synctube:pause_audio', handlePauseAudio)
    return () => window.removeEventListener('synctube:pause_audio', handlePauseAudio)
  }, [])

  // Handle cancel / discard
  const handleCancel = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
    }
    cancelRecording()
    if (onCancel) onCancel()
  }

  // Handle preview play/pause
  const togglePreviewPlay = () => {
    if (!previewAudioRef.current || !audioUrl) return

    if (previewPlaying) {
      previewAudioRef.current.pause()
      setPreviewPlaying(false)
    } else {
      window.dispatchEvent(new CustomEvent('synctube:pause_audio', { detail: { id: 'preview' } }))
      previewAudioRef.current.play().then(() => {
        setPreviewPlaying(true)
      }).catch(err => {
        console.warn('[VoiceRecorder] Preview play failed:', err.message)
        setPreviewPlaying(false)
      })
    }
  }

  // Stop recording and move immediately to preview mode
  const handleStopForReview = () => {
    stopRecording()
  }

  // Stop recording and send directly without extra preview step
  const handleStopAndSend = () => {
    if (isSending) return
    stopRecording(({ audioBlob: finalBlob, mimeType: finalMime }) => {
      if (!finalBlob) return
      onSendVoice({
        audioBlob: finalBlob,
        duration: Math.max(1, durationRef.current),
        mimeType: finalMime,
      })
    })
  }

  // Send finalized voice message from preview mode
  const handleSendPreview = () => {
    if (!audioBlob || isSending) return
    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
    }
    onSendVoice({
      audioBlob,
      duration: Math.max(1, duration),
      mimeType,
    })
  }

  return (
    <div className="bg-[#0e0e10] border border-[#ffb3ad]/30 rounded-xl p-3 flex flex-col gap-2 shadow-[0_4px_20px_rgba(0,0,0,0.3)] min-h-[48px] justify-center">
      {/* Error state */}
      {error && (
        <div className="flex items-center justify-between bg-[#ef4444]/15 border border-[#ef4444]/30 text-[#fca5a5] px-3 py-2 rounded-lg text-[13px]">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-[#ef4444] flex-shrink-0" />
            <span className="truncate">{error}</span>
          </div>
          <div className="flex items-center gap-2.5 ml-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => startRecording()}
              className="text-[12px] font-semibold text-[#ffb3ad] hover:underline"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="text-[12px] font-semibold text-[#fca5a5] hover:underline"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Connecting / Requesting Microphone State */}
      {isRequesting && !error && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Loader2 className="w-4 h-4 text-[#ffb3ad] animate-spin flex-shrink-0" />
            <span className="font-[Geist,sans-serif] text-[13px] text-[#e4beba]/90">
              Connecting microphone...
            </span>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            title="Cancel"
            className="p-1.5 text-[#e4beba]/60 hover:text-[#ef4444] hover:bg-[#ef4444]/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Active Recording State */}
      {isRecording && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            {/* Pulsing record indicator */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ef4444] opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#ef4444]" />
              </span>
              <span className="font-[Geist,sans-serif] text-[13px] font-medium text-[#e5e1e4] hidden sm:inline">
                Recording...
              </span>
            </div>

            {/* Live timer */}
            <span className="font-mono text-[13px] text-[#ffb3ad] bg-[#201f22] px-2 py-0.5 rounded-md border border-[#27272A] flex-shrink-0">
              {formatAudioDuration(duration)} / 1:00
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* Cancel button */}
            <button
              type="button"
              onClick={handleCancel}
              title="Cancel recording"
              className="p-1.5 text-[#e4beba]/60 hover:text-[#ef4444] hover:bg-[#ef4444]/10 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Stop / Review button (switches to preview) */}
            <button
              type="button"
              onClick={handleStopForReview}
              title="Stop & review recording"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-[#27272a] text-[#e5e1e4] hover:bg-[#3f3f46] rounded-lg font-[Geist,sans-serif] text-[12px] sm:text-[13px] font-medium transition-colors active:scale-95"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Done</span>
            </button>

            {/* Instant Send button while recording */}
            <button
              type="button"
              onClick={handleStopAndSend}
              disabled={isSending}
              title="Stop and send voice message now"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#ffb3ad] text-[#201f22] hover:bg-[#ffcdc8] rounded-lg font-[Geist,sans-serif] text-[12px] sm:text-[13px] font-semibold transition-colors active:scale-95 disabled:opacity-50"
            >
              {isSending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>Send</span>
            </button>
          </div>
        </div>
      )}

      {/* Preview State */}
      {isPreview && (
        <div className="flex items-center justify-between gap-2">
          {audioUrl && (
            <audio
              ref={previewAudioRef}
              src={audioUrl}
              onEnded={() => setPreviewPlaying(false)}
            />
          )}

          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            {/* Preview play/pause */}
            <button
              type="button"
              onClick={togglePreviewPlay}
              disabled={isSending}
              aria-label={previewPlaying ? 'Pause preview' : 'Play preview'}
              className="w-8 h-8 rounded-full bg-[#ffb3ad]/20 text-[#ffb3ad] hover:bg-[#ffb3ad]/30 flex items-center justify-center transition-colors flex-shrink-0"
            >
              {previewPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              )}
            </button>

            <span className="font-[Geist,sans-serif] text-[12px] sm:text-[13px] text-[#e5e1e4] truncate">
              Voice note ({formatAudioDuration(duration)})
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* Discard button */}
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSending}
              title="Discard voice note"
              className="p-1.5 text-[#e4beba]/60 hover:text-[#ef4444] hover:bg-[#ef4444]/10 rounded-lg transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Send voice message button */}
            <button
              type="button"
              onClick={handleSendPreview}
              disabled={isSending}
              className="flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 bg-[#ffb3ad] text-[#201f22] hover:bg-[#ffcdc8] rounded-lg font-[Geist,sans-serif] text-[12px] sm:text-[13px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Idle / Ready fallback state */}
      {isIdle && !error && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[#e4beba]/70">
            <Mic className="w-4 h-4 text-[#ffb3ad]" />
            <span className="font-[Geist,sans-serif] text-[13px]">
              Ready to record
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="p-1.5 text-[#e4beba]/60 hover:text-[#ef4444] rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => startRecording()}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#ffb3ad] text-[#201f22] hover:bg-[#ffcdc8] rounded-lg font-[Geist,sans-serif] text-[12px] font-semibold transition-colors active:scale-95"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Record</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

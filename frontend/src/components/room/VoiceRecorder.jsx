import { useState, useRef, useEffect } from 'react'
import { Square, Trash2, Send, Play, Pause, Loader2, AlertCircle } from 'lucide-react'
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder'
import { formatAudioDuration } from '../../utils/audioFormat'

/**
 * VoiceRecorder — In-chat voice recording and preview composer.
 *
 * Provides real-time recording timer (up to 60s), audio preview playback,
 * discard capability, and upload submission state.
 */
export default function VoiceRecorder({ onSendVoice, onCancel, isSending = false }) {
  const {
    isRecording,
    isPreview,
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

  // Start recording immediately when mounted
  useEffect(() => {
    startRecording()
  }, [startRecording])

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
      previewAudioRef.current.play().then(() => {
        setPreviewPlaying(true)
      }).catch(err => {
        console.warn('[VoiceRecorder] Preview play failed:', err.message)
        setPreviewPlaying(false)
      })
    }
  }

  // Send finalized voice message
  const handleSend = () => {
    if (!audioBlob || isSending) return
    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
    }
    onSendVoice({
      audioBlob,
      duration,
      mimeType,
    })
  }

  return (
    <div className="bg-[#0e0e10] border border-[#ffb3ad]/30 rounded-xl p-3 flex flex-col gap-2 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
      {/* Error state */}
      {error && (
        <div className="flex items-center justify-between bg-[#ef4444]/15 border border-[#ef4444]/30 text-[#fca5a5] px-3 py-2 rounded-lg text-[13px]">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#ef4444] flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="text-[12px] font-semibold text-[#fca5a5] hover:underline ml-2"
          >
            Close
          </button>
        </div>
      )}

      {/* Recording State */}
      {isRecording && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Pulsing record indicator */}
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ef4444] opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#ef4444]" />
              </span>
              <span className="font-[Geist,sans-serif] text-[13px] font-medium text-[#e5e1e4]">
                Recording...
              </span>
            </div>

            {/* Live timer */}
            <span className="font-mono text-[13px] text-[#ffb3ad] bg-[#201f22] px-2 py-0.5 rounded-md border border-[#27272A]">
              {formatAudioDuration(duration)} / 1:00
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Cancel button */}
            <button
              type="button"
              onClick={handleCancel}
              title="Cancel recording"
              className="p-1.5 text-[#e4beba]/60 hover:text-[#ef4444] hover:bg-[#ef4444]/10 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Stop / Finish recording button */}
            <button
              type="button"
              onClick={stopRecording}
              title="Finish recording"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#ffb3ad] text-[#201f22] hover:bg-[#ffcdc8] rounded-lg font-[Geist,sans-serif] text-[13px] font-medium transition-colors active:scale-95"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Done</span>
            </button>
          </div>
        </div>
      )}

      {/* Preview State */}
      {isPreview && (
        <div className="flex items-center justify-between">
          {audioUrl && (
            <audio
              ref={previewAudioRef}
              src={audioUrl}
              onEnded={() => setPreviewPlaying(false)}
            />
          )}

          <div className="flex items-center gap-2.5">
            {/* Preview play/pause */}
            <button
              type="button"
              onClick={togglePreviewPlay}
              disabled={isSending}
              aria-label={previewPlaying ? 'Pause preview' : 'Play preview'}
              className="w-8 h-8 rounded-full bg-[#ffb3ad]/20 text-[#ffb3ad] hover:bg-[#ffb3ad]/30 flex items-center justify-center transition-colors"
            >
              {previewPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              )}
            </button>

            <span className="font-[Geist,sans-serif] text-[13px] text-[#e5e1e4]">
              Voice message ({formatAudioDuration(duration)})
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Discard button */}
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSending}
              title="Discard voice message"
              className="p-1.5 text-[#e4beba]/60 hover:text-[#ef4444] hover:bg-[#ef4444]/10 rounded-lg transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Send voice message button */}
            <button
              type="button"
              onClick={handleSend}
              disabled={isSending}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#ffb3ad] text-[#201f22] hover:bg-[#ffcdc8] rounded-lg font-[Geist,sans-serif] text-[13px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
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
    </div>
  )
}

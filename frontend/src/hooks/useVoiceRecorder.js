import { useState, useRef, useCallback, useEffect } from 'react'
import { getSupportedAudioMimeType } from '../utils/audioFormat'

/**
 * useVoiceRecorder — Custom hook managing browser audio capture via MediaRecorder API.
 *
 * States:
 * - 'idle': Not recording, mic inactive
 * - 'requesting': Awaiting getUserMedia microphone permission / hardware connection
 * - 'recording': Active audio capture with live timer
 * - 'preview': Recording stopped, audio Blob ready for playback or send
 *
 * Features:
 * - Direct microphone stream acquisition with noise suppression & echo cancellation
 * - Session tracking preventing concurrency deadlocks and duplicate streams
 * - Immediate hardware track termination on stop or cancel (no mic indicator lingering)
 * - Single-blob container capture (avoids timeslice chunk duplication/stutter)
 * - 60-second automatic recording stop limit
 * - In-memory Blob preview creation and optional instant-send onStop callback
 */
export function useVoiceRecorder({ maxDurationSeconds = 60 } = {}) {
  const [status, setStatus] = useState('idle') // 'idle' | 'requesting' | 'recording' | 'preview'
  const [duration, setDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [mimeType, setMimeType] = useState('audio/webm')
  const [error, setError] = useState(null)

  const mediaRecorderRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const timerRef = useRef(null)
  const chunksRef = useRef([])
  const previewUrlRef = useRef(null)
  const sessionIdRef = useRef(0)
  const onStopCallbackRef = useRef(null)

  // Track release helper — synchronously stops all microphone tracks
  const cleanupStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        try {
          track.stop()
        } catch {
          // Ignore
        }
      })
      mediaStreamRef.current = null
    }
  }, [])

  // Clear timer helper
  const clearRecordingTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // Revoke object URL helper
  const cleanupPreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      try {
        URL.revokeObjectURL(previewUrlRef.current)
      } catch {
        // Ignore
      }
      previewUrlRef.current = null
    }
  }, [])

  /**
   * Stop active recording and finalize audio Blob.
   * Immediately stops hardware microphone tracks so the mic is released on the spot.
   */
  const stopRecording = useCallback((onStopCallback = null) => {
    clearRecordingTimer()
    if (typeof onStopCallback === 'function') {
      onStopCallbackRef.current = onStopCallback
    }

    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch (err) {
        console.warn('[VoiceRecorder] Error stopping MediaRecorder:', err.message)
      }
    }

    // Immediately stop hardware mic stream tracks to release microphone hardware synchronously
    cleanupStream()
  }, [clearRecordingTimer, cleanupStream])

  /**
   * Start microphone capture and MediaRecorder.
   * Increments session ID to cancel any in-flight previous requests and avoids concurrency locks.
   */
  const startRecording = useCallback(async () => {
    // If already actively recording in this session, do not restart
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      return false
    }

    const currentSessionId = ++sessionIdRef.current

    setStatus('requesting')
    setError(null)
    cleanupPreviewUrl()
    cleanupStream()
    clearRecordingTimer()

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.onstop = null
        mediaRecorderRef.current.ondataavailable = null
        mediaRecorderRef.current.stop()
      } catch {
        // Ignore
      }
      mediaRecorderRef.current = null
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      if (sessionIdRef.current === currentSessionId) {
        setError('Audio recording is not supported in your browser.')
        setStatus('idle')
      }
      return false
    }

    try {
      // Pause any currently playing voice message in the app
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('synctube:pause_audio', { detail: { id: 'recording' } }))
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      // If cancelled or superseded by another startRecording while awaiting getUserMedia
      if (sessionIdRef.current !== currentSessionId) {
        stream.getTracks().forEach(t => {
          try { t.stop() } catch {}
        })
        return false
      }

      mediaStreamRef.current = stream
      chunksRef.current = []

      const chosenMime = getSupportedAudioMimeType()
      setMimeType(chosenMime)

      let recorder
      try {
        recorder = chosenMime ? new MediaRecorder(stream, { mimeType: chosenMime }) : new MediaRecorder(stream)
      } catch {
        recorder = new MediaRecorder(stream)
      }
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (sessionIdRef.current !== currentSessionId) return
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        cleanupStream()
        if (sessionIdRef.current !== currentSessionId) return

        const finalBlob = new Blob(chunksRef.current, { type: chosenMime || 'audio/webm' })
        const url = URL.createObjectURL(finalBlob)
        previewUrlRef.current = url

        setAudioBlob(finalBlob)
        setAudioUrl(url)
        setStatus('preview')

        if (typeof onStopCallbackRef.current === 'function') {
          const cb = onStopCallbackRef.current
          onStopCallbackRef.current = null
          cb({ audioBlob: finalBlob, audioUrl: url, mimeType: chosenMime || 'audio/webm' })
        }
      }

      recorder.onerror = (evt) => {
        console.error('[VoiceRecorder] MediaRecorder error:', evt.error)
        if (sessionIdRef.current !== currentSessionId) return
        setError('An error occurred during audio recording.')
        cleanupStream()
        clearRecordingTimer()
        setStatus('idle')
      }

      // Record continuously without 250ms timeslice chunks to prevent chunk interleaving and duplicate speech
      recorder.start()
      setStatus('recording')
      setDuration(0)

      const startTime = Date.now()
      timerRef.current = setInterval(() => {
        const elapsed = Math.round((Date.now() - startTime) / 1000)
        setDuration(elapsed)

        if (elapsed >= maxDurationSeconds) {
          stopRecording()
        }
      }, 250)

      return true
    } catch (err) {
      cleanupStream()
      if (sessionIdRef.current !== currentSessionId) return false

      console.warn('[VoiceRecorder] getUserMedia failed:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Microphone permission was denied. Please allow microphone access in your browser settings.')
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError('No microphone found. Please connect an audio input device.')
      } else {
        setError(err.message || 'Failed to access microphone.')
      }
      setStatus('idle')
      return false
    }
  }, [cleanupPreviewUrl, cleanupStream, clearRecordingTimer, maxDurationSeconds, stopRecording])

  /**
   * Cancel and discard current recording/preview without saving.
   */
  const cancelRecording = useCallback(() => {
    ++sessionIdRef.current
    onStopCallbackRef.current = null
    clearRecordingTimer()

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.onstop = null
        mediaRecorderRef.current.ondataavailable = null
        mediaRecorderRef.current.stop()
      } catch {
        // Ignore
      }
    }
    mediaRecorderRef.current = null
    cleanupStream()
    cleanupPreviewUrl()
    chunksRef.current = []

    setAudioBlob(null)
    setAudioUrl(null)
    setDuration(0)
    setStatus('idle')
    setError(null)
  }, [cleanupPreviewUrl, cleanupStream, clearRecordingTimer])

  /**
   * Reset recorder state after sending or discarding.
   */
  const resetRecorder = useCallback(() => {
    cancelRecording()
  }, [cancelRecording])

  // Lifecycle cleanup on unmount
  useEffect(() => {
    return () => {
      clearRecordingTimer()
      cleanupStream()
      cleanupPreviewUrl()
    }
  }, [clearRecordingTimer, cleanupStream, cleanupPreviewUrl])

  return {
    status, // 'idle' | 'requesting' | 'recording' | 'preview'
    isRequesting: status === 'requesting',
    isRecording: status === 'recording',
    isPreview: status === 'preview',
    isIdle: status === 'idle',
    duration,
    audioBlob,
    audioUrl,
    mimeType,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    resetRecorder,
  }
}

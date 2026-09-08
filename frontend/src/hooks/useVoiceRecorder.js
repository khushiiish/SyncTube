import { useState, useRef, useCallback, useEffect } from 'react'
import { getSupportedAudioMimeType } from '../utils/audioFormat'

/**
 * useVoiceRecorder — Custom hook managing browser audio capture via MediaRecorder API.
 *
 * Features:
 * - Direct microphone stream acquisition with noise suppression
 * - Dynamic browser MIME type negotiation
 * - 60-second automatic recording stop limit
 * - In-memory Blob preview creation
 * - Guaranteed stream track cleanup on cancel or unmount to turn off browser mic indicator
 */
export function useVoiceRecorder({ maxDurationSeconds = 60 } = {}) {
  const [status, setStatus] = useState('idle') // 'idle' | 'recording' | 'preview'
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

  // Track release helper
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
   */
  const stopRecording = useCallback(() => {
    clearRecordingTimer()
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop()
      } catch (err) {
        console.warn('[VoiceRecorder] Error stopping MediaRecorder:', err.message)
      }
    }
  }, [clearRecordingTimer])

  /**
   * Start microphone capture and MediaRecorder.
   */
  const startRecording = useCallback(async () => {
    setError(null)
    cleanupPreviewUrl()
    cleanupStream()
    clearRecordingTimer()

    if (!navigator?.mediaDevices?.getUserMedia) {
      setError('Audio recording is not supported in your browser.')
      return false
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      mediaStreamRef.current = stream
      chunksRef.current = []

      const chosenMime = getSupportedAudioMimeType()
      setMimeType(chosenMime)

      const options = chosenMime ? { mimeType: chosenMime } : {}
      const recorder = new MediaRecorder(stream, options)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        const finalBlob = new Blob(chunksRef.current, { type: chosenMime || 'audio/webm' })
        const url = URL.createObjectURL(finalBlob)
        previewUrlRef.current = url

        setAudioBlob(finalBlob)
        setAudioUrl(url)
        setStatus('preview')
        cleanupStream()
      }

      recorder.onerror = (evt) => {
        console.error('[VoiceRecorder] MediaRecorder error:', evt.error)
        setError('An error occurred during audio recording.')
        cleanupStream()
        clearRecordingTimer()
        setStatus('idle')
      }

      recorder.start(250) // Emit chunks every 250ms
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
      console.warn('[VoiceRecorder] getUserMedia failed:', err)
      cleanupStream()
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
    clearRecordingTimer()
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        // Remove onstop handler so preview state isn't triggered
        mediaRecorderRef.current.onstop = null
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
    status, // 'idle' | 'recording' | 'preview'
    isRecording: status === 'recording',
    isPreview: status === 'preview',
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

import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { RTC_CONFIG } from '../config/webrtc'
import { useSocketContext } from './SocketContext'
import { useRoomContext } from './RoomContext'
import {
  EVENTS,
  emitVoiceJoin,
  emitVoiceLeave,
  emitVoiceOffer,
  emitVoiceAnswer,
  emitVoiceIceCandidate,
  emitVoiceMute,
} from '../services/socketService'

const LiveVoiceContext = createContext(null)

/**
 * LiveVoiceProvider — Room-level provider for real-time WebRTC Live Voice audio chat.
 *
 * Architecture:
 * - Pure browser-native WebRTC mesh: audio is exchanged peer-to-peer, never sent to server.
 * - Socket.IO is utilized exclusively for WebRTC signaling (offers, answers, ICE candidates, mute).
 * - RTCPeerConnections, local MediaStream, and remote HTMLAudioElements are stored in refs to avoid React re-renders.
 * - Room-level scope guarantees audio connectivity is preserved across sidebar tabs, mobile drawers, and video playback.
 * - NO artificial duration limit: call continues until explicit leave, room leave, or session takeover.
 */
export function LiveVoiceProvider({ children }) {
  const { socket, isConnected } = useSocketContext()
  const { room } = useRoomContext()
  const roomId = room?.roomId

  const [isLiveVoiceJoined, setIsLiveVoiceJoined] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [liveParticipants, setLiveParticipants] = useState([])
  const [activeSpeakers, setActiveSpeakers] = useState(new Set())
  const [voiceError, setVoiceError] = useState(null)

  // WebRTC resources stored in refs
  const localStreamRef = useRef(null)
  const peerConnectionsRef = useRef(new Map())       // remoteSocketId -> RTCPeerConnection
  const audioElementsRef = useRef(new Map())         // remoteSocketId -> HTMLAudioElement
  const iceCandidateQueuesRef = useRef(new Map())    // remoteSocketId -> Array<RTCIceCandidateInit>
  const audioContextRef = useRef(null)
  const isCleaningUpRef = useRef(false)
  const isMutedRef = useRef(false)
  isMutedRef.current = isMuted

  // Helper: Get or initialize ICE candidate queue
  const getCandidateQueue = (remoteSocketId) => {
    if (!iceCandidateQueuesRef.current.has(remoteSocketId)) {
      iceCandidateQueuesRef.current.set(remoteSocketId, [])
    }
    return iceCandidateQueuesRef.current.get(remoteSocketId)
  }

  // Helper: Flush buffered ICE candidates after setRemoteDescription
  const flushCandidateQueue = async (remoteSocketId, pc) => {
    const queue = iceCandidateQueuesRef.current.get(remoteSocketId) || []
    while (queue.length > 0) {
      const cand = queue.shift()
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand))
      } catch (err) {
        console.warn(`[WebRTC] Failed to add buffered ICE candidate for ${remoteSocketId}:`, err)
      }
    }
  }

  // Setup speaking detection (VAD) via Web Audio API AnalyserNode
  const setupSpeakingAnalyser = useCallback((stream, socketId) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioCtx()
      }
      const ctx = audioContextRef.current
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }

      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.4
      source.connect(analyser)

      const buffer = new Uint8Array(analyser.frequencyBinCount)
      let isCurrentlySpeaking = false
      let intervalId = null

      intervalId = setInterval(() => {
        if (!localStreamRef.current && socketId === 'me') {
          clearInterval(intervalId)
          return
        }
        analyser.getByteFrequencyData(buffer)
        let sum = 0
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i]
        }
        const average = sum / buffer.length
        const speaking = average > 16 // Threshold for voice activity

        if (speaking !== isCurrentlySpeaking) {
          isCurrentlySpeaking = speaking
          setActiveSpeakers(prev => {
            const next = new Set(prev)
            if (speaking) next.add(socketId)
            else next.delete(socketId)
            return next
          })
        }
      }, 200)

      return () => {
        clearInterval(intervalId)
        try { source.disconnect() } catch {}
      }
    } catch (err) {
      console.warn('[WebRTC] Audio analyser setup skipped:', err)
    }
  }, [])

  // Create an RTCPeerConnection for a remote peer
  const createPeerConnection = useCallback((remoteSocketId, remoteUsername) => {
    if (peerConnectionsRef.current.has(remoteSocketId)) {
      const existingPc = peerConnectionsRef.current.get(remoteSocketId)
      if (existingPc.signalingState !== 'closed') {
        return existingPc
      }
    }

    const pc = new RTCPeerConnection(RTC_CONFIG)
    peerConnectionsRef.current.set(remoteSocketId, pc)

    // Add local microphone audio tracks
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current)
      })
    }

    // ICE candidate exchange
    pc.onicecandidate = (event) => {
      if (event.candidate && socket && roomId) {
        emitVoiceIceCandidate(socket, {
          roomId,
          toSocketId: remoteSocketId,
          candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
        })
      }
    }

    // Remote audio track received
    pc.ontrack = (event) => {
      const remoteStream = event.streams?.[0] || new MediaStream([event.track])
      let audioEl = audioElementsRef.current.get(remoteSocketId)
      if (!audioEl) {
        audioEl = new Audio()
        audioEl.autoplay = true
        audioEl.playsInline = true
        audioElementsRef.current.set(remoteSocketId, audioEl)
      }
      audioEl.srcObject = remoteStream
      audioEl.play().catch(playErr => {
        console.warn(`[WebRTC] Autoplay waiting for user interaction for ${remoteUsername || remoteSocketId}:`, playErr.message)
      })

      // Attach voice activity detection to remote stream
      setupSpeakingAnalyser(remoteStream, remoteSocketId)
    }

    // Monitor peer connection state
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      if (state === 'failed' || state === 'closed') {
        console.warn(`[WebRTC] Peer ${remoteSocketId} connection state: ${state}`)
        // Clean up audio element if closed
        const el = audioElementsRef.current.get(remoteSocketId)
        if (el) {
          el.pause()
          el.srcObject = null
          audioElementsRef.current.delete(remoteSocketId)
        }
      }
    }

    return pc
  }, [socket, roomId, setupSpeakingAnalyser])

  // Leave Live Voice — clean up all WebRTC resources while keeping the user in the room
  const leaveLiveVoice = useCallback(() => {
    isCleaningUpRef.current = true

    // 1. Stop local microphone hardware
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        try { track.stop() } catch {}
      })
      localStreamRef.current = null
    }

    // 2. Close all RTCPeerConnections
    peerConnectionsRef.current.forEach((pc) => {
      try { pc.close() } catch {}
    })
    peerConnectionsRef.current.clear()

    // 3. Pause & release all remote HTMLAudioElements
    audioElementsRef.current.forEach((el) => {
      try {
        el.pause()
        el.srcObject = null
      } catch {}
    })
    audioElementsRef.current.clear()

    // 4. Clear ICE candidate queues
    iceCandidateQueuesRef.current.clear()

    // 5. Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { audioContextRef.current.close() } catch {}
      audioContextRef.current = null
    }

    // 6. Notify server & room peers
    if (socket && roomId) {
      emitVoiceLeave(socket, { roomId })
    }

    // 7. Reset local React states
    setIsLiveVoiceJoined(false)
    setIsConnecting(false)
    setIsMuted(false)
    setLiveParticipants([])
    setActiveSpeakers(new Set())
    setVoiceError(null)

    isCleaningUpRef.current = false
  }, [socket, roomId])

  // Join Live Voice — requests microphone and connects to room WebRTC mesh
  const joinLiveVoice = useCallback(async () => {
    if (!socket || !roomId) {
      toast.error('Cannot connect to Live Voice: socket not connected.')
      return
    }

    setIsConnecting(true)
    setVoiceError(null)

    try {
      // 1. Request microphone access with echo cancellation & noise suppression
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })

      localStreamRef.current = stream
      setIsMuted(false)

      // Start local speaking analyser
      setupSpeakingAnalyser(stream, 'me')

      // 2. Register with Socket.IO signaling room
      emitVoiceJoin(socket, { roomId }, async (res) => {
        setIsConnecting(false)

        if (!res?.success) {
          leaveLiveVoice()
          const msg = res?.message || 'Failed to join Live Voice session.'
          setVoiceError(msg)
          toast.error(msg)
          return
        }

        setIsLiveVoiceJoined(true)
        toast('Connected to Live Voice!', { icon: '🎙️' })

        const existingPeers = res.participants || []
        setLiveParticipants(existingPeers)

        // 3. Initiate WebRTC mesh connections to all existing participants (Newcomer offers pattern)
        for (const peer of existingPeers) {
          try {
            const pc = createPeerConnection(peer.socketId, peer.username)
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)

            emitVoiceOffer(socket, {
              roomId,
              toSocketId: peer.socketId,
              offer: pc.localDescription ? pc.localDescription.toJSON() : offer,
            })
          } catch (offerErr) {
            console.error(`[WebRTC] Failed to create offer for ${peer.username}:`, offerErr)
          }
        }
      })
    } catch (err) {
      setIsConnecting(false)
      let friendlyError = 'Could not access your microphone.'

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        friendlyError = 'Microphone permission was denied. Please allow microphone access in your browser settings to join Live Voice.'
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        friendlyError = 'No microphone detected on your device.'
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        friendlyError = 'Microphone is currently in use by another application.'
      }

      setVoiceError(friendlyError)
      toast.error(friendlyError, { duration: 5000 })
      leaveLiveVoice()
    }
  }, [socket, roomId, setupSpeakingAnalyser, createPeerConnection, leaveLiveVoice])

  // Toggle Mute — mutes local microphone track without dropping WebRTC connections
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return

    const newMuted = !isMutedRef.current
    localStreamRef.current.getAudioTracks().forEach(track => {
      track.enabled = !newMuted
    })

    setIsMuted(newMuted)
    isMutedRef.current = newMuted

    // Notify other peers of mute state
    if (socket && roomId) {
      emitVoiceMute(socket, { roomId, isMuted: newMuted })
    }

    if (newMuted) {
      toast('Microphone muted', { icon: '🔇' })
    } else {
      toast('Microphone unmuted', { icon: '🎙️' })
    }
  }, [socket, roomId])

  // Attach Socket.IO signaling event listeners
  useEffect(() => {
    if (!socket || !roomId) return

    // Another participant joined live voice
    const handleParticipantJoined = ({ socketId, participantId, username, isMuted: peerMuted }) => {
      if (socketId === socket.id) return
      setLiveParticipants(prev => {
        if (prev.some(p => p.socketId === socketId)) return prev
        return [...prev, { socketId, participantId, username, isMuted: Boolean(peerMuted) }]
      })
      toast(`${username || 'Someone'} joined Live Voice`, { icon: '🔴' })
    }

    // A participant left live voice
    const handleParticipantLeft = ({ socketId }) => {
      // Close peer connection & clean up audio
      const pc = peerConnectionsRef.current.get(socketId)
      if (pc) {
        try { pc.close() } catch {}
        peerConnectionsRef.current.delete(socketId)
      }

      const el = audioElementsRef.current.get(socketId)
      if (el) {
        try {
          el.pause()
          el.srcObject = null
        } catch {}
        audioElementsRef.current.delete(socketId)
      }

      iceCandidateQueuesRef.current.delete(socketId)

      setLiveParticipants(prev => prev.filter(p => p.socketId !== socketId))
      setActiveSpeakers(prev => {
        const next = new Set(prev)
        next.delete(socketId)
        return next
      })
    }

    // Remote peer updated mute state
    const handleParticipantMuted = ({ socketId, isMuted: peerMuted }) => {
      setLiveParticipants(prev => prev.map(p =>
        p.socketId === socketId ? { ...p, isMuted: Boolean(peerMuted) } : p
      ))
      if (peerMuted) {
        setActiveSpeakers(prev => {
          const next = new Set(prev)
          next.delete(socketId)
          return next
        })
      }
    }

    // Received WebRTC Offer from a newcomer peer
    const handleOffer = async ({ fromSocketId, fromUsername, offer }) => {
      if (!isLiveVoiceJoined && !localStreamRef.current) return

      try {
        const pc = createPeerConnection(fromSocketId, fromUsername)
        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        await flushCandidateQueue(fromSocketId, pc)

        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        emitVoiceAnswer(socket, {
          roomId,
          toSocketId: fromSocketId,
          answer: pc.localDescription ? pc.localDescription.toJSON() : answer,
        })
      } catch (err) {
        console.error(`[WebRTC] Failed to handle offer from ${fromUsername || fromSocketId}:`, err)
      }
    }

    // Received WebRTC Answer from existing peer
    const handleAnswer = async ({ fromSocketId, answer }) => {
      const pc = peerConnectionsRef.current.get(fromSocketId)
      if (!pc) return

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer))
        await flushCandidateQueue(fromSocketId, pc)
      } catch (err) {
        console.error(`[WebRTC] Failed to handle answer from ${fromSocketId}:`, err)
      }
    }

    // Received ICE candidate from peer
    const handleIceCandidate = async ({ fromSocketId, candidate }) => {
      const pc = peerConnectionsRef.current.get(fromSocketId)
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (err) {
          console.warn(`[WebRTC] Failed to add ICE candidate from ${fromSocketId}:`, err)
        }
      } else {
        // Buffer candidate until remoteDescription is set
        getCandidateQueue(fromSocketId).push(candidate)
      }
    }

    socket.on(EVENTS.VOICE_PARTICIPANT_JOINED, handleParticipantJoined)
    socket.on(EVENTS.VOICE_PARTICIPANT_LEFT, handleParticipantLeft)
    socket.on(EVENTS.VOICE_PARTICIPANT_MUTED, handleParticipantMuted)
    socket.on(EVENTS.VOICE_OFFER, handleOffer)
    socket.on(EVENTS.VOICE_ANSWER, handleAnswer)
    socket.on(EVENTS.VOICE_ICE_CANDIDATE, handleIceCandidate)

    return () => {
      socket.off(EVENTS.VOICE_PARTICIPANT_JOINED, handleParticipantJoined)
      socket.off(EVENTS.VOICE_PARTICIPANT_LEFT, handleParticipantLeft)
      socket.off(EVENTS.VOICE_PARTICIPANT_MUTED, handleParticipantMuted)
      socket.off(EVENTS.VOICE_OFFER, handleOffer)
      socket.off(EVENTS.VOICE_ANSWER, handleAnswer)
      socket.off(EVENTS.VOICE_ICE_CANDIDATE, handleIceCandidate)
    }
  }, [socket, roomId, isLiveVoiceJoined, createPeerConnection])

  // Automatically leave live voice when room changes or unmounts
  useEffect(() => {
    return () => {
      leaveLiveVoice()
    }
  }, [roomId, leaveLiveVoice])

  // Handle sudden socket disconnect
  useEffect(() => {
    if (!isConnected && isLiveVoiceJoined) {
      toast('Live Voice temporarily paused (reconnecting to watch party...)', { icon: '⚠️' })
    }
  }, [isConnected, isLiveVoiceJoined])

  return (
    <LiveVoiceContext.Provider
      value={{
        isLiveVoiceJoined,
        isConnecting,
        isMuted,
        liveParticipants,
        activeSpeakers,
        voiceError,
        joinLiveVoice,
        leaveLiveVoice,
        toggleMute,
      }}
    >
      {children}
    </LiveVoiceContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLiveVoice() {
  const context = useContext(LiveVoiceContext)
  if (!context) {
    throw new Error('useLiveVoice must be used within a <LiveVoiceProvider>')
  }
  return context
}

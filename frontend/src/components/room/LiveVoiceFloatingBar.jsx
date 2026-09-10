import { Mic, MicOff, PhoneOff, Radio } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLiveVoice } from '../../context/LiveVoiceContext'

/**
 * LiveVoiceFloatingBar — Persistent floating indicator across room views.
 *
 * Ensures participants have instant microphone control (mute/unmute/leave)
 * while watching videos full-screen or switching between tabs on desktop & mobile.
 */
export default function LiveVoiceFloatingBar() {
  const {
    isLiveVoiceJoined,
    isMuted,
    liveParticipants,
    activeSpeakers,
    toggleMute,
    leaveLiveVoice,
  } = useLiveVoice()

  if (!isLiveVoiceJoined) return null

  const isMeSpeaking = activeSpeakers.has('me')
  const totalCount = 1 + (liveParticipants?.length || 0)

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        className="fixed bottom-16 md:bottom-5 left-3 sm:left-6 z-30 flex items-center gap-2 bg-[#18171c]/90 backdrop-blur-md border border-[#ff5451]/30 rounded-full py-1.5 px-3 shadow-2xl"
      >
        {/* Live Indicator */}
        <div className="flex items-center gap-1.5 pr-2 border-r border-[#353438]">
          <span className="w-2 h-2 rounded-full bg-[#ff5451] animate-pulse" />
          <span className="font-[Geist,sans-serif] font-bold text-[12px] text-[#e5e1e4]">
            Voice ({totalCount})
          </span>
        </div>

        {/* Speaking / Mute Status */}
        <div className="flex items-center gap-1 px-1">
          {isMeSpeaking ? (
            <span className="text-[11px] font-[Geist,sans-serif] font-semibold text-emerald-400 flex items-center gap-1 animate-pulse">
              <Radio className="w-3 h-3" /> Speaking
            </span>
          ) : isMuted ? (
            <span className="text-[11px] font-[Geist,sans-serif] text-[#ff8b87] flex items-center gap-1">
              <MicOff className="w-3 h-3" /> Muted
            </span>
          ) : (
            <span className="text-[11px] font-[Geist,sans-serif] text-emerald-400/80 flex items-center gap-1">
              <Mic className="w-3 h-3" /> Mic On
            </span>
          )}
        </div>

        {/* Quick Actions */}
        <button
          type="button"
          onClick={toggleMute}
          className={`
            p-1.5 rounded-full transition-colors cursor-pointer
            ${isMuted
              ? 'bg-[#ff5451]/20 text-[#ffb4ab] hover:bg-[#ff5451]/30'
              : 'bg-[#252428] text-[#e5e1e4] hover:bg-[#353438]'
            }
          `}
          title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-emerald-400" />}
        </button>

        <button
          type="button"
          onClick={leaveLiveVoice}
          className="p-1.5 rounded-full bg-[#2b1618] hover:bg-[#3d1a1d] text-[#ff8b87] transition-colors cursor-pointer"
          title="Leave Live Voice"
        >
          <PhoneOff className="w-3.5 h-3.5" />
        </button>
      </motion.div>
    </AnimatePresence>
  )
}

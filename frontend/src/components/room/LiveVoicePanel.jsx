import { Mic, MicOff, PhoneOff, Radio, Volume2 } from 'lucide-react'
import { motion } from 'framer-motion'
import Avatar from '../ui/Avatar'
import { useLiveVoice } from '../../context/LiveVoiceContext'
import { useRoomContext } from '../../context/RoomContext'

/**
 * LiveVoicePanel — Active two-way WebRTC audio session panel.
 *
 * Displays:
 * - Real-time audio connection status
 * - Live participants list with dynamic speaking indicators and mute status
 * - One-tap microphone Mute/Unmute toggle (preserves peer connections)
 * - Explicit Leave Live Voice action (retains room presence and text chat)
 */
export default function LiveVoicePanel() {
  const {
    isLiveVoiceJoined,
    isMuted,
    liveParticipants,
    activeSpeakers,
    toggleMute,
    leaveLiveVoice,
  } = useLiveVoice()

  const { currentUser } = useRoomContext()

  if (!isLiveVoiceJoined) return null

  const isMeSpeaking = activeSpeakers.has('me')
  const totalVoiceMembers = 1 + (liveParticipants?.length || 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="bg-[#1b1a20] border border-[#ff5451]/30 rounded-xl p-3 mb-3 shadow-lg relative overflow-hidden"
    >
      {/* Ambient background glow */}
      <div className="absolute -top-6 -right-6 w-24 h-24 bg-[#ff5451]/10 rounded-full blur-2xl pointer-events-none" />

      {/* Header bar */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5451] animate-ping absolute opacity-75" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5451]" />
          </div>
          <span className="font-[Geist,sans-serif] font-bold text-[13px] text-[#e5e1e4] tracking-tight flex items-center gap-1.5">
            Live Voice
          </span>
          <span className="text-[11px] font-[Inter,sans-serif] text-[#e4beba]/70 bg-[#252428] px-2 py-0.5 rounded-full">
            {totalVoiceMembers} {totalVoiceMembers === 1 ? 'member' : 'members'}
          </span>
        </div>

        {/* Live Audio Quality indicator */}
        <div className="flex items-center gap-1 text-[11px] font-[Geist,sans-serif] text-emerald-400">
          <Radio className="w-3.5 h-3.5 animate-pulse" />
          <span>Live P2P</span>
        </div>
      </div>

      {/* Live Participants List */}
      <div className="flex flex-wrap gap-2 mb-3">
        {/* Current User Pill */}
        <div className={`
          flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-[Geist,sans-serif] transition-all
          ${isMeSpeaking
            ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 ring-2 ring-emerald-500/30'
            : 'bg-[#252428] border border-[#353438] text-[#e5e1e4]'
          }
        `}>
          <div className="relative">
            <Avatar username={currentUser?.username || 'You'} size="xs" />
            {isMeSpeaking && (
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </div>
          <span className="font-medium max-w-[90px] truncate">
            {currentUser?.username || 'You'} (You)
          </span>
          {isMuted ? (
            <MicOff className="w-3.5 h-3.5 text-[#ff5451]" title="Muted" />
          ) : (
            <Mic className="w-3.5 h-3.5 text-emerald-400" title="Microphone Active" />
          )}
        </div>

        {/* Remote Participants */}
        {liveParticipants.map(peer => {
          const isPeerSpeaking = activeSpeakers.has(peer.socketId)
          return (
            <div
              key={peer.socketId}
              className={`
                flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-[Geist,sans-serif] transition-all
                ${isPeerSpeaking
                  ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 ring-2 ring-emerald-500/30'
                  : 'bg-[#252428] border border-[#353438] text-[#e5e1e4]'
                }
              `}
            >
              <div className="relative">
                <Avatar username={peer.username} size="xs" />
                {isPeerSpeaking && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </div>
              <span className="font-medium max-w-[100px] truncate">
                {peer.username}
              </span>
              {peer.isMuted ? (
                <MicOff className="w-3.5 h-3.5 text-[#ff5451]/70" title="Muted" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" title="Listening" />
              )}
            </div>
          )
        })}
      </div>

      {/* Control Buttons */}
      <div className="flex items-center gap-2 pt-2 border-t border-[#353438]/50">
        {/* Mute / Unmute Button */}
        <button
          type="button"
          id="live-voice-mute-btn"
          onClick={toggleMute}
          className={`
            flex-1 py-1.5 px-3 rounded-lg font-[Geist,sans-serif] font-medium text-[12px] flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98
            ${isMuted
              ? 'bg-[#ff5451]/20 text-[#ffb4ab] border border-[#ff5451]/30 hover:bg-[#ff5451]/30'
              : 'bg-[#252428] text-[#e5e1e4] border border-[#3f3e44] hover:bg-[#302f35]'
            }
          `}
        >
          {isMuted ? (
            <>
              <MicOff className="w-3.5 h-3.5 text-[#ff5451]" />
              <span>Unmute Mic</span>
            </>
          ) : (
            <>
              <Mic className="w-3.5 h-3.5 text-emerald-400" />
              <span>Mute Mic</span>
            </>
          )}
        </button>

        {/* Leave Live Voice Button */}
        <button
          type="button"
          id="live-voice-leave-btn"
          onClick={leaveLiveVoice}
          className="py-1.5 px-3 rounded-lg bg-[#2b1618] hover:bg-[#3d1a1d] text-[#ff8b87] border border-[#ff5451]/30 font-[Geist,sans-serif] font-medium text-[12px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-98"
          title="Disconnect from Live Voice (remain in room)"
        >
          <PhoneOff className="w-3.5 h-3.5 text-[#ff5451]" />
          <span>Leave Voice</span>
        </button>
      </div>
    </motion.div>
  )
}

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Zap, Key } from 'lucide-react'

/**
 * HeroSection — animated mesh gradient hero with Create/Join CTAs.
 * Faithfully converts the Stitch hero design including:
 * - Animated radial mesh background
 * - Live badge with pulse dot
 * - Gradient headline text
 * - Dual CTA: Create Watch Party + Join Room input
 * - Decorative blur orbs
 */
export default function HeroSection({ onCreateRoom, onJoinRoom }) {
  const [roomCode, setRoomCode] = useState('')

  const handleJoin = () => {
    if (roomCode.trim()) {
      onJoinRoom(roomCode.trim().toUpperCase())
    } else {
      onJoinRoom()
    }
  }

  return (
    <section className="relative min-h-[90vh] flex flex-col items-center justify-center px-4 overflow-hidden hero-mesh noise-overlay">
      {/* Decorative blur orbs (from Stitch) */}
      <div className="absolute bottom-10 left-10 w-32 h-32 bg-[#ffb3ad]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-20 right-20 w-48 h-48 bg-[#571bc1]/10 rounded-full blur-3xl pointer-events-none" />

      {/* Content */}
      <motion.div
        className="relative z-10 text-center max-w-4xl mx-auto flex flex-col items-center gap-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        {/* Live badge */}
        <motion.div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#201f22]/80 backdrop-blur-md border border-[#5b403e]/30 text-[12px] font-medium text-[#e4beba] font-[Geist,sans-serif]"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <span className="w-2 h-2 rounded-full bg-[#ffb3ad] animate-pulse" />
          Now with zero-latency sync
        </motion.div>

        {/* Hero headline */}
        <motion.h1
          className="font-[Geist,sans-serif] font-bold tracking-tight leading-tight text-[#e5e1e4]"
          style={{ fontSize: 'clamp(36px, 8vw, 72px)' }}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          Watch Together,{' '}
          <br className="hidden md:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ffb3ad] to-[#d0bcff]">
            Anywhere.
          </span>
        </motion.h1>

        {/* Subheading */}
        <motion.p
          className="font-[Inter,sans-serif] text-[18px] leading-relaxed text-[#e4beba] max-w-2xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          Experience cinematic synchronization. Invite friends, paste a link, and
          control the room with developer-grade precision and minimal UI friction.
        </motion.p>

        {/* CTA Row */}
        <motion.div
          className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto items-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          {/* Create Watch Party button */}
          <button
            id="hero-create-btn"
            onClick={onCreateRoom}
            className="w-full sm:w-auto px-8 py-3.5 rounded-lg bg-[#ff5451] text-white font-[Geist,sans-serif] font-bold text-[14px] tracking-wide hover:bg-[#ffb3ad] hover:text-[#68000a] transition-all duration-200 shadow-[0_0_20px_rgba(255,84,81,0.25)] hover:shadow-[0_0_30px_rgba(255,84,81,0.45)] active:scale-95"
          >
            Create Watch Party
          </button>

          {/* Join Room input group */}
          <div className="w-full sm:w-auto flex items-center relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Key className="w-4 h-4 text-[#e4beba]/50 group-focus-within:text-[#d0bcff] transition-colors" />
            </div>
            <input
              id="hero-room-code-input"
              type="text"
              placeholder="Enter Room Code"
              value={roomCode}
              onChange={e => setRoomCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              className="w-full sm:w-56 pl-10 pr-4 py-3.5 bg-[#131315] border border-[#5b403e]/30 rounded-l-lg font-[Inter,sans-serif] text-[16px] text-[#e5e1e4] placeholder:text-[#e4beba]/40 focus:outline-none focus:border-[#d0bcff] focus:ring-1 focus:ring-[#d0bcff] transition-all"
            />
            <button
              id="hero-join-btn"
              onClick={handleJoin}
              className="px-6 py-3.5 rounded-r-lg bg-[#201f22] border border-l-0 border-[#5b403e]/30 font-[Geist,sans-serif] font-medium text-[14px] text-[#e5e1e4] hover:bg-[#353437] transition-colors whitespace-nowrap"
            >
              Join Room
            </button>
          </div>
        </motion.div>

        {/* Social proof */}
        <motion.p
          className="text-[12px] text-[#e4beba]/50 font-[Inter,sans-serif]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          Free. No account required. Sync in seconds.
        </motion.p>
      </motion.div>
    </section>
  )
}

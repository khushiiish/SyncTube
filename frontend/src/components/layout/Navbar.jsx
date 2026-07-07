import { useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import useCopyToClipboard from '../../hooks/useCopyToClipboard'

/**
 * Navbar — glassmorphic top navigation bar.
 * Matches Stitch design: SyncTube brand + nav links + action icons.
 */
export default function Navbar({ onCreateRoom, onJoinRoom }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <nav className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4 bg-[#131315]/60 backdrop-blur-md border-b border-[#5b403e]/20 shadow-sm">
      {/* Brand */}
      <div className="flex items-center gap-4">
        <span className="font-[Geist,sans-serif] text-2xl font-bold text-[#ffb3ad] tracking-tight">
          SyncTube
        </span>
      </div>

      {/* Desktop Nav */}
      <div className="hidden md:flex items-center gap-8">
        <a href="#features" className="text-[14px] font-medium text-[#e4beba] hover:text-[#ffb3ad] transition-colors duration-200">
          Features
        </a>
        <Link to="/rooms" className="text-[14px] font-medium text-[#e4beba] hover:text-[#ffb3ad] transition-colors duration-200">
          Rooms
        </Link>
        <a href="https://github.com/khushiiish/SyncTube" target="_blank" rel="noopener noreferrer" className="text-[14px] font-medium text-[#e4beba] hover:text-[#ffb3ad] transition-colors duration-200">
          GitHub
        </a>
      </div>

      {/* Desktop Actions */}
      <div className="hidden md:flex items-center gap-3">
        <button
          id="nav-join-btn"
          onClick={onJoinRoom}
          className="px-4 py-2 text-[14px] font-medium text-[#e5e1e4] border border-[#27272A] rounded-lg hover:bg-[#201f22] transition-all duration-200 font-[Geist,sans-serif]"
        >
          Join Room
        </button>
        <button
          id="nav-create-btn"
          onClick={onCreateRoom}
          className="px-4 py-2 text-[14px] font-bold text-white bg-[#ff5451] border border-transparent rounded-lg hover:bg-[#ffb3ad] hover:text-[#68000a] transition-all duration-200 shadow-[0_0_15px_rgba(255,84,81,0.2)] hover:shadow-[0_0_20px_rgba(255,84,81,0.4)] font-[Geist,sans-serif]"
        >
          Create Party
        </button>
      </div>

      {/* Mobile Menu Toggle */}
      <button
        className="md:hidden p-2 text-[#e4beba] hover:text-[#ffb3ad] transition-colors"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle menu"
      >
        <div className="space-y-1.5">
          <span className={`block h-0.5 w-6 bg-current transition-all ${mobileOpen ? 'rotate-45 translate-y-2' : ''}`} />
          <span className={`block h-0.5 w-6 bg-current transition-all ${mobileOpen ? 'opacity-0' : ''}`} />
          <span className={`block h-0.5 w-6 bg-current transition-all ${mobileOpen ? '-rotate-45 -translate-y-2' : ''}`} />
        </div>
      </button>

      {/* Mobile Menu */}
      {mobileOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-full left-0 right-0 glass-floating border-t border-[#27272A] p-4 flex flex-col gap-3 md:hidden"
        >
          <button onClick={onJoinRoom} className="w-full py-2.5 text-center text-[14px] border border-[#27272A] rounded-lg text-[#e5e1e4] hover:bg-[#201f22] transition-colors font-[Geist,sans-serif]">
            Join Room
          </button>
          <button onClick={onCreateRoom} className="w-full py-2.5 text-center text-[14px] font-bold text-white bg-[#ff5451] rounded-lg hover:bg-[#ffb3ad] hover:text-[#68000a] transition-all font-[Geist,sans-serif]">
            Create Party
          </button>
        </motion.div>
      )}
    </nav>
  )
}

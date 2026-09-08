import { useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { UserButton, useClerk, useAuth } from '@clerk/react'

/**
 * Navbar — glassmorphic top navigation bar.
 * Matches Stitch design: SyncTube brand + nav links + action icons + Clerk Auth.
 */
export default function Navbar({ onCreateRoom, onJoinRoom }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { openSignIn } = useClerk()
  const { isSignedIn } = useAuth()

  return (
    <nav className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4 bg-[#131315]/60 backdrop-blur-md border-b border-[#5b403e]/20 shadow-sm">
      {/* Brand */}
      <div className="flex items-center gap-4">
        <Link to="/" className="font-[Geist,sans-serif] text-2xl font-bold text-[#ffb3ad] tracking-tight hover:opacity-90 transition-opacity">
          SyncTube
        </Link>
      </div>

      {/* Desktop Nav */}
      <div className="hidden md:flex items-center gap-8">
        <a href="/#features" className="text-[14px] font-medium text-[#e4beba] hover:text-[#ffb3ad] transition-colors duration-200">
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

        {/* Clerk Auth Section */}
        {isSignedIn ? (
          <div className="flex items-center ml-1">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: 'w-8 h-8 rounded-full ring-2 ring-[#ff5451]/30 hover:ring-[#ff5451]/60 transition-all',
                },
              }}
            />
          </div>
        ) : (
          <button
            id="nav-signin-btn"
            onClick={() => openSignIn()}
            className="flex items-center gap-2 px-3 py-2 text-[13px] font-semibold text-[#e5e1e4] border border-[#5b403e]/30 bg-[#201f22]/60 hover:bg-[#201f22] hover:border-[#ffb3ad]/40 rounded-lg transition-all duration-200 font-[Geist,sans-serif] ml-1"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            Sign In
          </button>
        )}
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
          <button onClick={() => { setMobileOpen(false); onJoinRoom?.(); }} className="w-full py-2.5 text-center text-[14px] border border-[#27272A] rounded-lg text-[#e5e1e4] hover:bg-[#201f22] transition-colors font-[Geist,sans-serif]">
            Join Room
          </button>
          <button onClick={() => { setMobileOpen(false); onCreateRoom?.(); }} className="w-full py-2.5 text-center text-[14px] font-bold text-white bg-[#ff5451] rounded-lg hover:bg-[#ffb3ad] hover:text-[#68000a] transition-all font-[Geist,sans-serif]">
            Create Party
          </button>

          {isSignedIn ? (
            <div className="flex items-center justify-between px-3 py-2 bg-[#201f22]/40 rounded-lg border border-[#27272A]">
              <span className="text-[13px] text-[#e4beba]">My Account</span>
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: 'w-8 h-8 rounded-full ring-2 ring-[#ff5451]/30',
                  },
                }}
              />
            </div>
          ) : (
            <button
              onClick={() => {
                setMobileOpen(false)
                openSignIn()
              }}
              className="w-full py-2.5 flex items-center justify-center gap-2 border border-[#5b403e]/30 rounded-lg text-[14px] font-semibold text-[#e5e1e4] bg-[#201f22]/60 hover:bg-[#201f22] transition-colors font-[Geist,sans-serif]"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              Sign in with Google
            </button>
          )}
        </motion.div>
      )}
    </nav>
  )
}

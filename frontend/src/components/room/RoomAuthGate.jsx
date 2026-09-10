import { useState } from 'react'
import { Tv, ArrowLeft, CheckCircle2, User } from 'lucide-react'

/**
 * RoomAuthGate — authentication and display name gate for watch rooms.
 *
 * Rendered when a user opens a room link directly:
 * 1. If not authenticated: prompts Google Sign-In via Clerk.
 * 2. If authenticated: allows confirming/customizing their display name prefilled with their Google profile name.
 */
export default function RoomAuthGate({
  roomId,
  roomName,
  isSignedIn,
  user,
  onSignIn,
  onConfirmDisplayName,
  onHome,
  isSubmitting = false,
}) {
  const initialName = user?.fullName || user?.firstName || ''
  const [displayName, setDisplayName] = useState(initialName)
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = displayName.trim()
    if (!trimmed) {
      setError('Please enter a display name.')
      return
    }
    if (trimmed.length < 2) {
      setError('Display name must be at least 2 characters.')
      return
    }
    if (trimmed.length > 30) {
      setError('Display name cannot exceed 30 characters.')
      return
    }
    setError('')
    onConfirmDisplayName(trimmed)
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#131315] text-[#e5e1e4] p-4 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute inset-0 z-0 flex items-center justify-center opacity-25 pointer-events-none">
        <div className="w-[520px] h-[520px] bg-[#ff5451]/15 rounded-full blur-[150px]" />
      </div>

      {/* Main glass card */}
      <div className="relative z-10 w-full max-w-md bg-[#1d1d20]/85 backdrop-blur-xl border border-[#5b403e]/30 rounded-2xl p-8 flex flex-col items-center text-center shadow-2xl">
        {/* Brand header */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ffb3ad]/20 to-[#ff5451]/20 border border-[#ffb3ad]/30 flex items-center justify-center text-[#ff5451]">
            <Tv className="w-5 h-5" />
          </div>
          <span className="font-[Geist,sans-serif] text-[22px] font-bold text-[#ffb3ad] tracking-tight">
            SyncTube
          </span>
        </div>

        {/* Room badge */}
        {roomId && (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#131315] border border-[#5b403e]/40 text-[12px] font-[Geist,sans-serif] text-[#e4beba] mb-5">
            <span className="w-2 h-2 rounded-full bg-[#ff5451] animate-pulse" />
            <span className="max-w-[180px] truncate">{roomName || 'Watch Party'}</span>
            <span className="text-[#e5e1e4] font-mono">#{roomId}</span>
          </div>
        )}

        {!isSignedIn ? (
          /* ============================================================ */
          /* Step 1: Sign in with Google                                   */
          /* ============================================================ */
          <div className="w-full flex flex-col items-center">
            <h2 className="font-[Geist,sans-serif] text-[22px] sm:text-[24px] font-semibold text-[#e5e1e4] tracking-tight mb-2">
              Google Sign-In Required
            </h2>
            <p className="font-[Geist,sans-serif] text-[14px] text-[#c9c5c8] leading-relaxed mb-6 max-w-xs">
              Every participant must sign in with Google to enter watch rooms, sync video playback, and chat in real-time.
            </p>

            <div className="w-full flex flex-col gap-3">
              <button
                id="gate-signin-btn"
                type="button"
                onClick={onSignIn}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#ff5451] to-[#ffb3ad] hover:opacity-95 text-[#131315] font-[Geist,sans-serif] font-bold text-[14px] flex items-center justify-center gap-3 shadow-lg shadow-[#ff5451]/20 transition-all cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Sign in with Google to Join</span>
              </button>

              <button
                id="gate-back-home-btn"
                type="button"
                onClick={onHome}
                className="w-full py-3 px-4 rounded-xl bg-[#131315]/60 hover:bg-[#131315] border border-[#5b403e]/30 text-[#e5e1e4] font-[Geist,sans-serif] font-medium text-[14px] flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 text-[#e4beba]" />
                <span>Back to Home</span>
              </button>
            </div>
          </div>
        ) : (
          /* ============================================================ */
          /* Step 2: Confirm Display Name                                  */
          /* ============================================================ */
          <form onSubmit={handleSubmit} className="w-full flex flex-col items-center">
            <h2 className="font-[Geist,sans-serif] text-[22px] sm:text-[24px] font-semibold text-[#e5e1e4] tracking-tight mb-1">
              Join Watch Party
            </h2>
            <p className="font-[Geist,sans-serif] text-[14px] text-[#c9c5c8] leading-relaxed mb-4">
              Confirm your display name before entering the party.
            </p>

            {/* Authenticated User Pill */}
            <div className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-[#131315]/70 border border-[#5b403e]/30 mb-5 text-left">
              {user?.imageUrl ? (
                <img
                  src={user.imageUrl}
                  alt={user.fullName || 'User'}
                  className="w-7 h-7 rounded-full object-cover ring-1 ring-[#ff5451]/40"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[#ff5451]/20 border border-[#ff5451]/30 flex items-center justify-center text-[#ffb3ad]">
                  <User className="w-4 h-4" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-[#e5e1e4] truncate">
                    {user?.fullName || user?.firstName || 'Google User'}
                  </span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                </div>
                <div className="text-[11px] text-[#e4beba]/70 truncate font-mono">
                  {user?.primaryEmailAddress?.emailAddress || 'Authenticated'}
                </div>
              </div>
            </div>

            {/* Display Name Input */}
            <div className="w-full text-left mb-4">
              <label htmlFor="gate-display-name" className="block text-[12px] font-medium text-[#e4beba] mb-1.5">
                Display Name in Room
              </label>
              <input
                id="gate-display-name"
                type="text"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value)
                  if (error) setError('')
                }}
                maxLength={30}
                placeholder="Your name"
                className="w-full bg-[#131315]/80 border border-[#5b403e]/40 rounded-xl px-4 py-2.5 text-[14px] text-[#e5e1e4] placeholder-[#e4beba]/40 focus:outline-none focus:border-[#ff5451]/60 transition-colors"
                autoFocus
              />
              {error && (
                <p className="text-[12px] text-[#ff5451] mt-1 text-left">{error}</p>
              )}
            </div>

            {/* Actions */}
            <div className="w-full flex flex-col gap-2.5">
              <button
                id="gate-enter-room-btn"
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#ff5451] to-[#ffb3ad] hover:opacity-95 text-[#131315] font-[Geist,sans-serif] font-bold text-[14px] flex items-center justify-center gap-2 shadow-lg shadow-[#ff5451]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-[#131315] border-t-transparent rounded-full animate-spin" />
                    <span>Entering room...</span>
                  </>
                ) : (
                  <span>Enter Watch Party</span>
                )}
              </button>

              <button
                id="gate-cancel-btn"
                type="button"
                onClick={onHome}
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 rounded-xl bg-[#131315]/60 hover:bg-[#131315] border border-[#5b403e]/30 text-[#e4beba] font-[Geist,sans-serif] font-medium text-[13px] flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Home</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Mail, X, Send, AlertCircle, Loader2, CheckCircle2, Clock } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { emitSendEmailInvite } from '../../services/socketService'

/**
 * EmailInviteForm — Compact expandable inline panel inside Chat.
 *
 * Allows room participants to send email invitations via Socket.IO.
 *
 * Features:
 * - Local validation (single recipient, valid RFC 5322 structure)
 * - Double-click prevention & 25s request timeout guard
 * - Live anti-spam cooldown countdown
 * - Socket disconnection awareness
 * - Framer Motion slide-in animation
 */
export default function EmailInviteForm({ roomId, socket, isConnected, onClose }) {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const inputRef = useRef(null)

  // Autofocus input when form mounts
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Live countdown timer for resend cooldown
  useEffect(() => {
    if (cooldown <= 0) return
    const interval = setInterval(() => {
      setCooldown(c => Math.max(0, c - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [cooldown])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (isLoading || cooldown > 0) return

    const trimmed = email.trim()
    setError('')

    // Basic local validation
    if (!trimmed) {
      setError('Please enter an email address.')
      return
    }

    if (/[,;\s]/.test(trimmed)) {
      setError('Please enter only one email address.')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmed)) {
      setError('Please enter a valid email address.')
      return
    }

    if (!isConnected || !socket?.connected) {
      setError('Cannot send invite while disconnected. Reconnecting...')
      return
    }

    setIsLoading(true)

    // Timeout safety guard (25 seconds)
    let isSettled = false
    const timeoutTimer = setTimeout(() => {
      if (!isSettled) {
        isSettled = true
        setIsLoading(false)
        setError('Invitation request timed out. Please try again.')
        toast.error('Invitation timed out.')
      }
    }, 25000)

    emitSendEmailInvite(socket, { roomId, recipientEmail: trimmed }, (response) => {
      if (isSettled) return
      isSettled = true
      clearTimeout(timeoutTimer)
      setIsLoading(false)

      if (response?.success) {
        toast.success(response.message || `Invitation sent to ${trimmed}!`)
        setEmail('')
        setError('')
        setCooldown(0)
        if (typeof onClose === 'function') {
          onClose()
        }
      } else if (response?.code === 'COOLDOWN_ACTIVE') {
        const remaining = response?.remainingSeconds || 15
        setCooldown(remaining)
        setError('')
        toast('Invitation already sent to this address recently.', {
          icon: '✉️',
          duration: 3500,
        })
      } else {
        // Map backend error codes to friendly user-facing messages
        let msg
        switch (response?.code) {
          case 'SMTP_CONFIG_ERROR':
            msg = 'Email invitations are not configured.'
            break
          case 'SMTP_AUTH_ERROR':
          case 'SMTP_DNS_ERROR':
          case 'SMTP_NETWORK_ERROR':
          case 'SMTP_TIMEOUT':
          case 'EMAIL_SENDER_REJECTED':
            msg = 'Email invitations are temporarily unavailable.'
            break
          case 'SMTP_TLS_ERROR':
            msg = 'Email service could not establish a secure connection.'
            break
          case 'EMAIL_REJECTED':
            msg = 'This email address was rejected by the mail server.'
            break
          case 'SMTP_TEMPORARY_FAILURE':
            msg = 'Email service is busy. Please try again shortly.'
            break
          case 'SMTP_PROVIDER_LIMIT':
            msg = 'Email sending limit has been reached. Please try again later.'
            break
          case 'RATE_LIMIT_EXCEEDED':
            msg = 'Too many invitations. Please try again later.'
            break
          case 'UNAUTHORIZED':
            msg = 'You must be an active room participant to send invitations.'
            break
          case 'INVALID_EMAIL':
            msg = response?.message || 'Please enter a valid email address.'
            break
          default:
            msg = 'Could not send invitation. Please try again later.'
            break
        }
        setError(msg)
        toast.error(msg)
      }
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0, y: 10 }}
      animate={{ opacity: 1, height: 'auto', y: 0 }}
      exit={{ opacity: 0, height: 0, y: 10 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="overflow-hidden mb-3"
    >
      <div className="bg-[#1b1a20] border border-[#ff5451]/30 rounded-xl p-3.5 shadow-xl relative backdrop-blur-md">
        {/* Header */}
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-[#ff5451]/10 text-[#ffb3ad]">
              <Mail className="w-3.5 h-3.5" />
            </div>
            <span className="font-[Geist,sans-serif] font-semibold text-[13px] text-[#e5e1e4]">
              Invite via Email
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-[#e4beba]/60 hover:text-[#e5e1e4] p-1 rounded-md hover:bg-[#201f22] transition-colors"
            aria-label="Close invite panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <p className="font-[Inter,sans-serif] text-[12px] text-[#e4beba]/70 mb-3 leading-relaxed">
          We'll send a direct watch party link and room code. No account is required to join.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-2.5">
          <div>
            <input
              ref={inputRef}
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (error) setError('')
                if (cooldown > 0) setCooldown(0)
              }}
              placeholder="friend@example.com"
              disabled={isLoading || !isConnected}
              className="w-full bg-[#0e0e10] border border-[#27272A] focus:border-[#ff5451]/50 rounded-lg px-3 py-2 text-[13px] text-[#e5e1e4] placeholder:text-[#e4beba]/35 focus:outline-none transition-colors disabled:opacity-50"
            />
          </div>

          {/* Cooldown Active Notice */}
          {cooldown > 0 && !error && (
            <div className="flex items-center gap-1.5 text-[12px] text-[#ffb3ad] bg-[#ffb3ad]/10 border border-[#ffb3ad]/20 px-2.5 py-1.5 rounded-lg">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#ffb3ad] flex-shrink-0" />
              <span>Invitation already sent! You can resend in {cooldown}s.</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-1.5 text-[12px] text-[#ffb4ab]">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-[#e4beba]/50 font-[Inter,sans-serif]">
              {!isConnected ? 'Socket offline' : 'Single recipient'}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-2.5 py-1 text-[12px] font-[Geist,sans-serif] text-[#e4beba] hover:text-[#e5e1e4] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || !email.trim() || !isConnected || cooldown > 0}
                className="px-3.5 py-1.5 bg-[#ff5451] hover:bg-[#ffb3ad] text-white hover:text-[#68000a] text-[12px] font-[Geist,sans-serif] font-bold rounded-lg transition-all shadow-md shadow-[#ff5451]/15 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Sending...
                  </>
                ) : cooldown > 0 ? (
                  <>
                    <Clock className="w-3 h-3" />
                    Resend in {cooldown}s
                  </>
                ) : (
                  <>
                    <Send className="w-3 h-3" />
                    Send Invite
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </motion.div>
  )
}

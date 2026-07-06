import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { X, Users } from 'lucide-react'
import Button from '../ui/Button'

/**
 * CreateRoomModal — glass card modal matching Stitch "Create Room Modal" design.
 * Fields: Username, Room Name
 * On submit: calls onSubmit({ username, roomName })
 */
export default function CreateRoomModal({ isOpen, onClose, onSubmit, isLoading }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm()

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    if (isOpen) window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  const submit = (data) => {
    onSubmit(data)
    reset()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              className="glass-floating w-full max-w-sm rounded-xl p-6 shadow-2xl relative overflow-hidden"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Subtle glow accent (from Stitch) */}
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#ffb3ad]/5 rounded-full blur-2xl pointer-events-none" />

              {/* Header */}
              <div className="flex justify-between items-center mb-2 relative z-10">
                <h2 className="font-[Geist,sans-serif] font-semibold text-[24px] leading-[32px] tracking-[-0.01em] text-[#e5e1e4]">
                  Create Room
                </h2>
                <button
                  onClick={onClose}
                  className="p-1.5 text-[#e4beba] hover:text-[#e5e1e4] hover:bg-[#353437]/50 rounded-lg transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="font-[Inter,sans-serif] text-[14px] text-[#e4beba] mb-6 relative z-10">
                Start a new watch party and invite friends.
              </p>

              {/* Form */}
              <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4 relative z-10">
                {/* Username */}
                <div className="flex flex-col gap-1">
                  <label className="font-[Geist,sans-serif] font-medium text-[14px] text-[#e5e1e4]">
                    Username
                  </label>
                  <input
                    id="create-username"
                    type="text"
                    placeholder="Enter your display name"
                    className="bg-[#0e0e10] border border-[#27272A] rounded-lg px-4 py-2.5 font-[Inter,sans-serif] text-[14px] text-[#e5e1e4] placeholder:text-[#e4beba]/40 focus:outline-none focus:border-[#ffb3ad] focus:ring-1 focus:ring-[#ffb3ad]/30 transition-all duration-200"
                    {...register('username', {
                      required: 'Username is required',
                      minLength: { value: 2, message: 'Min 2 characters' },
                      maxLength: { value: 24, message: 'Max 24 characters' },
                    })}
                  />
                  {errors.username && (
                    <span className="text-[12px] text-[#ffb4ab]">{errors.username.message}</span>
                  )}
                </div>

                {/* Room Name */}
                <div className="flex flex-col gap-1">
                  <label className="font-[Geist,sans-serif] font-medium text-[14px] text-[#e5e1e4]">
                    Room Name
                  </label>
                  <input
                    id="create-roomname"
                    type="text"
                    placeholder="e.g., Movie Night"
                    className="bg-[#0e0e10] border border-[#27272A] rounded-lg px-4 py-2.5 font-[Inter,sans-serif] text-[14px] text-[#e5e1e4] placeholder:text-[#e4beba]/40 focus:outline-none focus:border-[#ffb3ad] focus:ring-1 focus:ring-[#ffb3ad]/30 transition-all duration-200"
                    {...register('roomName', {
                      required: 'Room name is required',
                      minLength: { value: 2, message: 'Min 2 characters' },
                      maxLength: { value: 40, message: 'Max 40 characters' },
                    })}
                  />
                  {errors.roomName && (
                    <span className="text-[12px] text-[#ffb4ab]">{errors.roomName.message}</span>
                  )}
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  disabled={isLoading}
                  className="mt-1"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      Creating...
                    </span>
                  ) : (
                    <>
                      <Users className="w-4 h-4" />
                      Create &amp; Join
                    </>
                  )}
                </Button>
              </form>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

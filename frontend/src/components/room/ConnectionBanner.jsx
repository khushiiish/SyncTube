import { AnimatePresence, motion } from 'framer-motion'
import { WifiOff } from 'lucide-react'
import { useSocketContext } from '../../context/SocketContext'

/**
 * ConnectionBanner — fixed bottom banner when socket disconnects.
 * Matches the Stitch "Connection Lost" overlay design.
 * Auto-hides when reconnected.
 */
export default function ConnectionBanner() {
  const { isConnected, connectionError } = useSocketContext()
  const showBanner = !isConnected || connectionError

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          className="fixed bottom-6 right-6 z-50"
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.25 }}
        >
          <div className="glass-floating border border-[#ffb4ab]/20 rounded-lg p-4 shadow-2xl flex items-center gap-4 w-72 relative overflow-hidden">
            {/* Shimmer */}
            <div className="absolute inset-0 animate-shimmer opacity-20 pointer-events-none" />

            {/* Pulsing red dot */}
            <div className="w-3 h-3 rounded-full bg-[#ffb4ab] animate-pulse-red flex-shrink-0" />

            <div className="flex flex-col">
              <span className="font-[Geist,sans-serif] font-medium text-[14px] text-[#ffb4ab]">
                Connection Lost
              </span>
              <span className="font-[Inter,sans-serif] text-[12px] text-[#e4beba]">
                Reconnecting automatically...
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

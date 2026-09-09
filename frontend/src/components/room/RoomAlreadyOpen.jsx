import { ArrowRightLeft, Home, Layers } from 'lucide-react'

/**
 * RoomAlreadyOpen — Shown when the user opens the same room in a second browser tab.
 *
 * Implements the Google Meet-like single-active-tab takeover flow:
 * - Tab A remains fully connected and watching.
 * - Tab B presents this screen without mounting room components.
 * - Clicking "Switch here" triggers an authoritative server takeover.
 * - After takeover succeeds, Tab B takes control and Tab A seamlessly navigates Home.
 *
 * @param {Object} props
 * @param {string} props.roomId
 * @param {string} [props.roomName]
 * @param {boolean} props.isSwitching
 * @param {() => void} props.onSwitch
 * @param {() => void} props.onHome
 */
export default function RoomAlreadyOpen({
  roomId,
  roomName,
  isSwitching,
  onSwitch,
  onHome,
}) {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#131315] text-[#e5e1e4] p-4 relative overflow-hidden">
      {/* Subtle background ambient blur */}
      <div className="absolute inset-0 z-0 flex items-center justify-center opacity-25 pointer-events-none">
        <div className="w-[500px] h-[500px] bg-[#ffb3ad]/15 rounded-full blur-[140px]" />
      </div>

      {/* Main glass card */}
      <div className="relative z-10 w-full max-w-md bg-[#1d1d20]/80 backdrop-blur-xl border border-[#5b403e]/30 rounded-2xl p-8 flex flex-col items-center text-center shadow-2xl">
        {/* Brand header */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ffb3ad]/20 to-[#ff5451]/20 border border-[#ffb3ad]/30 flex items-center justify-center text-[#ffb3ad]">
            <Layers className="w-5 h-5" />
          </div>
          <span className="font-[Geist,sans-serif] text-[22px] font-bold text-[#ffb3ad] tracking-tight">
            SyncTube
          </span>
        </div>

        {/* Room badge */}
        {roomId && (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#131315] border border-[#5b403e]/40 text-[12px] font-[Geist,sans-serif] text-[#e4beba] mb-5">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            <span>{roomName || 'Watch Room'}</span>
            <span className="text-[#e5e1e4] font-mono">#{roomId}</span>
          </div>
        )}

        {/* Title & Description */}
        <h2 className="font-[Geist,sans-serif] text-[22px] sm:text-[24px] font-semibold text-[#e5e1e4] tracking-tight mb-2">
          Room already open elsewhere
        </h2>
        <p className="font-[Geist,sans-serif] text-[14px] text-[#c9c5c8] leading-relaxed mb-8 max-w-xs">
          You&apos;re currently watching this room in another tab or window. Would you like to switch playback to this tab?
        </p>

        {/* Actions */}
        <div className="w-full flex flex-col gap-3">
          <button
            id="switch-here-btn"
            type="button"
            onClick={onSwitch}
            disabled={isSwitching}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#ff5451] to-[#ffb3ad] hover:opacity-95 text-[#131315] font-[Geist,sans-serif] font-semibold text-[14px] flex items-center justify-center gap-2 shadow-lg shadow-[#ff5451]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSwitching ? (
              <>
                <span className="w-4 h-4 border-2 border-[#131315] border-t-transparent rounded-full animate-spin" />
                <span>Switching playback...</span>
              </>
            ) : (
              <>
                <ArrowRightLeft className="w-4 h-4" />
                <span>Switch here</span>
              </>
            )}
          </button>

          <button
            id="back-to-home-btn"
            type="button"
            onClick={onHome}
            disabled={isSwitching}
            className="w-full py-3 px-4 rounded-xl bg-[#131315]/60 hover:bg-[#131315] border border-[#5b403e]/30 text-[#e5e1e4] font-[Geist,sans-serif] font-medium text-[14px] flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <Home className="w-4 h-4 text-[#e4beba]" />
            <span>Back to Home</span>
          </button>
        </div>
      </div>
    </div>
  )
}

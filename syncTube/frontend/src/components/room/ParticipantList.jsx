import { AnimatePresence } from 'framer-motion'
import { Users } from 'lucide-react'
import ParticipantCard from './ParticipantCard'
import { useRoomContext } from '../../context/RoomContext'

/**
 * ParticipantList — scrollable list of all room participants.
 * Ordered: host first, then mods, then participants.
 */
export default function ParticipantList() {
  const { participants } = useRoomContext()

  const sorted = [...participants].sort((a, b) => {
    const order = { host: 0, moderator: 1, participant: 2 }
    return (order[a.role] ?? 3) - (order[b.role] ?? 3)
  })

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2">
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-[#e4beba]/40">
          <Users className="w-10 h-10" />
          <p className="font-[Inter,sans-serif] text-[14px] text-center">
            No participants yet
          </p>
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          {sorted.map(p => (
            <ParticipantCard key={p.socketId} participant={p} />
          ))}
        </AnimatePresence>
      )}
    </div>
  )
}

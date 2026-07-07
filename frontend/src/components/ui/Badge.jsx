/**
 * Badge — role indicator pill (HOST / MOD / PARTICIPANT).
 * Exact styles match the Stitch design reference.
 */
export default function Badge({ role }) {
  const styles = {
    host: 'bg-[#ff5451] text-[#5c0008] border border-[#ff5451]/30',
    moderator: 'bg-[#571bc1]/30 text-[#d0bcff] border border-[#571bc1]/30',
    participant: 'bg-[#353437]/60 text-[#e4beba] border border-[#5b403e]/20',
    viewer: 'bg-[#005f73]/20 text-[#94d2bd] border border-[#005f73]/30',
  }

  const labels = {
    host: 'Host',
    moderator: 'Mod',
    participant: 'Participant',
    viewer: 'Viewer',
  }

  if (!labels[role]) return null

  return (
    <span
      className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-bold tracking-wider ${styles[role]}`}
    >
      {labels[role]}
    </span>
  )
}

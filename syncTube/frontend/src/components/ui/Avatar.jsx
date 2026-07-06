/**
 * Avatar — circular user avatar with online/offline status dot.
 * Generates initials-based placeholder when no image src is provided.
 */
export default function Avatar({ username = '', size = 'md', status = 'online', bordered = false }) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  }

  const dotSize = {
    sm: 'w-2.5 h-2.5',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4',
  }

  const statusColor = {
    online: 'bg-green-500',
    buffering: 'bg-yellow-500',
    offline: 'bg-gray-500',
  }

  const borderColor = {
    host: 'border-[#ffb3ad]',
    default: 'border-[#5b403e]/50',
  }

  const initials = username
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  // Deterministic color from username string
  const colors = [
    'from-red-500 to-pink-500',
    'from-violet-500 to-purple-500',
    'from-blue-500 to-cyan-500',
    'from-emerald-500 to-teal-500',
    'from-orange-500 to-amber-500',
  ]
  const colorIndex = username.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length

  return (
    <div className="relative flex-shrink-0">
      <div
        className={`
          ${sizeClasses[size]}
          rounded-full overflow-hidden flex items-center justify-center
          bg-gradient-to-br ${colors[colorIndex]}
          font-bold text-white font-[Geist,sans-serif]
          ${bordered ? `border-2 ${borderColor.default}` : ''}
        `}
      >
        {initials}
      </div>

      {/* Online status dot */}
      <div
        className={`
          absolute -bottom-0.5 -right-0.5
          ${dotSize[size]}
          ${statusColor[status]}
          rounded-full border-2 border-[#201f22]
        `}
      />
    </div>
  )
}

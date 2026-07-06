import { motion } from 'framer-motion'
import { Zap, ShieldCheck, Lock, Radio, Users } from 'lucide-react'

/**
 * FeaturesGrid — 5-card bento grid.
 * Directly translates the Stitch "Engineered for Performance" section.
 * Large card (col-span-2): Real-time Sync
 * 4 smaller cards: WebSocket, Role Control, Secure Rooms, Zero-Delay
 */

const features = [
  {
    id: 'sync',
    icon: Radio,
    iconColor: 'text-[#ffb3ad]',
    iconBg: 'bg-[#ffb3ad]/10 border-[#ffb3ad]/10',
    title: 'Real-time Sync',
    description: 'Sub-millisecond frame synchronization across all connected clients. When you pause, everyone pauses. Instantaneously.',
    large: true,
    gradient: 'from-[#ffb3ad]/20 via-transparent to-transparent',
  },
  {
    id: 'websocket',
    icon: Zap,
    iconColor: 'text-[#d0bcff]',
    iconBg: 'bg-[#571bc1]/20 border-[#571bc1]/10',
    title: 'WebSocket Powered',
    description: 'Persistent bi-directional connections ensure zero polling overhead and maximum efficiency.',
  },
  {
    id: 'roles',
    icon: ShieldCheck,
    iconColor: 'text-[#ffb3ad]',
    iconBg: 'bg-[#ffb3ad]/10 border-[#ffb3ad]/10',
    title: 'Role-Based Control',
    description: 'Assign hosts, moderators, and viewers. Maintain precise control over playback.',
  },
  {
    id: 'secure',
    icon: Lock,
    iconColor: 'text-[#adc6ff]',
    iconBg: 'bg-[#4d8eff]/20 border-[#adc6ff]/10',
    title: 'Secure Rooms',
    description: 'Transient room IDs ensure your watch party stays private with unique invite codes.',
  },
  {
    id: 'chat',
    icon: Users,
    iconColor: 'text-[#e5e1e4]',
    iconBg: 'bg-[#353437] border-[#5b403e]/30',
    title: 'Participant Panel',
    description: 'See who\'s in the room, their roles, and sync status. All in a sleek side panel.',
  },
]

export default function FeaturesGrid() {
  return (
    <section id="features" className="max-w-[1440px] mx-auto px-4 md:px-6 py-24">
      {/* Header */}
      <motion.div
        className="text-center mb-12"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="font-[Geist,sans-serif] font-semibold text-[30px] leading-[36px] tracking-[-0.02em] text-[#e5e1e4] mb-2">
          Engineered for Performance
        </h2>
        <p className="font-[Inter,sans-serif] text-[16px] text-[#e4beba]">
          The technical rigor of dev tools meets immersive streaming.
        </p>
      </motion.div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {features.map((feature, i) => {
          const Icon = feature.icon
          return (
            <motion.div
              key={feature.id}
              className={`
                relative group overflow-hidden rounded-xl
                bg-[#201f22]/60 backdrop-blur-xl
                border border-[#5b403e]/20
                p-6 flex flex-col
                transition-all duration-200
                hover:border-[#5b403e]/50 hover:-translate-y-1
                ${feature.large ? 'md:col-span-2 min-h-[280px] justify-end' : 'justify-between'}
              `}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
            >
              {/* Large card gradient overlay */}
              {feature.large && (
                <div className="absolute inset-0 bg-gradient-to-t from-[#353437]/90 to-transparent z-10" />
              )}

              {/* Icon */}
              <div className={`relative z-20 p-2 w-max rounded-lg border ${feature.iconBg} mb-4 ${feature.large ? '' : ''}`}>
                <Icon className={`w-5 h-5 ${feature.iconColor}`} />
              </div>

              {/* Text */}
              <div className="relative z-20">
                <h3 className="font-[Geist,sans-serif] font-bold text-[14px] text-[#e5e1e4] mb-1.5">
                  {feature.title}
                </h3>
                <p className="font-[Inter,sans-serif] text-[14px] leading-[20px] text-[#e4beba] max-w-md">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}

/**
 * Button — primary / secondary / ghost / danger variants.
 * Exact styles from Stitch design spec.
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  className = '',
  ...props
}) {
  const base = `
    inline-flex items-center justify-center gap-2 font-[Geist,sans-serif]
    font-medium tracking-wide rounded-lg
    transition-all duration-200 cursor-pointer
    disabled:opacity-40 disabled:cursor-not-allowed
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffb3ad]/50
  `

  const sizes = {
    sm:  'px-3 py-1.5 text-[13px]',
    md:  'px-5 py-2.5 text-[14px]',
    lg:  'px-7 py-3   text-[15px]',
  }

  const variants = {
    primary: `
      bg-[#ff5451] text-white border border-transparent
      hover:bg-[#ffb3ad] hover:text-[#68000a]
      shadow-[0_0_15px_rgba(255,84,81,0.2)]
      hover:shadow-[0_0_20px_rgba(255,84,81,0.4)]
    `,
    secondary: `
      bg-transparent text-[#e5e1e4] border border-[#27272A]
      hover:bg-[#201f22] hover:border-[#5b403e]
    `,
    ghost: `
      bg-transparent text-[#e4beba] border border-transparent
      hover:bg-[#353437]/50 hover:text-[#e5e1e4]
    `,
    danger: `
      bg-[#93000a]/20 text-[#ffb4ab] border border-[#93000a]/30
      hover:bg-[#93000a]/40
    `,
    invite: `
      bg-[#ffb3ad]/10 text-[#ffb3ad] border border-[#ffb3ad]/20
      hover:bg-[#ffb3ad]/20 font-semibold
    `,
  }

  return (
    <button
      className={`
        ${base}
        ${sizes[size]}
        ${variants[variant]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}

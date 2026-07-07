/**
 * Footer — matches the Stitch landing page footer.
 */
export default function Footer() {
  return (
    <footer className="w-full py-10 px-6 flex flex-col md:flex-row justify-between items-center bg-[#0e0e10] border-t border-[#5b403e]/10">
      <div className="flex flex-col md:flex-row items-center gap-4 mb-6 md:mb-0">
        <span className="font-[Geist,sans-serif] font-bold text-[#e5e1e4] text-[14px]">SyncTube</span>
        <span className="text-[#e4beba] hidden md:inline text-sm">|</span>
        <span className="text-[#e4beba] text-[14px] text-center md:text-left">
          © {new Date().getFullYear()} SyncTube. Precision Entertainment.
        </span>
      </div>
      <div className="flex flex-wrap justify-center gap-4 md:gap-6">
        {['Terms', 'Privacy', 'Tech Stack', 'Twitter', 'GitHub'].map(link => {
          const isGitHub = link === 'GitHub'
          return (
            <a
              key={link}
              href={isGitHub ? "https://github.com/khushiiish/SyncTube" : "#"}
              target={isGitHub ? "_blank" : undefined}
              rel={isGitHub ? "noopener noreferrer" : undefined}
              className="text-[14px] text-[#e4beba] hover:text-[#ffb3ad] transition-colors opacity-80 hover:opacity-100"
            >
              {link}
            </a>
          )
        })}
      </div>
    </footer>
  )
}

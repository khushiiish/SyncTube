import { Component } from 'react'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'

/**
 * ErrorBoundary — Catches render and lifecycle exceptions in React subtrees.
 *
 * Prevents blank black screens by rendering an intuitive recovery card
 * with "Try Again" and "Back to Home" options matching SyncTube's dark UI.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled render error caught by ErrorBoundary:', error, errorInfo)
    this.setState({ error, errorInfo })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#131315] text-[#e5e1e4] p-4 relative overflow-hidden">
          {/* Ambient background glow */}
          <div className="absolute inset-0 z-0 flex items-center justify-center opacity-20 pointer-events-none">
            <div className="w-[450px] h-[450px] bg-[#ff5451]/15 rounded-full blur-[140px]" />
          </div>

          <div className="relative z-10 max-w-md w-full bg-[#1d1d20]/90 backdrop-blur-xl border border-[#5b403e]/30 rounded-2xl p-6 sm:p-8 text-center shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-[#ff5451]/10 border border-[#ff5451]/20 text-[#ff5451] flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>

            <h2 className="font-[Geist,sans-serif] text-[20px] font-bold text-[#e5e1e4] tracking-tight mb-2">
              Unable to load this room
            </h2>

            <p className="font-[Inter,sans-serif] text-[14px] text-[#c9c5c8] mb-6 leading-relaxed">
              Something went wrong while displaying this view. Please try again or return to the landing page.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                id="error-boundary-retry-btn"
                type="button"
                onClick={this.handleReset}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#ff5451] to-[#ffb3ad] text-[#131315] font-[Geist,sans-serif] font-semibold text-[14px] flex items-center justify-center gap-2 shadow-lg shadow-[#ff5451]/20 hover:opacity-95 cursor-pointer transition-all active:scale-98"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Try Again</span>
              </button>

              <button
                id="error-boundary-home-btn"
                type="button"
                onClick={this.handleGoHome}
                className="px-5 py-2.5 rounded-xl bg-[#131315] border border-[#5b403e]/40 text-[#e5e1e4] font-[Geist,sans-serif] font-medium text-[14px] flex items-center justify-center gap-2 hover:bg-[#252428] cursor-pointer transition-colors active:scale-98"
              >
                <Home className="w-4 h-4" />
                <span>Back to Home</span>
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

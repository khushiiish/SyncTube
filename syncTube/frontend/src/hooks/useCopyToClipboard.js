import { useState, useCallback } from 'react'

/**
 * useCopyToClipboard — copies text and tracks copied state.
 * Resets after `resetMs` milliseconds.
 */
export default function useCopyToClipboard(resetMs = 2000) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), resetMs)
      return true
    } catch {
      return false
    }
  }, [resetMs])

  return { copied, copy }
}

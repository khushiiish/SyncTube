function formatAudioDuration(seconds) {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) {
    return '0:00'
  }
  const totalSecs = Math.round(seconds)
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

module.exports = { formatAudioDuration }

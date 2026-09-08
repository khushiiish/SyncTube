/**
 * escapeHtml — safely escapes dynamic user text for embedding in HTML emails.
 * Prevents HTML injection in email templates.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

module.exports = { escapeHtml }

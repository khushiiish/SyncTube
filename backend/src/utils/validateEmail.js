/**
 * validateEmail — conservative validation for single recipient email address.
 *
 * Requirements:
 * - Single recipient only (rejects commas, semicolons, spaces)
 * - Maximum 254 characters (RFC 5321 limit)
 * - Must match valid email structure user@domain.tld
 *
 * @param {string} email
 * @returns {{ valid: boolean, normalizedEmail?: string, error?: string }}
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email address is required.' }
  }

  const trimmed = email.trim()

  if (trimmed.length === 0) {
    return { valid: false, error: 'Email address cannot be empty.' }
  }

  if (trimmed.length > 254) {
    return { valid: false, error: 'Email address is too long (max 254 characters).' }
  }

  // Reject multiple recipients or delimiter characters
  if (/[,;\s\r\n\t]/.test(trimmed)) {
    return { valid: false, error: 'Please enter a single email address.' }
  }

  // Standard email format regex
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: 'Please enter a valid email address.' }
  }

  return {
    valid: true,
    normalizedEmail: trimmed.toLowerCase(),
  }
}

module.exports = { validateEmail }

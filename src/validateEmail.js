/**
 * Validates an email address using regex pattern matching.
 * 
 * Checks for basic email format: localpart@domain.tld
 * - Local part: alphanumeric characters, dots, hyphens, underscores
 * - @ symbol required
 * - Domain: alphanumeric characters, dots, hyphens
 * - TLD: at least 2 characters
 * 
 * @param {string} email - The email address to validate
 * @returns {boolean} True if valid email format, false otherwise
 * 
 * @example
 * validateEmail('user@example.com') // returns true
 * validateEmail('invalid-email')    // returns false
 * validateEmail(null)               // returns false
 */
export default function validateEmail(email) {
  // Handle edge cases: null, undefined, non-string inputs
  if (email == null || typeof email !== 'string') {
    return false;
  }

  // Regex pattern for basic email validation
  // Pattern breakdown:
  // ^[\w.-]+       - Local part: word chars, dots, hyphens (start of string)
  // @              - Required @ symbol
  // [\w.-]+        - Domain: word chars, dots, hyphens
  // \.             - Required dot before TLD
  // [a-zA-Z]{2,}$  - TLD: at least 2 letters (end of string)
  const emailRegex = /^[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}$/;

  return emailRegex.test(email);
}

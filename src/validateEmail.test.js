import validateEmail from './validateEmail.js';

describe('validateEmail', () => {
  describe('valid email addresses', () => {
    test('should return true for standard email format', () => {
      expect(validateEmail('user@example.com')).toBe(true);
    });

    test('should return true for email with subdomain', () => {
      expect(validateEmail('user@mail.example.com')).toBe(true);
    });

    test('should return true for email with dots in local part', () => {
      expect(validateEmail('first.last@example.com')).toBe(true);
    });

    test('should return true for email with hyphens in local part', () => {
      expect(validateEmail('user-name@example.com')).toBe(true);
    });

    test('should return true for email with underscores in local part', () => {
      expect(validateEmail('user_name@example.com')).toBe(true);
    });

    test('should return true for email with numbers', () => {
      expect(validateEmail('user123@example456.com')).toBe(true);
    });

    test('should return true for email with longer TLD', () => {
      expect(validateEmail('user@example.technology')).toBe(true);
    });
  });

  describe('invalid email addresses', () => {
    test('should return false for email without @ symbol', () => {
      expect(validateEmail('userexample.com')).toBe(false);
    });

    test('should return false for email without domain', () => {
      expect(validateEmail('user@')).toBe(false);
    });

    test('should return false for email without local part', () => {
      expect(validateEmail('@example.com')).toBe(false);
    });

    test('should return false for email without TLD', () => {
      expect(validateEmail('user@example')).toBe(false);
    });

    test('should return false for email with single character TLD', () => {
      expect(validateEmail('user@example.c')).toBe(false);
    });

    test('should return false for email with spaces', () => {
      expect(validateEmail('user name@example.com')).toBe(false);
    });

    test('should return false for empty string', () => {
      expect(validateEmail('')).toBe(false);
    });

    test('should return false for multiple @ symbols', () => {
      expect(validateEmail('user@@example.com')).toBe(false);
    });
  });

  describe('edge cases', () => {
    test('should return false for null input', () => {
      expect(validateEmail(null)).toBe(false);
    });

    test('should return false for undefined input', () => {
      expect(validateEmail(undefined)).toBe(false);
    });

    test('should return false for number input', () => {
      expect(validateEmail(12345)).toBe(false);
    });

    test('should return false for boolean input', () => {
      expect(validateEmail(true)).toBe(false);
    });

    test('should return false for object input', () => {
      expect(validateEmail({})).toBe(false);
    });

    test('should return false for array input', () => {
      expect(validateEmail([])).toBe(false);
    });
  });
});

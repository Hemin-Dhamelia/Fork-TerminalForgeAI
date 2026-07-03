/**
 * Unit tests for validateEmail function
 * Uses Node.js built-in assert module
 * Run with: node tests/validateEmail.test.js
 */

import assert from 'assert';
import validateEmail from '../src/validateEmail.js';

let totalTests = 0;
let passedTests = 0;

/**
 * Test runner helper
 */
function test(description, testFn) {
  totalTests++;
  try {
    testFn();
    passedTests++;
    console.log(`✓ ${description}`);
  } catch (error) {
    console.error(`✗ ${description}`);
    console.error(`  ${error.message}`);
  }
}

console.log('Running validateEmail tests...\n');

// ========================================
// VALID EMAIL TESTS
// ========================================
console.log('=== Valid Email Tests ===');

test('should accept simple@example.com', () => {
  assert.strictEqual(
    validateEmail('simple@example.com'),
    true,
    'simple@example.com should be valid'
  );
});

test('should accept user.name@domain.co.uk', () => {
  assert.strictEqual(
    validateEmail('user.name@domain.co.uk'),
    true,
    'user.name@domain.co.uk should be valid'
  );
});

test('should accept user+tag@example.org', () => {
  assert.strictEqual(
    validateEmail('user+tag@example.org'),
    true,
    'user+tag@example.org should be valid'
  );
});

test('should accept email with underscore: user_name@example.com', () => {
  assert.strictEqual(
    validateEmail('user_name@example.com'),
    true,
    'user_name@example.com should be valid'
  );
});

test('should accept email with hyphen: user-name@example.com', () => {
  assert.strictEqual(
    validateEmail('user-name@example.com'),
    true,
    'user-name@example.com should be valid'
  );
});

test('should accept email with numbers: user123@example456.com', () => {
  assert.strictEqual(
    validateEmail('user123@example456.com'),
    true,
    'user123@example456.com should be valid'
  );
});

// ========================================
// INVALID EMAIL TESTS - MISSING PARTS
// ========================================
console.log('\n=== Invalid Email Tests (Missing Parts) ===');

test('should reject email missing @ symbol', () => {
  assert.strictEqual(
    validateEmail('userexample.com'),
    false,
    'email without @ should be invalid'
  );
});

test('should reject email missing domain', () => {
  assert.strictEqual(
    validateEmail('user@'),
    false,
    'email without domain should be invalid'
  );
});

test('should reject email missing TLD', () => {
  assert.strictEqual(
    validateEmail('user@domain'),
    false,
    'email without TLD should be invalid'
  );
});

test('should reject email missing local part', () => {
  assert.strictEqual(
    validateEmail('@example.com'),
    false,
    'email without local part should be invalid'
  );
});

// ========================================
// INVALID EMAIL TESTS - MALFORMED
// ========================================
console.log('\n=== Invalid Email Tests (Malformed) ===');

test('should reject email with multiple @ symbols', () => {
  assert.strictEqual(
    validateEmail('user@@example.com'),
    false,
    'email with multiple @ symbols should be invalid'
  );
});

test('should reject email with @ in middle of @', () => {
  assert.strictEqual(
    validateEmail('user@domain@example.com'),
    false,
    'email with multiple @ symbols should be invalid'
  );
});

test('should reject email with spaces', () => {
  assert.strictEqual(
    validateEmail('user name@example.com'),
    false,
    'email with spaces should be invalid'
  );
});

test('should reject email with space before @', () => {
  assert.strictEqual(
    validateEmail('user @example.com'),
    false,
    'email with space before @ should be invalid'
  );
});

test('should reject email with space after @', () => {
  assert.strictEqual(
    validateEmail('user@ example.com'),
    false,
    'email with space after @ should be invalid'
  );
});

test('should reject email with special chars in local part: user#name@example.com', () => {
  assert.strictEqual(
    validateEmail('user#name@example.com'),
    false,
    'email with # in local part should be invalid'
  );
});

test('should reject email with special chars: user$@example.com', () => {
  assert.strictEqual(
    validateEmail('user$@example.com'),
    false,
    'email with $ should be invalid'
  );
});

test('should reject email with special chars: user*@example.com', () => {
  assert.strictEqual(
    validateEmail('user*@example.com'),
    false,
    'email with * should be invalid'
  );
});

test('should reject email with parentheses: user(name)@example.com', () => {
  assert.strictEqual(
    validateEmail('user(name)@example.com'),
    false,
    'email with parentheses should be invalid'
  );
});

test('should reject email with TLD too short: user@example.c', () => {
  assert.strictEqual(
    validateEmail('user@example.c'),
    false,
    'email with single-char TLD should be invalid'
  );
});

test('should reject email starting with dot: .user@example.com', () => {
  assert.strictEqual(
    validateEmail('.user@example.com'),
    false,
    'email starting with dot should be invalid'
  );
});

test('should reject email ending with dot before @: user.@example.com', () => {
  assert.strictEqual(
    validateEmail('user.@example.com'),
    false,
    'email ending with dot before @ should be invalid'
  );
});

// ========================================
// EDGE CASE TESTS
// ========================================
console.log('\n=== Edge Case Tests ===');

test('should reject null input', () => {
  assert.strictEqual(
    validateEmail(null),
    false,
    'null should return false'
  );
});

test('should reject undefined input', () => {
  assert.strictEqual(
    validateEmail(undefined),
    false,
    'undefined should return false'
  );
});

test('should reject empty string', () => {
  assert.strictEqual(
    validateEmail(''),
    false,
    'empty string should return false'
  );
});

test('should reject number input', () => {
  assert.strictEqual(
    validateEmail(123),
    false,
    'number input should return false'
  );
});

test('should reject object input', () => {
  assert.strictEqual(
    validateEmail({}),
    false,
    'object input should return false'
  );
});

test('should reject array input', () => {
  assert.strictEqual(
    validateEmail([]),
    false,
    'array input should return false'
  );
});

test('should reject boolean input (true)', () => {
  assert.strictEqual(
    validateEmail(true),
    false,
    'boolean true should return false'
  );
});

test('should reject boolean input (false)', () => {
  assert.strictEqual(
    validateEmail(false),
    false,
    'boolean false should return false'
  );
});

test('should reject whitespace-only string', () => {
  assert.strictEqual(
    validateEmail('   '),
    false,
    'whitespace-only string should return false'
  );
});

test('should reject email with leading whitespace', () => {
  assert.strictEqual(
    validateEmail(' user@example.com'),
    false,
    'email with leading whitespace should return false'
  );
});

test('should reject email with trailing whitespace', () => {
  assert.strictEqual(
    validateEmail('user@example.com '),
    false,
    'email with trailing whitespace should return false'
  );
});

// ========================================
// TEST SUMMARY
// ========================================
console.log('\n=== Test Summary ===');
console.log(`${passedTests} tests passed / ${totalTests} total`);

if (passedTests === totalTests) {
  console.log('\n✓ All tests passed!');
  process.exit(0);
} else {
  console.log(`\n✗ ${totalTests - passedTests} test(s) failed`);
  process.exit(1);
}

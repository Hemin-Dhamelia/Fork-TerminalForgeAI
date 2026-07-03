/**
 * QA Test Suite for greet.js
 * Task: task-greet-qa-001
 * Tester: QA Engineer (Terminal 3)
 */

const { greet } = require('../greet.js');

console.log('========================================');
console.log('QA VALIDATION TEST: greet.js');
console.log('========================================\n');

let passed = 0;
let failed = 0;
const results = [];

// Test Case 1: greet('World')
console.log('TEST 1: greet("World")');
try {
  const result = greet('World');
  const expected = 'Hello, World!';
  
  console.log(`  Input: "World"`);
  console.log(`  Expected: "${expected}"`);
  console.log(`  Actual: "${result}"`);
  
  if (result === expected) {
    console.log('  ✓ PASS\n');
    passed++;
    results.push({ test: 'greet("World")', status: 'PASS', expected, actual: result });
  } else {
    console.log('  ✗ FAIL - Output mismatch\n');
    failed++;
    results.push({ test: 'greet("World")', status: 'FAIL', expected, actual: result });
  }
} catch (error) {
  console.log(`  ✗ FAIL - Exception: ${error.message}\n`);
  failed++;
  results.push({ test: 'greet("World")', status: 'FAIL', error: error.message });
}

// Test Case 2: greet('') - Edge case: empty string
console.log('TEST 2: greet("") - Edge case: empty string');
try {
  const result = greet('');
  const expected = 'Hello, !';
  
  console.log(`  Input: ""`);
  console.log(`  Expected: "${expected}"`);
  console.log(`  Actual: "${result}"`);
  
  if (result === expected) {
    console.log('  ✓ PASS\n');
    passed++;
    results.push({ test: 'greet("")', status: 'PASS', expected, actual: result });
  } else {
    console.log('  ✗ FAIL - Output mismatch\n');
    failed++;
    results.push({ test: 'greet("")', status: 'FAIL', expected, actual: result });
  }
} catch (error) {
  console.log(`  ✗ FAIL - Exception: ${error.message}\n`);
  failed++;
  results.push({ test: 'greet("")', status: 'FAIL', error: error.message });
}

// Test Case 3: greet('Alice')
console.log('TEST 3: greet("Alice")');
try {
  const result = greet('Alice');
  const expected = 'Hello, Alice!';
  
  console.log(`  Input: "Alice"`);
  console.log(`  Expected: "${expected}"`);
  console.log(`  Actual: "${result}"`);
  
  if (result === expected) {
    console.log('  ✓ PASS\n');
    passed++;
    results.push({ test: 'greet("Alice")', status: 'PASS', expected, actual: result });
  } else {
    console.log('  ✗ FAIL - Output mismatch\n');
    failed++;
    results.push({ test: 'greet("Alice")', status: 'FAIL', expected, actual: result });
  }
} catch (error) {
  console.log(`  ✗ FAIL - Exception: ${error.message}\n`);
  failed++;
  results.push({ test: 'greet("Alice")', status: 'FAIL', error: error.message });
}

// Summary
console.log('========================================');
console.log('TEST SUMMARY');
console.log('========================================');
console.log(`Total Tests: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
console.log('========================================\n');

// Export results for report generation
module.exports = { results, passed, failed };

// Exit with appropriate code
process.exit(failed > 0 ? 1 : 0);

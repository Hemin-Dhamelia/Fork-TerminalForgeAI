/**
 * Test suite for greet() function
 * Task: task-g002
 */

const greet = require('../greet.js');

console.log('=== Testing greet() function ===\n');

let passed = 0;
let failed = 0;

// Test 1: greet('World')
const test1 = greet('World');
const expected1 = 'Hello, World!';
if (test1 === expected1) {
  console.log('✓ Test 1 PASSED: greet(\'World\') returns \'Hello, World!\'');
  passed++;
} else {
  console.log(`✗ Test 1 FAILED: greet('World')`);
  console.log(`  Expected: '${expected1}'`);
  console.log(`  Actual:   '${test1}'`);
  failed++;
}

// Test 2: greet('Alice')
const test2 = greet('Alice');
const expected2 = 'Hello, Alice!';
if (test2 === expected2) {
  console.log('✓ Test 2 PASSED: greet(\'Alice\') returns \'Hello, Alice!\'');
  passed++;
} else {
  console.log(`✗ Test 2 FAILED: greet('Alice')`);
  console.log(`  Expected: '${expected2}'`);
  console.log(`  Actual:   '${test2}'`);
  failed++;
}

// Test 3: greet('')
const test3 = greet('');
const expected3 = 'Hello, !';
if (test3 === expected3) {
  console.log('✓ Test 3 PASSED: greet(\'\') returns \'Hello, !\'');
  passed++;
} else {
  console.log(`✗ Test 3 FAILED: greet('')`);
  console.log(`  Expected: '${expected3}'`);
  console.log(`  Actual:   '${test3}'`);
  failed++;
}

// Summary
console.log(`\n=== Test Summary ===`);
console.log(`Passed: ${passed}/3`);
console.log(`Failed: ${failed}/3`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\n✓ All tests passed!');
  process.exit(0);
}

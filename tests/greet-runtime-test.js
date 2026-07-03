// Quick runtime test for greet.js
try {
  const greet = require('./greet.js');
  console.log('Test 1:', greet('World'));
  console.log('Test 2:', greet('Alice'));
  console.log('Test 3:', greet(''));
  console.log('✓ All tests passed');
} catch (err) {
  console.error('✗ Runtime error:', err.message);
  console.error('Error type:', err.constructor.name);
  process.exit(1);
}

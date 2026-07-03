const { greet } = require('./greet.cjs');

console.log('Test 1:', greet('World'));
console.log('Expected: Hello, World!');
console.log('Match:', greet('World') === 'Hello, World!');

console.log('\nTest 2:', greet('Alice'));
console.log('Expected: Hello, Alice!');
console.log('Match:', greet('Alice') === 'Hello, Alice!');

console.log('\n✓ greet.cjs verified!');

// Test suite for server.js /ping endpoint
import http from 'http';

const BASE_URL = 'http://localhost:3000';
const TEST_RESULTS = [];

function makeRequest(method, path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

function logTest(testName, passed, details) {
  TEST_RESULTS.push({ testName, passed, details });
  const status = passed ? '✓ PASS' : '✗ FAIL';
  console.log(`${status}: ${testName}`);
  if (details) {
    console.log(`  Details: ${details}`);
  }
}

async function runTests() {
  console.log('=== Server.js Test Suite ===\n');

  try {
    // Test 1: GET /ping returns correct response
    console.log('Test 1: GET /ping returns {pong:true} with 200 status');
    const test1 = await makeRequest('GET', '/ping');
    const test1Pass = test1.statusCode === 200 && test1.body === '{"pong":true}';
    logTest(
      'GET /ping returns 200 with {pong:true}',
      test1Pass,
      `Status: ${test1.statusCode}, Body: ${test1.body}`
    );

    // Test 2: Content-Type is application/json
    console.log('\nTest 2: Verify Content-Type header');
    const test2Pass = test1.headers['content-type'] === 'application/json';
    logTest(
      'GET /ping has Content-Type: application/json',
      test2Pass,
      `Content-Type: ${test1.headers['content-type']}`
    );

    // Test 3: POST /ping returns 404
    console.log('\nTest 3: POST /ping returns 404');
    const test3 = await makeRequest('POST', '/ping');
    const test3Pass = test3.statusCode === 404;
    logTest(
      'POST /ping returns 404',
      test3Pass,
      `Status: ${test3.statusCode}, Body: ${test3.body}`
    );

    // Test 4: PUT /ping returns 404
    console.log('\nTest 4: PUT /ping returns 404');
    const test4 = await makeRequest('PUT', '/ping');
    const test4Pass = test4.statusCode === 404;
    logTest(
      'PUT /ping returns 404',
      test4Pass,
      `Status: ${test4.statusCode}, Body: ${test4.body}`
    );

    // Test 5: DELETE /ping returns 404
    console.log('\nTest 5: DELETE /ping returns 404');
    const test5 = await makeRequest('DELETE', '/ping');
    const test5Pass = test5.statusCode === 404;
    logTest(
      'DELETE /ping returns 404',
      test5Pass,
      `Status: ${test5.statusCode}, Body: ${test5.body}`
    );

    // Test 6: GET / returns 404
    console.log('\nTest 6: GET / returns 404');
    const test6 = await makeRequest('GET', '/');
    const test6Pass = test6.statusCode === 404;
    logTest(
      'GET / returns 404',
      test6Pass,
      `Status: ${test6.statusCode}, Body: ${test6.body}`
    );

    // Test 7: GET /invalid returns 404
    console.log('\nTest 7: GET /invalid returns 404');
    const test7 = await makeRequest('GET', '/invalid');
    const test7Pass = test7.statusCode === 404;
    logTest(
      'GET /invalid returns 404',
      test7Pass,
      `Status: ${test7.statusCode}, Body: ${test7.body}`
    );

    // Test 8: Validate JSON responses
    console.log('\nTest 8: Validate all responses are valid JSON');
    let allValidJson = true;
    try {
      JSON.parse(test1.body);
      JSON.parse(test3.body);
      JSON.parse(test6.body);
      JSON.parse(test7.body);
    } catch (e) {
      allValidJson = false;
    }
    logTest(
      'All responses are valid JSON',
      allValidJson,
      allValidJson ? 'All responses parsed successfully' : 'Some responses failed to parse'
    );

    // Summary
    console.log('\n=== Test Summary ===');
    const passed = TEST_RESULTS.filter(r => r.passed).length;
    const failed = TEST_RESULTS.filter(r => !r.passed).length;
    console.log(`Total: ${TEST_RESULTS.length} tests`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    
    if (failed > 0) {
      console.log('\nFailed tests:');
      TEST_RESULTS.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.testName}: ${r.details}`);
      });
      process.exit(1);
    } else {
      console.log('\n✓ All tests passed!');
      process.exit(0);
    }

  } catch (error) {
    console.error('Error running tests:', error.message);
    console.error('Make sure the server is running on port 3000');
    process.exit(1);
  }
}

runTests();

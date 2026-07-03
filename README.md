# Node.js Ping Server

Minimal HTTP server with a single GET /ping endpoint.

## Prerequisites
- Node.js 16+ installed

## Run
```bash
node server.js
```

## Test
```bash
curl http://localhost:3000/ping
```

## Expected Response
```json
{"pong":true}
```

## Email Validation

Validates email addresses using regex pattern matching (RFC 5322 basic format).

**Usage:**
```javascript
import validateEmail from './src/validateEmail.js';

validateEmail('user@example.com');        // true
validateEmail('invalid-email');           // false
```

**API:** `validateEmail(email: string) → boolean`

**Valid examples:** `user@example.com`, `user.name@domain.co.uk`, `user_name@example.com`  
**Invalid examples:** `userexample.com` (no @), `user@domain` (no TLD), `user name@example.com` (spaces)

**Run tests:**
```bash
node tests/validateEmail.test.js
```

## greet() Function

**Location:** `greet.js`  
**Usage:** `const greet = require('./greet'); console.log(greet('World'));`  
**Output:** `Hello, World!`

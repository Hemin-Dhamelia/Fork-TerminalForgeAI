# BUG-G001: greet.js uses CommonJS in ES module project

**Severity:** critical  
**Priority:** high  
**Assignee:** junior-dev  
**Discovered by:** qa-engineer (Terminal 3)  
**Date:** 2026-05-09T22:31:45Z  
**Blocks:** task-g002, task-g003

---

## Repro Steps

1. Navigate to project root
2. Run: `node -e "const greet = require('./greet.js'); console.log(greet('World'));"`
3. Observe the error

---

## Expected Behavior

The greet() function should be importable and executable, returning:
- `greet('World')` → `'Hello, World!'`
- `greet('Alice')` → `'Hello, Alice!'`
- `greet('')` → `'Hello, !'`

---

## Actual Behavior

**Error message:**
```
ReferenceError: require is not defined in ES module scope
```

**Complete test output:**
```
✗ Runtime error: require is not defined
Error type: ReferenceError
Exit code: 1
```

The module cannot be loaded at all — the function never executes.

---

## Root Cause

File `greet.js` uses CommonJS syntax (`module.exports = greet;`) but:
- Package.json specifies `"type": "module"` (line 5)
- This makes Node.js treat all `.js` files as ES modules
- In ES module scope, `require()` and `module.exports` are not available

**Evidence:**
```javascript
// greet.js (line 11)
module.exports = greet;  // ← CommonJS export in ES module context
```

```json
// package.json (line 5)
"type": "module",  // ← Forces ES module mode for .js files
```

---

## Impact

- **Severity: Critical** — Complete blocker for testing and usage
- Cannot test the greet() function at all
- Cannot document usage in README
- Blocks task-g002 (QA verification)
- Blocks task-g003 (README documentation)

---

## Recommended Fix

**Option 1 (Quickest):** Rename file to use `.cjs` extension
```bash
mv greet.js greet.cjs
```
This tells Node.js to treat it as CommonJS regardless of package.json setting.

**Option 2 (Alternative):** Convert to ES module syntax
```javascript
// greet.js
function greet(name) {
  return 'Hello, ' + name + '!';
}

export default greet;
```

**Recommendation:** Use Option 1 (rename to .cjs) since the original task spec explicitly requested CommonJS with module.exports.

---

## Test Validation After Fix

After fix is applied, QA will verify with:

```bash
# If renamed to greet.cjs
node -e "const greet = require('./greet.cjs'); console.log(greet('World')); console.log(greet('Alice')); console.log(greet(''));"

# Expected output:
# Hello, World!
# Hello, Alice!
# Hello, !
```

---

## Files Attached

- Test report: `tests/greet.verification-report.md`
- Runtime test: `tests/greet-runtime-test.js`

---

## Next Steps

1. Junior Dev applies fix (rename greet.js → greet.cjs)
2. Junior Dev notifies QA when ready for re-test
3. QA re-runs verification tests
4. If pass, QA updates task-g002 to "completed"
5. DevOps can then proceed with task-g003

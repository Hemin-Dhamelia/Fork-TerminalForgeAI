# Bug Report: validateEmail.js

**Test Execution Date:** 2026-05-03  
**Tester:** QA Engineer (Terminal 3)  
**Test File:** tests/validateEmail.test.js  
**Test Results:** 30 passed / 33 total (3 failures)

---

## BUG-001: Plus sign (+) not supported in email local part

**Severity:** high

**Repro steps:**
1. Call `validateEmail('user+tag@example.org')`
2. Observe return value

**Expected:** 
- Function should return `true`
- Plus signs are valid in email addresses per RFC 5322
- Many services use plus-addressing (e.g., user+newsletter@example.com)

**Actual:** 
- Function returns `false`
- Plus sign is not included in the regex pattern `[\w.-]+`

**Root cause:**
The regex pattern `/^[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}$/` uses `\w` which only matches `[a-zA-Z0-9_]`. The plus sign (+) is not included.

**Relevant output:**
```
✗ should accept user+tag@example.org
  user+tag@example.org should be valid

false !== true
```

**Assignee:** senior-dev  
**Suggested fix:** Update regex to include `+` in local part: `/^[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}$/`

---

## BUG-002: Leading dot in local part incorrectly accepted

**Severity:** medium

**Repro steps:**
1. Call `validateEmail('.user@example.com')`
2. Observe return value

**Expected:** 
- Function should return `false`
- Leading dots in email local part are invalid per RFC 5322
- Email addresses cannot start with a dot

**Actual:** 
- Function returns `true`
- The regex pattern allows leading dots

**Root cause:**
The pattern `[\w.-]+` matches one or more characters including dots, but doesn't prevent dots at the start or end of the local part.

**Relevant output:**
```
✗ should reject email starting with dot: .user@example.com
  email starting with dot should be invalid

true !== false
```

**Assignee:** senior-dev  
**Suggested fix:** Add negative lookahead or use more specific pattern that disallows leading/trailing dots

---

## BUG-003: Trailing dot in local part incorrectly accepted

**Severity:** medium

**Repro steps:**
1. Call `validateEmail('user.@example.com')`
2. Observe return value

**Expected:** 
- Function should return `false`
- Trailing dots before @ symbol are invalid per RFC 5322
- Email addresses cannot end with a dot before the @ symbol

**Actual:** 
- Function returns `true`
- The regex pattern allows trailing dots in local part

**Root cause:**
The pattern `[\w.-]+` matches one or more characters including dots, but doesn't prevent dots at the start or end of the local part.

**Relevant output:**
```
✗ should reject email ending with dot before @: user.@example.com
  email ending with dot before @ should be invalid

true !== false
```

**Assignee:** senior-dev  
**Suggested fix:** Add negative lookahead or use more specific pattern that disallows leading/trailing dots in local part. Example: `/^[\w]+([\w.+-]*[\w]+)?@[\w.-]+\.[a-zA-Z]{2,}$/`

---

## Summary

**Critical Issues:** 0  
**High Issues:** 1 (plus sign support)  
**Medium Issues:** 2 (dot validation)  
**Low Issues:** 0

**Recommendation:** 
These bugs should be fixed before the validateEmail function is used in production. The plus sign issue (BUG-001) is particularly important as many email providers and users rely on plus-addressing for email filtering and organization.

**Test Coverage:**
- ✓ Valid email formats (6 test cases)
- ✓ Invalid email formats - missing parts (4 test cases)
- ✓ Invalid email formats - malformed (11 test cases)
- ✓ Edge cases (12 test cases)
- **Total: 33 comprehensive test cases**

All tests are now documented and repeatable via `node tests/validateEmail.test.js`

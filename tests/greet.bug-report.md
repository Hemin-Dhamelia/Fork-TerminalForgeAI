BUG-G001: greet.js uses CommonJS in ES module project
Severity: high
Repro steps:
  1. Check package.json - contains "type": "module"
  2. Inspect greet.js - uses module.exports (CommonJS)
  3. Try to require() from .cjs test file: node tests/greet.test.cjs
  4. Error: "ReferenceError: module is not defined in ES module scope"

Expected: greet.js should use .cjs extension (greet.cjs) to support CommonJS exports in an ES module project, OR use ES module export syntax

Actual: greet.js has .js extension with CommonJS exports, causing runtime error when imported

Relevant logs/output:
```
file:///Users/HP/Desktop/TerminalForgeAI/Fork-TerminalForgeAI/greet.js:10
module.exports = greet;
^

ReferenceError: module is not defined in ES module scope
This file is being treated as an ES module because it has a '.js' file extension and '/Users/HP/Desktop/TerminalForgeAI/Fork-TerminalForgeAI/package.json' contains "type": "module". To treat it as a CommonJS script, rename it to use the '.cjs' file extension.
```

Assignee: junior-dev

**Fix Required:** Rename greet.js to greet.cjs to match the CommonJS export format used.

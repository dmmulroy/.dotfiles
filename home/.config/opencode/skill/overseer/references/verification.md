# Verification Guide

Before marking any task complete, you MUST verify your work. Verification separates "I think it's done" from "it's actually done."

## The Verification Process

1. **Re-read the task context**: What did you originally commit to do?
2. **Check acceptance criteria**: Does your implementation satisfy the "Done when" conditions?
3. **Run relevant tests**: Execute the test suite and document results
4. **Test manually**: Actually try the feature/change yourself
5. **Compare with requirements**: Does what you built match what was asked?

## Strong vs Weak Verification

### Strong Verification Examples

- "All 60 tests passing, build successful"
- "All 69 tests passing (4 new tests for middleware edge cases)"
- "Manually tested with valid/invalid/expired tokens - all cases work"
- "Ran `cargo test` - 142 tests passed, 0 failed"

### Weak Verification (Avoid)

- "Should work now" - "should" means not verified
- "Made the changes" - no evidence it works
- "Added tests" - did the tests pass? What's the count?
- "Fixed the bug" - what bug? Did you verify the fix?
- "Done" - done how? prove it

## Verification by Task Type

| Task Type | How to Verify |
|-----------|---------------|
| Code changes | Run full test suite, document passing count |
| New features | Run tests + manual testing of functionality |
| Configuration | Test the config works (run commands, check workflows) |
| Documentation | Verify examples work, links resolve, formatting renders |
| Refactoring | Confirm tests still pass, no behavior changes |
| Bug fixes | Reproduce bug first, verify fix, add regression test |

## Cross-Reference Checklist

Before marking complete, verify all applicable items:

- [ ] Task description requirements met
- [ ] Context "Done when" criteria satisfied
- [ ] Tests passing (document count: "All X tests passing")
- [ ] Build succeeds (if applicable)
- [ ] Manual testing done (describe what you tested)
- [ ] No regressions introduced
- [ ] Edge cases considered (error handling, invalid input)
- [ ] Follow-up work identified (created new tasks if needed)

**If you can't check all applicable boxes, the task isn't done yet.**

## Result Examples with Verification

### Code Implementation

```javascript
await tasks.complete(taskId, `Implemented JWT middleware:

Implementation:
- Created src/middleware/verify-token.ts
- Separated 'expired' vs 'invalid' error codes
- Added user extraction from payload

Verification:
- All 69 tests passing (4 new tests for edge cases)
- Manually tested with valid token: Access granted
- Manually tested with expired token: 401 with 'token_expired'
- Manually tested with invalid signature: 401 with 'invalid_token'`);
```

### Configuration/Infrastructure

```javascript
await tasks.complete(taskId, `Added GitHub Actions workflow for CI:

Implementation:
- Created .github/workflows/ci.yml
- Jobs: lint, test, build with pnpm cache

Verification:
- Pushed to test branch, opened PR #123
- Workflow triggered automatically
- All jobs passed (lint: 0 errors, test: 69/69, build: success)
- Total run time: 2m 34s`);
```

### Refactoring

```javascript
await tasks.complete(taskId, `Refactored storage to one file per task:

Implementation:
- Split tasks.json into .overseer/tasks/{id}.json files
- Added auto-migration from old format
- Atomic writes via temp+rename

Verification:
- All 60 tests passing (including 8 storage tests)
- Build successful
- Manually tested migration: old -> new format works
- Confirmed git diff shows only changed tasks`);
```

### Bug Fix

```javascript
await tasks.complete(taskId, `Fixed login validation accepting usernames with spaces:

Root cause:
- Validation regex didn't account for leading/trailing spaces

Fix:
- Added .trim() before validation in src/auth/validate.ts:42
- Updated regex to reject internal spaces

Verification:
- All 45 tests passing (2 new regression tests)
- Manually tested:
  - " admin" -> rejected (leading space)
  - "admin " -> rejected (trailing space)
  - "ad min" -> rejected (internal space)
  - "admin" -> accepted`);
```

### Documentation

```javascript
await tasks.complete(taskId, `Updated API documentation for auth endpoints:

Implementation:
- Added docs for POST /auth/login
- Added docs for POST /auth/logout
- Added docs for POST /auth/refresh
- Included example requests/responses

Verification:
- All code examples tested and working
- Links verified (no 404s)
- Rendered in local preview - formatting correct
- Spell-checked content`);
```

## Common Verification Mistakes

| Mistake | Better Approach |
|---------|-----------------|
| "Tests pass" | "All 42 tests passing" (include count) |
| "Manually tested" | "Manually tested X, Y, Z scenarios" (be specific) |
| "Works" | "Works: [evidence]" (show proof) |
| "Fixed" | "Fixed: [root cause] -> [solution] -> [verification]" |

## When Verification Fails

If verification reveals issues:

1. **Don't complete the task** - it's not done
2. **Document what failed** in task context
3. **Fix the issues** before completing
4. **Re-verify** after fixes

```javascript
// Update context with failure notes
await tasks.update(taskId, {
  context: task.context + `

Verification attempt 1 (failed):
- Tests: 41/42 passing
- Failing: test_token_refresh - timeout issue
- Need to investigate async handling`
});

// After fixing
await tasks.complete(taskId, `Implemented token refresh:

Implementation:
- Added refresh endpoint
- Fixed async timeout (was missing await)

Verification:
- All 42 tests passing (fixed timeout issue)
- Manual testing: refresh works within 30s window`);
```

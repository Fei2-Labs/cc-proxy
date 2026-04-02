# Testing Patterns

**Analysis Date:** 2026-04-02

## Test Framework

**Runner:**
- Custom test harness (no framework dependency)
- Tests run via `tsx` directly: `tsx tests/rewriter.test.ts`
- No test framework (no Jest, Vitest, or Mocha)

**Assertion Library:**
- Node.js built-in `assert` module with strict mode:
  ```typescript
  import { strict as assert } from 'assert'
  ```

**Run Commands:**
```bash
npm test                      # Run all tests (currently just rewriter tests)
tsx tests/rewriter.test.ts    # Run tests directly
```

## Test File Organization

**Location:**
- Separate `tests/` directory at project root (not co-located with source)

**Naming:**
- Pattern: `{module-name}.test.ts`
- Currently: `tests/rewriter.test.ts`

**Structure:**
```
tests/
└── rewriter.test.ts    # Tests for src/rewriter.ts (rewriteBody, rewriteHeaders)
```

## Test Structure

**Custom Test Runner:**
The project uses a hand-rolled test function instead of a framework. Defined in `tests/rewriter.test.ts`:

```typescript
let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`  + ${name}`)
  } catch (err) {
    failed++
    console.log(`  x ${name}`)
    console.log(`    ${err}`)
  }
}
```

**Suite Organization:**
Tests are grouped by feature using console.log section headers and separator comments:

```typescript
// ============================================================
console.log('\n/v1/messages - metadata.user_id rewriting')
// ============================================================

test('rewrites device_id in metadata.user_id', () => {
  // ...
})

// ============================================================
console.log('\n/api/event_logging/batch - event data rewriting')
// ============================================================

test('rewrites device_id and email in events', () => {
  // ...
})
```

**Exit code:** Tests exit with code 1 on failure:
```typescript
console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
```

## Test Data Setup

**Shared Config Fixture:**
A full `Config` object is defined at the top of the test file and reused across all tests:

```typescript
const config: Config = {
  server: { port: 8443, tls: { cert: '', key: '' } },
  upstream: { url: 'https://api.anthropic.com' },
  auth: { tokens: [{ name: 'test', token: 'test-token' }] },
  oauth: { refresh_token: 'test-refresh' },
  identity: {
    device_id: 'canonical_device_id_0123456789abcdef...',
    email: 'canonical@example.com',
  },
  env: { /* full env object */ },
  prompt_env: {
    platform: 'darwin',
    shell: 'zsh',
    os_version: 'Darwin 24.4.0',
    working_dir: '/Users/jack/projects',
  },
  process: {
    constrained_memory: 34359738368,
    rss_range: [300000000, 500000000],
    heap_total_range: [40000000, 80000000],
    heap_used_range: [100000000, 200000000],
  },
  logging: { level: 'error', audit: false },
}
```

**Per-Test Data:**
Each test constructs its own request body inline. The pattern is: build a minimal JSON body with only the fields relevant to the test, then pass through `rewriteBody()`:

```typescript
test('rewrites Platform in system prompt', () => {
  const body = {
    system: [{ type: 'text', text: 'Platform: linux\nShell: bash\nOS Version: Linux 6.5.0' }],
    messages: [],
  }
  const result = JSON.parse(
    rewriteBody(Buffer.from(JSON.stringify(body)), '/v1/messages', config).toString(),
  )
  assert.ok(result.system[0].text.includes('Platform: darwin'))
})
```

## Mocking

**Framework:** None

**Approach:** Tests only cover pure functions (`rewriteBody`, `rewriteHeaders`) that take data in and return data out, so no mocking is needed. The rewriter module is stateless and accepts `Config` as a parameter.

**What is NOT mocked:**
- HTTP server/client (not tested)
- OAuth token refresh (not tested)
- File system reads (not tested)
- Timer/scheduling (not tested)

## Assertion Patterns

**Equality checks:**
```typescript
assert.equal(userId.device_id, config.identity.device_id)
assert.equal(data.baseUrl, undefined, 'baseUrl should be stripped')
```

**Inclusion checks:**
```typescript
assert.ok(result.system[0].text.includes('Platform: darwin'))
assert.ok(!result.system.includes('/home/bob/'), 'Original path should be replaced')
```

**Range checks:**
```typescript
assert.ok(decoded.rss >= 300000000 && decoded.rss <= 500000000, 'rss should be in range')
```

**Assertion messages:** Most assertions include a descriptive message string as the last argument.

## Coverage

**Requirements:** None enforced. No coverage tool configured.

**Current Coverage:**
- `src/rewriter.ts` - Well tested (12 tests covering body rewriting, header rewriting, edge cases)
- `src/config.ts` - Not tested
- `src/auth.ts` - Not tested
- `src/proxy.ts` - Not tested
- `src/oauth.ts` - Not tested
- `src/logger.ts` - Not tested

## Test Types

**Unit Tests:**
- All 12 existing tests are unit tests for `rewriteBody()` and `rewriteHeaders()`
- Tests cover: `/v1/messages` body rewriting (device_id, system prompt env, billing header, user messages), `/api/event_logging/batch` rewriting (identity, env, process metrics, base64-encoded fields, field stripping), header rewriting (User-Agent, auth stripping), and non-JSON passthrough

**Integration Tests:**
- None. The HTTP proxy, OAuth flow, and auth are not integration-tested.

**E2E Tests:**
- None. The `/_verify` endpoint serves as a manual verification tool but is not automated.

## Test Categories (from existing tests)

| Category | Count | What's Tested |
|----------|-------|---------------|
| /v1/messages metadata | 1 | device_id rewrite in user_id JSON |
| /v1/messages system prompt | 4 | Platform, Shell, OS Version, working dir, billing header, home paths |
| /api/event_logging/batch | 4 | device_id/email, env replacement, field stripping, base64 process metrics |
| HTTP headers | 3 | User-Agent rewrite, auth stripping, proxy-auth stripping |
| Edge cases | 1 | Non-JSON passthrough |

## Adding New Tests

**To add a new test:**
1. Open `tests/rewriter.test.ts`
2. Add a new `test('description', () => { ... })` call in the appropriate section
3. Use `assert.equal()` or `assert.ok()` for assertions
4. Run with `npm test`

**To test a new module:**
1. Create `tests/{module-name}.test.ts`
2. Copy the test runner boilerplate (the `test()` function, counters, and summary)
3. Import the functions to test
4. Add the script to `package.json` or update the existing `test` script

**Note:** The `package.json` test script only runs `tsx tests/rewriter.test.ts`. If new test files are added, the test script must be updated (e.g., use a glob or run multiple files).

---

*Testing analysis: 2026-04-02*

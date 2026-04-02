# Codebase Structure

**Analysis Date:** 2026-04-02

## Directory Layout

```
cc-proxy/
├── src/                    # TypeScript source (compiled to dist/)
│   ├── index.ts            # Entry point - bootstrap and start
│   ├── proxy.ts            # HTTP server, request routing, upstream forwarding
│   ├── rewriter.ts         # Body and header rewriting engine
│   ├── auth.ts             # Client bearer token authentication
│   ├── oauth.ts            # OAuth token lifecycle management
│   ├── config.ts           # Config loading, types, validation
│   ├── logger.ts           # Structured logging
│   └── scripts/            # CLI utility scripts
│       ├── generate-token.ts    # Generate client bearer token
│       └── generate-identity.ts # Generate canonical device_id
├── tests/                  # Test files
│   └── rewriter.test.ts    # Rewriter unit tests (custom test runner)
├── scripts/                # Shell scripts for setup/ops
│   ├── client-setup.sh     # Configure a client machine to use the gateway
│   └── extract-token.sh    # Extract OAuth refresh token from macOS Keychain
├── .github/                # GitHub assets (logos, repo metadata)
│   ├── logo-dark.svg
│   ├── logo-light.svg
│   └── repo-meta.yml
├── config.example.yaml     # Reference config with all options documented
├── clash-rules.yaml        # Clash proxy rules to block direct Anthropic access
├── package.json            # Node.js manifest
├── package-lock.json       # Dependency lockfile
├── tsconfig.json           # TypeScript compiler config
├── Dockerfile              # Multi-stage Docker build
├── docker-compose.yml      # Docker Compose for deployment
├── .gitignore              # Git ignore rules
├── LICENSE                 # MIT license
└── README.md               # Project documentation
```

## Directory Purposes

**`src/`:**
- Purpose: All application TypeScript source code
- Contains: 7 module files + 1 subdirectory with 2 utility scripts
- Key files: `index.ts` (entry), `proxy.ts` (server), `rewriter.ts` (core logic)
- Compiled to `dist/` by `tsc`

**`src/scripts/`:**
- Purpose: CLI utilities for admin tasks (token generation, identity generation)
- Contains: Standalone scripts run via `npm run generate-token` / `npm run generate-identity`
- Key files: `generate-token.ts`, `generate-identity.ts`

**`tests/`:**
- Purpose: Unit tests for the rewriter module
- Contains: Single test file with custom assertion-based test runner
- Key files: `rewriter.test.ts`

**`scripts/`:**
- Purpose: Shell scripts for operational tasks (client machine setup, credential extraction)
- Contains: Bash scripts meant to be run manually by admins
- Key files: `client-setup.sh` (client config), `extract-token.sh` (OAuth token extraction)

**`.github/`:**
- Purpose: GitHub repository assets (logos, metadata)
- Contains: SVG logos, repo metadata YAML
- Not CI/CD -- no workflow files

## Key File Locations

**Entry Points:**
- `src/index.ts`: Main application entry. Loads config, inits OAuth, starts proxy server.
- `dist/index.js`: Compiled entry point (runtime target for `npm start`).

**Configuration:**
- `config.example.yaml`: Reference config with all options and inline documentation. Copy to `config.yaml` for use.
- `tsconfig.json`: TypeScript config -- targets ES2022, ESNext modules, strict mode, outputs to `dist/`.
- `package.json`: Project manifest. Defines `build`, `start`, `dev`, `generate-token`, `generate-identity`, `test` scripts.

**Core Logic:**
- `src/proxy.ts`: HTTP(S) server, request handling, upstream forwarding. Contains `startProxy()` and `handleRequest()`.
- `src/rewriter.ts`: Identity rewriting engine. Contains `rewriteBody()`, `rewriteHeaders()`, and all sub-rewriters.
- `src/oauth.ts`: OAuth token management. Contains `initOAuth()`, `getAccessToken()`, auto-refresh scheduling.
- `src/auth.ts`: Client authentication. Contains `initAuth()` and `authenticate()`.
- `src/config.ts`: Config type (`Config`, `TokenEntry`) and `loadConfig()`.
- `src/logger.ts`: `log()`, `audit()`, `setLogLevel()`.

**Testing:**
- `tests/rewriter.test.ts`: Comprehensive rewriter tests (13 test cases). Custom test runner using `assert`.

**Deployment:**
- `Dockerfile`: Multi-stage build (builder + runtime). Uses `node:22-slim`.
- `docker-compose.yml`: Single service, mounts `config.yaml` and `certs/` as read-only volumes.

## Naming Conventions

**Files:**
- Lowercase, hyphen-free, single-word names: `proxy.ts`, `auth.ts`, `config.ts`, `logger.ts`, `oauth.ts`, `rewriter.ts`
- Test files: `<module>.test.ts` in `tests/` directory
- Shell scripts: `kebab-case.sh` in `scripts/`

**Directories:**
- Lowercase, no nesting beyond one level: `src/`, `src/scripts/`, `tests/`, `scripts/`

**Exports:**
- Named exports only (no default exports anywhere in the codebase)
- Function names: `camelCase` -- `startProxy`, `loadConfig`, `rewriteBody`, `authenticate`
- Type names: `PascalCase` -- `Config`, `TokenEntry`, `OAuthTokens`

## Where to Add New Code

**New rewrite target (e.g., a new API path):**
- Add path detection in `src/rewriter.ts:rewriteBody()` (the `if/else if` chain starting at line 22)
- Add a new `rewrite*()` function in `src/rewriter.ts`
- Add tests in `tests/rewriter.test.ts`

**New HTTP endpoint (e.g., admin API):**
- Add path check in `src/proxy.ts:handleRequest()` (before the main proxy logic, after line 66)
- Follow the pattern of `/_health` and `/_verify` endpoints

**New configuration section:**
- Add type to `Config` in `src/config.ts`
- Add validation in `loadConfig()` if the field is required
- Add example values in `config.example.yaml`

**New utility script:**
- Place in `src/scripts/` as a `.ts` file
- Add an npm script in `package.json` using `tsx src/scripts/<name>.ts`

**New test file:**
- Place in `tests/` as `<module>.test.ts`
- Use the same custom test runner pattern (import `assert`, define `test()` helper)
- Add npm script or extend the existing `test` script in `package.json`

**New shell/ops script:**
- Place in `scripts/` as `<name>.sh`
- Make executable (`chmod +x`)

## Special Directories

**`dist/`:**
- Purpose: Compiled JavaScript output from TypeScript
- Generated: Yes (by `npm run build` / `tsc`)
- Committed: No (in `.gitignore`)

**`certs/`:**
- Purpose: TLS certificate and private key for HTTPS
- Generated: Manually by admin (self-signed or CA-issued)
- Committed: No (referenced by config, expected to exist at runtime if TLS enabled)

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes (by `npm install`)
- Committed: No

## Module Dependency Graph

```
index.ts
├── config.ts      (loadConfig)
├── logger.ts      (setLogLevel, log)
├── oauth.ts       (initOAuth)
│   └── logger.ts
└── proxy.ts       (startProxy)
    ├── auth.ts    (authenticate, initAuth)
    │   └── config.ts (types only)
    ├── oauth.ts   (getAccessToken)
    ├── rewriter.ts (rewriteBody, rewriteHeaders)
    │   ├── config.ts (types only)
    │   └── logger.ts
    └── logger.ts  (audit, log)
```

All imports use `.js` extensions (ESM convention with TypeScript). No path aliases configured. No barrel files. Each module exports only what is needed by its consumers.

---

*Structure analysis: 2026-04-02*

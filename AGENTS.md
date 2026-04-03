### Do
- auto push to git for each successful test build
- ssh shuttleup

### Infrastructure
- **Remote server**: 193.53.40.161 (SSH alias: `shuttleup`, user: root)
- **Proxy URL**: https://cc.swedexpress.store
- **Deployment**: Dokploy (auto-builds Docker image on git push)
  - Dokploy URL: https://dokploy.shuttleup.se
  - Dokploy API: NtATXuWYTvyfrXotOUjcHgJTXrzKimNCKImHjlLFDquipjrpxbyfmUANMLbZEXjI
  - Project name: cc-proxy

### Architecture
- **Docker**: `Dockerfile` builds a multi-stage image (native deps → build → runtime)
- **Config**: `config.example.yaml` is baked into the image as `/app/config.yaml` at build time. It contains non-secret settings (identity, env fingerprint, version).
- **Secrets** (OAuth refresh token, client tokens) are stored in **SQLite** inside the `ccproxy-data` Docker volume (`/app/data/cc-proxy.db`), managed via the portal UI — NOT in config.yaml.
- **Volume**: Only `/app/data` is mounted (`ccproxy-data` volume) — persists SQLite DB across rebuilds.

### Version Maintenance
- `config.example.yaml` → `env.version`, `env.version_base`, `env.build_time` must match the current Claude Code version.
- Check local version: `claude --version`
- Extract fingerprint algorithm details from binary: `strings ~/.local/share/claude/versions/<ver> | grep 59cf53e54c78`
- The `cc_version` fingerprint uses salt `59cf53e54c78` + message chars at positions [4,7,20] + version string → SHA256 → first 3 hex chars.
- The `cch` attestation uses xxhash64 with seed `0x6E52736AC806831E` on the request body.
- Mismatched version strings cause Anthropic to apply stricter rate limits (Opus/Sonnet get 429 while Haiku still works).

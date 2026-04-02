// OAuth constants shared between proxy (src/oauth.ts) and portal API routes
// This file has NO imports from other src/ modules, so Next.js can bundle it safely

export const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token'
export const AUTHORIZE_URL = 'https://platform.claude.com/v1/oauth/authorize'
export const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
export const DEFAULT_SCOPES = [
  'user:inference',
  'user:profile',
  'user:sessions:claude_code',
  'user:mcp_servers',
  'user:file_upload',
]

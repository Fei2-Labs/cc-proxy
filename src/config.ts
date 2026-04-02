import { readFileSync } from 'fs'
import { parse } from 'yaml'
import { resolve } from 'path'

export type TokenEntry = {
  name: string
  token: string
}

export type Config = {
  server: {
    port: number
    tls: {
      cert: string
      key: string
    }
  }
  upstream: {
    url: string
  }
  auth: {
    tokens: TokenEntry[]
  }
  oauth: {
    refresh_token: string
  }
  identity: {
    device_id: string
    email: string
  }
  env: Record<string, string | boolean | number>
  // System prompt environment masking - must be consistent with env above
  prompt_env: {
    platform: string        // "darwin" — must match env.platform
    shell: string           // "zsh"
    os_version: string      // "Darwin 24.4.0" — uname -sr output
    working_dir: string     // "/Users/jack/projects" — canonical home path prefix
  }
  process: {
    constrained_memory: number
    rss_range: [number, number]
    heap_total_range: [number, number]
    heap_used_range: [number, number]
  }
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error'
    audit: boolean
  }
}

export function loadConfig(configPath?: string): Config {
  const filePath = configPath || resolve(process.cwd(), 'config.yaml')
  const raw = readFileSync(filePath, 'utf-8')
  const config = parse(raw) as Config

  if (!config.identity?.device_id || config.identity.device_id.includes('0000000000')) {
    throw new Error('config: identity.device_id must be set to a real 64-char hex value. Run: npm run generate-identity')
  }
  if (!config.auth?.tokens) {
    config.auth = { ...config.auth, tokens: [] }
  }
  if (!config.oauth) {
    config.oauth = { refresh_token: '' }
  }

  return config
}

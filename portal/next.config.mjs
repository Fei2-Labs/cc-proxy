import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '',
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['better-sqlite3'],
  turbopack: {
    root: resolve(__dirname, '..'),
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },
}
export default nextConfig

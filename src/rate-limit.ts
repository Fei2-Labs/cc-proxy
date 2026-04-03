// Simple sliding window rate limiter per canonical identity
// Prevents multiple clients from creating unnaturally high request volume

const windows: Map<string, number[]> = new Map()

export function checkRateLimit(path: string, maxPerMinute = 30): boolean {
  // Only limit API calls, not telemetry
  if (!path.startsWith('/v1/')) return true

  const now = Date.now()
  const key = 'global' // single identity = single window
  const timestamps = windows.get(key) || []

  // Remove entries older than 1 minute
  const cutoff = now - 60_000
  const recent = timestamps.filter(t => t > cutoff)

  if (recent.length >= maxPerMinute) return false

  recent.push(now)
  windows.set(key, recent)
  return true
}

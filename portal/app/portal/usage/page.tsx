'use client'

import { useState, useEffect } from 'react'

type UsageClient = {
  client_name: string
  total_requests: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_creation_tokens: number
  avg_latency_ms: number
  estimated_cost_usd: number
}

type RateLimits = Record<string, string | undefined>

export default function UsagePage() {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week')
  const [clients, setClients] = useState<UsageClient[]>([])
  const [limits, setLimits] = useState<RateLimits>({})

  const fetchUsage = async (p: string) => {
    const res = await fetch(`/api/usage?period=${p}`)
    if (res.ok) {
      const data = await res.json()
      setClients(data.clients)
    }
  }

  const fetchLimits = async () => {
    const res = await fetch('/api/usage/limits')
    if (res.ok) {
      const data = await res.json()
      setLimits(data.limits)
    }
  }

  useEffect(() => { fetchUsage(period); fetchLimits() }, [period])

  const fmt = (n: number) => n.toLocaleString()

  return (
    <div>
      <h1 className="text-2xl font-bold font-mono mb-6">Usage</h1>

      <div className="flex gap-2 mb-6">
        {(['day', 'week', 'month'] as const).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${period === p ? 'bg-[hsl(var(--primary))] text-white' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]'}`}
          >
            {p === 'day' ? 'Day' : p === 'week' ? 'Week' : 'Month'}
          </button>
        ))}
      </div>

      {/* Rate Limits */}
      {limits['x-ratelimit-limit-requests'] && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Requests</p>
            <p className="text-xl font-bold font-mono mt-1">
              {limits['x-ratelimit-remaining-requests'] || '—'} <span className="text-sm font-normal text-[hsl(var(--muted-foreground))]">/ {limits['x-ratelimit-limit-requests']}</span>
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">Remaining</p>
          </div>
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Tokens</p>
            <p className="text-xl font-bold font-mono mt-1">
              {limits['x-ratelimit-remaining-tokens'] ? fmt(Number(limits['x-ratelimit-remaining-tokens'])) : '—'} <span className="text-sm font-normal text-[hsl(var(--muted-foreground))]">/ {limits['x-ratelimit-limit-tokens'] ? fmt(Number(limits['x-ratelimit-limit-tokens'])) : '—'}</span>
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">Remaining</p>
          </div>
        </div>
      )}

      {/* Usage Table */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[hsl(var(--border))]">
              <th className="text-left px-4 py-3 text-[hsl(var(--muted-foreground))] font-medium">Client</th>
              <th className="text-right px-4 py-3 text-[hsl(var(--muted-foreground))] font-medium">Requests</th>
              <th className="text-right px-4 py-3 text-[hsl(var(--muted-foreground))] font-medium">Input</th>
              <th className="text-right px-4 py-3 text-[hsl(var(--muted-foreground))] font-medium">Output</th>
              <th className="text-right px-4 py-3 text-[hsl(var(--muted-foreground))] font-medium">Avg Latency</th>
              <th className="text-right px-4 py-3 text-[hsl(var(--muted-foreground))] font-medium">Est. Cost</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[hsl(var(--muted-foreground))]">No usage data yet</td></tr>
            ) : clients.map(c => (
              <tr key={c.client_name} className="border-b border-[hsl(var(--border))] last:border-0">
                <td className="px-4 py-3 font-medium">{c.client_name}</td>
                <td className="px-4 py-3 text-right font-mono">{fmt(c.total_requests)}</td>
                <td className="px-4 py-3 text-right font-mono text-[hsl(var(--muted-foreground))]">{fmt(c.input_tokens)}</td>
                <td className="px-4 py-3 text-right font-mono text-[hsl(var(--muted-foreground))]">{fmt(c.output_tokens)}</td>
                <td className="px-4 py-3 text-right font-mono text-[hsl(var(--muted-foreground))]">{fmt(c.avg_latency_ms)}ms</td>
                <td className="px-4 py-3 text-right font-mono">${c.estimated_cost_usd.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

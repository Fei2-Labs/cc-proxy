'use client'

import { useState, useEffect } from 'react'

export default function DashboardPage() {
  const [tokenCount, setTokenCount] = useState<number | null>(null)
  const [requestsToday, setRequestsToday] = useState<number | null>(null)
  const [oauthStatus, setOauthStatus] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/tokens').then(r => r.json()).then(d => setTokenCount(d.tokens?.length ?? 0)).catch(() => {})
    fetch('/api/usage?period=day').then(r => r.json()).then(d => {
      const total = (d.clients || []).reduce((s: number, c: { total_requests: number }) => s + c.total_requests, 0)
      setRequestsToday(total)
    }).catch(() => {})
    fetch('/api/oauth/status').then(r => r.json()).then(d => setOauthStatus(d.status)).catch(() => {})
  }, [])

  const statusColor = oauthStatus === 'valid' ? 'text-green-400' : oauthStatus === 'expired' ? 'text-yellow-400' : 'text-[hsl(var(--muted-foreground))]'

  return (
    <div>
      <h1 className="text-2xl font-bold font-mono mb-2">Dashboard</h1>
      <p className="text-[hsl(var(--muted-foreground))] text-sm">Overview of your CC Proxy gateway.</p>
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-6">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Active Tokens</p>
          <p className="text-3xl font-bold font-mono mt-1">{tokenCount ?? '—'}</p>
        </div>
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-6">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Requests Today</p>
          <p className="text-3xl font-bold font-mono mt-1">{requestsToday ?? '—'}</p>
        </div>
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-6">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">OAuth Status</p>
          <p className={`text-3xl font-bold font-mono mt-1 capitalize ${statusColor}`}>{oauthStatus ?? '—'}</p>
        </div>
      </div>
    </div>
  )
}

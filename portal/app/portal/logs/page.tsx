'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

type Log = {
  id: number
  client_name: string
  method: string
  path: string
  model: string | null
  input_tokens: number | null
  output_tokens: number | null
  cache_read_tokens: number | null
  cache_creation_tokens: number | null
  status: number
  latency_ms: number
  rate_limit_info: string | null
  created_at: string
}

type StatusFilter = '' | 'success' | 'error' | 'rate_limited'

export default function LogsPage() {
  const [logs, setLogs] = useState<Log[]>([])
  const [total, setTotal] = useState(0)
  const [clients, setClients] = useState<string[]>([])
  const [client, setClient] = useState('')
  const [status, setStatus] = useState<StatusFilter>('')
  const [timePreset, setTimePreset] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [offset, setOffset] = useState(0)

  const fetchLogs = async (reset = false) => {
    const o = reset ? 0 : offset
    const params = new URLSearchParams({ limit: '50', offset: String(o) })
    if (client) params.set('client', client)
    if (status) params.set('status', status)
    if (timePreset) {
      const now = new Date()
      const h = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 }[timePreset] || 0
      params.set('from', new Date(now.getTime() - h * 3600000).toISOString().slice(0, 19).replace('T', ' '))
    }

    const res = await fetch(`/api/logs?${params}`)
    if (res.ok) {
      const data = await res.json()
      if (reset) {
        setLogs(data.logs)
        setOffset(50)
      } else {
        setLogs(prev => [...prev, ...data.logs])
        setOffset(o + 50)
      }
      setTotal(data.total)
      if (data.clients) setClients(data.clients)
    }
  }

  useEffect(() => { fetchLogs(true) }, [client, status, timePreset])

  const statusBadge = (s: number) => {
    if (s === 429) return <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-900/30 text-yellow-400">429</span>
    if (s >= 400) return <span className="px-2 py-0.5 rounded-full text-xs bg-red-900/30 text-red-400">{s}</span>
    return <span className="px-2 py-0.5 rounded-full text-xs bg-green-900/30 text-green-400">{s}</span>
  }

  const fmt = (d: string) => new Date(d + 'Z').toLocaleString()
  const fmtN = (n: number | null) => n != null ? n.toLocaleString() : '\u2014'

  return (
    <div>
      <h1 className="text-2xl font-bold font-mono mb-6">Logs</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={client}
          onChange={e => setClient(e.target.value)}
          className="bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded-md px-3 py-1.5 text-sm"
        >
          <option value="">All clients</option>
          {clients.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <div className="flex gap-1">
          {([['', 'All'], ['success', 'Success'], ['error', 'Error'], ['rate_limited', 'Rate Limited']] as const).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setStatus(v as StatusFilter)}
              className={`px-3 py-1.5 rounded-md text-sm ${status === v ? 'bg-[hsl(var(--primary))] text-white' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          {['1h', '6h', '24h', '7d'].map(t => (
            <button
              key={t}
              onClick={() => setTimePreset(timePreset === t ? '' : t)}
              className={`px-3 py-1.5 rounded-md text-sm ${timePreset === t ? 'bg-[hsl(var(--primary))] text-white' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}
            >
              {t}
            </button>
          ))}
        </div>

        <span className="text-sm text-[hsl(var(--muted-foreground))] self-center ml-auto">{total} results</span>
      </div>

      {/* Log Table */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[hsl(var(--border))]">
              <th className="w-6 px-2"></th>
              <th className="text-left px-4 py-3 text-[hsl(var(--muted-foreground))] font-medium">Time</th>
              <th className="text-left px-4 py-3 text-[hsl(var(--muted-foreground))] font-medium">Client</th>
              <th className="text-left px-4 py-3 text-[hsl(var(--muted-foreground))] font-medium">Path</th>
              <th className="text-left px-4 py-3 text-[hsl(var(--muted-foreground))] font-medium">Model</th>
              <th className="text-left px-4 py-3 text-[hsl(var(--muted-foreground))] font-medium">Status</th>
              <th className="text-right px-4 py-3 text-[hsl(var(--muted-foreground))] font-medium">Latency</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[hsl(var(--muted-foreground))]">No logs found</td></tr>
            ) : logs.map(l => (
              <>
                <tr
                  key={l.id}
                  onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                  className="border-b border-[hsl(var(--border))] last:border-0 cursor-pointer hover:bg-[hsl(var(--accent))]"
                >
                  <td className="px-2">{expanded === l.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                  <td className="px-4 py-2 text-[hsl(var(--muted-foreground))] text-xs">{fmt(l.created_at)}</td>
                  <td className="px-4 py-2">{l.client_name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-[hsl(var(--muted-foreground))]">{l.method} {l.path}</td>
                  <td className="px-4 py-2 text-[hsl(var(--muted-foreground))]">{l.rate_limit_info ? <span title={l.rate_limit_info}>⚠ </span> : ''}{l.model || '\u2014'}</td>
                  <td className="px-4 py-2">{statusBadge(l.status)}</td>
                  <td className="px-4 py-2 text-right font-mono text-[hsl(var(--muted-foreground))]">{l.latency_ms}ms</td>
                </tr>
                {expanded === l.id && (
                  <tr key={`${l.id}-detail`} className="border-b border-[hsl(var(--border))]">
                    <td colSpan={7} className="px-8 py-4 bg-[hsl(var(--muted))]">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div><span className="text-[hsl(var(--muted-foreground))]">Input tokens:</span> <span className="font-mono">{fmtN(l.input_tokens)}</span></div>
                        <div><span className="text-[hsl(var(--muted-foreground))]">Output tokens:</span> <span className="font-mono">{fmtN(l.output_tokens)}</span></div>
                        <div><span className="text-[hsl(var(--muted-foreground))]">Cache read:</span> <span className="font-mono">{fmtN(l.cache_read_tokens)}</span></div>
                        <div><span className="text-[hsl(var(--muted-foreground))]">Cache create:</span> <span className="font-mono">{fmtN(l.cache_creation_tokens)}</span></div>
                        <div><span className="text-[hsl(var(--muted-foreground))]">Method:</span> <span className="font-mono">{l.method}</span></div>
                        <div><span className="text-[hsl(var(--muted-foreground))]">Path:</span> <span className="font-mono">{l.path}</span></div>
                        <div><span className="text-[hsl(var(--muted-foreground))]">Status:</span> <span className="font-mono">{l.status}</span></div>
                        <div><span className="text-[hsl(var(--muted-foreground))]">Latency:</span> <span className="font-mono">{l.latency_ms}ms</span></div>
                      </div>
                      {l.rate_limit_info && (
                        <div className="mt-3 px-3 py-2 rounded bg-yellow-900/20 border border-yellow-800/30 text-yellow-400 text-xs font-mono">
                          ⚠ Rate limited: {l.rate_limit_info}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {logs.length < total && (
        <button
          onClick={() => fetchLogs(false)}
          className="mt-4 w-full py-2 text-sm text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] rounded-md hover:bg-[hsl(var(--accent))]"
        >
          Load more ({total - logs.length} remaining)
        </button>
      )}
    </div>
  )
}

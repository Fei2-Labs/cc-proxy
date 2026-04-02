'use client'

import { useState, useEffect } from 'react'
import { Copy, Check, Plus } from 'lucide-react'

type Token = {
  id: number
  name: string
  prefix: string
  active: boolean
  lastUsedAt: string | null
  createdAt: string
}

export default function TokensPage() {
  const [tokens, setTokens] = useState<Token[]>([])
  const [name, setName] = useState('')
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchTokens = async () => {
    const res = await fetch('/api/tokens')
    if (res.ok) {
      const data = await res.json()
      setTokens(data.tokens)
    }
  }

  useEffect(() => { fetchTokens() }, [])

  const handleCreate = async () => {
    if (!name.trim()) return
    setLoading(true)
    setError('')
    setNewToken(null)
    try {
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create token')
        return
      }
      setNewToken(data.token)
      setName('')
      fetchTokens()
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const copyToken = async () => {
    if (!newToken) return
    await navigator.clipboard.writeText(newToken)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatDate = (d: string | null) => {
    if (!d) return '\u2014'
    return new Date(d + 'Z').toLocaleString()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold font-mono mb-6">Tokens</h1>

      <div className="flex gap-3 mb-6">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder="Token name"
          className="bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded-md px-3 py-2 text-sm flex-1 max-w-xs"
        />
        <button
          onClick={handleCreate}
          disabled={loading || !name.trim()}
          className="bg-[hsl(var(--primary))] text-white rounded-md px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          <Plus size={16} />
          Create
        </button>
      </div>

      {error && <p className="text-[hsl(var(--destructive))] text-sm mb-4">{error}</p>}

      {newToken && (
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--primary))] rounded-lg p-4 mb-6">
          <p className="text-sm text-[hsl(var(--muted-foreground))] mb-2">
            Copy this token now — it won&apos;t be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="bg-[hsl(var(--muted))] px-3 py-1.5 rounded text-sm font-mono flex-1 break-all">
              {newToken}
            </code>
            <button onClick={copyToken} className="p-2 hover:bg-[hsl(var(--accent))] rounded">
              {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
            </button>
          </div>
        </div>
      )}

      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[hsl(var(--border))]">
              <th className="text-left px-4 py-3 text-[hsl(var(--muted-foreground))] font-medium">Name</th>
              <th className="text-left px-4 py-3 text-[hsl(var(--muted-foreground))] font-medium">Prefix</th>
              <th className="text-left px-4 py-3 text-[hsl(var(--muted-foreground))] font-medium">Status</th>
              <th className="text-left px-4 py-3 text-[hsl(var(--muted-foreground))] font-medium">Last Used</th>
              <th className="text-left px-4 py-3 text-[hsl(var(--muted-foreground))] font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {tokens.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-[hsl(var(--muted-foreground))]">No tokens yet</td></tr>
            ) : tokens.map(t => (
              <tr key={t.id} className="border-b border-[hsl(var(--border))] last:border-0">
                <td className="px-4 py-3 font-medium">{t.name}</td>
                <td className="px-4 py-3 font-mono text-[hsl(var(--muted-foreground))]">{t.prefix}...</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${t.active ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                    {t.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">{formatDate(t.lastUsedAt)}</td>
                <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">{formatDate(t.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

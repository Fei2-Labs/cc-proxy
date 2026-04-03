'use client'

import { useState, useEffect } from 'react'
import { Copy, Check, Plus, Trash2, RefreshCw } from 'lucide-react'

type Token = {
  id: number
  name: string
  prefix: string
  token: string | null
  active: boolean
  lastUsedAt: string | null
  createdAt: string
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="p-1 hover:bg-[hsl(var(--accent))] rounded"
    >
      {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} className="text-[hsl(var(--muted-foreground))]" />}
    </button>
  )
}

export default function TokensPage() {
  const [tokens, setTokens] = useState<Token[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedToken, setSelectedToken] = useState('YOUR_TOKEN')
  const [selectedTokenName, setSelectedTokenName] = useState('')
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-6')
  const [models, setModels] = useState<{ id: string; name: string }[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)

  const fetchModels = async (refresh = false) => {
    setModelsLoading(true)
    try {
      const res = await fetch(`/api/models${refresh ? '?refresh=1' : ''}`)
      if (res.ok) {
        const data = await res.json()
        setModels(data.models)
        if (data.models.length && !data.models.find((m: any) => m.id === selectedModel)) {
          setSelectedModel(data.models[0].id)
        }
      }
    } catch {} finally { setModelsLoading(false) }
  }

  const fetchTokens = async () => {
    const res = await fetch('/api/tokens')
    if (res.ok) setTokens((await res.json()).tokens)
  }

  useEffect(() => { fetchTokens(); fetchModels() }, [])

  const handleCreate = async () => {
    if (!name.trim()) return
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed'); return }
      setSelectedToken(data.token)
      setSelectedTokenName(name.trim())
      setName('')
      fetchTokens()
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  const handleDelete = async (id: number) => {
    await fetch('/api/tokens', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    fetchTokens()
  }

  const formatDate = (d: string | null) => d ? new Date(d + 'Z').toLocaleString() : '\u2014'

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-server.com'

  return (
    <div>
      <h1 className="text-2xl font-bold font-mono mb-6">Tokens</h1>

      <div className="flex gap-3 mb-6">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder="Token name (e.g. macbook-pro)"
          className="bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded-md px-3 py-2 text-sm flex-1 max-w-xs"
        />
        <button
          onClick={handleCreate}
          disabled={loading || !name.trim()}
          className="bg-[hsl(var(--primary))] text-white rounded-md px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          <Plus size={16} /> Create
        </button>
      </div>

      {error && <p className="text-[hsl(var(--destructive))] text-sm mb-4">{error}</p>}

      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[hsl(var(--border))]">
              <th className="text-left px-4 py-3 text-[hsl(var(--muted-foreground))] font-medium">Name</th>
              <th className="text-left px-4 py-3 text-[hsl(var(--muted-foreground))] font-medium">Token</th>
              <th className="text-left px-4 py-3 text-[hsl(var(--muted-foreground))] font-medium">Status</th>
              <th className="text-left px-4 py-3 text-[hsl(var(--muted-foreground))] font-medium">Last Used</th>
              <th className="text-left px-4 py-3 text-[hsl(var(--muted-foreground))] font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {tokens.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-[hsl(var(--muted-foreground))]">No tokens yet</td></tr>
            ) : tokens.map(t => (
              <tr key={t.id} onClick={() => { setSelectedToken(t.token || t.prefix + '...'); setSelectedTokenName(t.name) }} className="border-b border-[hsl(var(--border))] last:border-0 cursor-pointer hover:bg-[hsl(var(--accent))]">
                <td className="px-4 py-3 font-medium">{t.name}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <code className="font-mono text-[hsl(var(--muted-foreground))] text-xs">{t.token ? t.token.slice(0, 12) + '...' : t.prefix + '...'}</code>
                    <CopyButton text={t.token || t.prefix + '...'} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${t.active ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                    {t.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-[hsl(var(--muted-foreground))] text-xs">{formatDate(t.lastUsedAt)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDelete(t.id)} className="p-1 hover:bg-red-900/20 rounded text-[hsl(var(--muted-foreground))] hover:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-lg font-bold font-mono mb-4">API Usage</h2>
      <div className="flex items-center gap-4 mb-4">
        {selectedTokenName && (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Token: <code className="bg-[hsl(var(--muted))] px-1 rounded">{selectedTokenName}</code></p>
        )}
        <select
          value={selectedModel}
          onChange={e => setSelectedModel(e.target.value)}
          className="bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded-md px-2 py-1 text-xs"
        >
          {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <button
          onClick={() => fetchModels(true)}
          disabled={modelsLoading}
          className="p-1 hover:bg-[hsl(var(--accent))] rounded text-[hsl(var(--muted-foreground))]"
          title="Refresh models"
        >
          <RefreshCw size={14} className={modelsLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="space-y-4" key={selectedToken + selectedModel}>
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Client environment variables</p>
            <CopyButton text={`export ANTHROPIC_BASE_URL="${origin}"\nexport ANTHROPIC_MODEL="${selectedModel}"\nexport CLAUDE_CODE_OAUTH_TOKEN="gateway-managed"\nexport ANTHROPIC_CUSTOM_HEADERS="Proxy-Authorization: Bearer ${selectedToken}"`} />
          </div>
          <pre className="bg-[hsl(var(--muted))] rounded p-3 text-xs font-mono overflow-x-auto text-[hsl(var(--muted-foreground))]">{`export ANTHROPIC_BASE_URL="${origin}"
export ANTHROPIC_MODEL="${selectedModel}"
export CLAUDE_CODE_OAUTH_TOKEN="gateway-managed"
export ANTHROPIC_CUSTOM_HEADERS="Proxy-Authorization: Bearer ${selectedToken}"`}</pre>
        </div>

        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Send a message (curl)</p>
            <CopyButton text={`curl -X POST ${origin}/v1/messages \\\n  -H "Authorization: Bearer ${selectedToken}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"${selectedModel}","max_tokens":256,"messages":[{"role":"user","content":"Hello"}]}'`} />
          </div>
          <pre className="bg-[hsl(var(--muted))] rounded p-3 text-xs font-mono overflow-x-auto text-[hsl(var(--muted-foreground))]">{`curl -X POST ${origin}/v1/messages \\
  -H "Authorization: Bearer ${selectedToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${selectedModel}","max_tokens":256,
       "messages":[{"role":"user","content":"Hello"}]}'`}</pre>
        </div>

        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Python (anthropic SDK)</p>
            <CopyButton text={`import anthropic\n\nclient = anthropic.Anthropic(\n    base_url="${origin}",\n    api_key="${selectedToken}",\n)\n\nmessage = client.messages.create(\n    model="${selectedModel}",\n    max_tokens=256,\n    messages=[{"role": "user", "content": "Hello"}],\n)\nprint(message.content[0].text)`} />
          </div>
          <pre className="bg-[hsl(var(--muted))] rounded p-3 text-xs font-mono overflow-x-auto text-[hsl(var(--muted-foreground))]">{`import anthropic

client = anthropic.Anthropic(
    base_url="${origin}",
    api_key="${selectedToken}",
)

message = client.messages.create(
    model="${selectedModel}",
    max_tokens=256,
    messages=[{"role": "user", "content": "Hello"}],
)
print(message.content[0].text)`}</pre>
        </div>
      </div>
    </div>
  )
}

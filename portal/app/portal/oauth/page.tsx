'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Shield, CheckCircle, XCircle, AlertCircle, Copy, Check } from 'lucide-react'

type OAuthStatusType = {
  status: 'valid' | 'expired' | 'error' | 'not_configured'
  expiresAt: number | null
}

function OAuthContent() {
  const [oauthStatus, setOauthStatus] = useState<OAuthStatusType | null>(null)
  const [manualToken, setManualToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const searchParams = useSearchParams()
  const success = searchParams.get('success')
  const error = searchParams.get('error')

  const refreshStatus = () => {
    fetch('/api/oauth/status').then(r => r.ok ? r.json() : null).then(d => d && setOauthStatus(d))
  }

  useEffect(() => { refreshStatus() }, [])

  const handleSave = async () => {
    setSaving(true)
    setMsg('')
    try {
      const res = await fetch('/api/oauth/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: manualToken }),
      })
      if (res.ok) {
        setManualToken('')
        setMsg('Token saved. Refreshing status...')
        setTimeout(refreshStatus, 2000)
      } else {
        setMsg('Failed to save token')
      }
    } catch {
      setMsg('Network error')
    } finally {
      setSaving(false)
    }
  }

  const oneliner = `T=$(security find-generic-password -a "$USER" -s "Claude Code-credentials" -w 2>/dev/null || cat ~/.claude/.credentials.json) && R=$(echo "$T" | python3 -c "import sys,json;print(json.load(sys.stdin)['claudeAiOauth']['refreshToken'])") && curl -s -X POST ${typeof window !== 'undefined' ? window.location.origin : ''}/api/oauth/save -H "Content-Type: application/json" -b "cc-session=$(document.cookie)" -d "{\\"token\\":\\"$R\\"}" && echo "✅ Token uploaded"`

  const getCommand = () => {
    const cookie = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('cc-session='))
    const session = cookie?.split('=').slice(1).join('=') || 'YOUR_SESSION'
    const origin = window.location.origin
    return `T=$(security find-generic-password -a "$USER" -s "Claude Code-credentials" -w 2>/dev/null || cat ~/.claude/.credentials.json) && R=$(echo "$T" | python3 -c "import sys,json;print(json.load(sys.stdin)['claudeAiOauth']['refreshToken'])") && curl -s -X POST ${origin}/api/oauth/save -H "Content-Type: application/json" -H "Cookie: cc-session=${session}" -d "{\\"token\\":\\"$R\\"}" && echo " ✅ Token uploaded to portal"`
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(getCommand())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const statusConfig = {
    valid: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-900/30', label: 'Connected' },
    expired: { icon: AlertCircle, color: 'text-yellow-400', bg: 'bg-yellow-900/30', label: 'Expired' },
    error: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-900/30', label: 'Error' },
    not_configured: { icon: Shield, color: 'text-[hsl(var(--muted-foreground))]', bg: 'bg-[hsl(var(--muted))]', label: 'Not Connected' },
  }

  const cfg = oauthStatus ? statusConfig[oauthStatus.status] : null
  const StatusIcon = cfg?.icon || Shield

  return (
    <div>
      <h1 className="text-2xl font-bold font-mono mb-6">OAuth</h1>

      {success && (
        <div className="bg-green-900/20 border border-green-800 rounded-lg p-4 mb-6">
          <p className="text-green-400 text-sm">OAuth connected successfully.</p>
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-6">
          <p className="text-red-400 text-sm">OAuth error: {decodeURIComponent(error)}</p>
        </div>
      )}

      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg ${cfg?.bg || ''}`}>
              <StatusIcon size={24} className={cfg?.color || ''} />
            </div>
            <div>
              <p className="font-medium">Anthropic OAuth</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                {oauthStatus?.status === 'valid'
                  ? 'Token active — proxy is forwarding requests'
                  : oauthStatus?.status === 'not_configured'
                  ? 'No token configured'
                  : oauthStatus?.status === 'expired'
                  ? 'Token expired — upload a new one'
                  : 'Loading...'}
              </p>
            </div>
          </div>
          {cfg && (
            <span className={`px-2 py-0.5 rounded-full text-xs ${cfg.bg} ${cfg.color}`}>
              {cfg.label}
            </span>
          )}
        </div>
      </div>

      {/* Quick extract */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-6 mt-4">
        <p className="font-medium mb-1">Quick Extract</p>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-3">
          Run this on a Mac where Claude Code is logged in. It extracts the token and uploads it here automatically.
        </p>
        <div className="flex gap-2">
          <div className="flex-1 bg-[hsl(var(--muted))] rounded-md px-3 py-2 text-xs font-mono text-[hsl(var(--muted-foreground))] overflow-x-auto whitespace-nowrap">
            bash -c &quot;$(copy the command)&quot;
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 bg-[hsl(var(--primary))] text-white rounded-md px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy command</>}
          </button>
        </div>
      </div>

      {/* Manual paste */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-6 mt-4">
        <p className="font-medium mb-1">Manual Paste</p>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-3">
          Or paste a refresh token directly.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            placeholder="Paste refresh token..."
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            className="flex-1 bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded-md px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
          />
          <button
            onClick={handleSave}
            disabled={saving || !manualToken.trim()}
            className="bg-[hsl(var(--primary))] text-white rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
        {msg && <p className="text-sm mt-2 text-[hsl(var(--muted-foreground))]">{msg}</p>}
      </div>
    </div>
  )
}

export default function OAuthPage() {
  return (
    <Suspense fallback={<div className="text-[hsl(var(--muted-foreground))]">Loading...</div>}>
      <OAuthContent />
    </Suspense>
  )
}

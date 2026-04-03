'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Shield, CheckCircle, XCircle, AlertCircle, Copy, Check, RefreshCw } from 'lucide-react'

type OAuthStatusType = {
  status: 'valid' | 'expired' | 'error' | 'not_configured'
  expiresAt: number | null
}

function OAuthContent() {
  const [oauthStatus, setOauthStatus] = useState<OAuthStatusType | null>(null)
  const [manualToken, setManualToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState<'success' | 'error' | ''>('')
  const [copied, setCopied] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const searchParams = useSearchParams()
  const success = searchParams.get('success')
  const error = searchParams.get('error')

  const refreshStatus = useCallback(() => {
    fetch('/api/oauth/status').then(r => r.ok ? r.json() : null).then(d => d && setOauthStatus(d))
  }, [])

  useEffect(() => {
    refreshStatus()
    const interval = setInterval(refreshStatus, 5000)
    return () => clearInterval(interval)
  }, [refreshStatus])

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
        setMsg('Token saved!')
        setMsgType('success')
        refreshStatus()
      } else {
        setMsg('Failed to save token')
        setMsgType('error')
      }
    } catch {
      setMsg('Network error')
      setMsgType('error')
    } finally {
      setSaving(false)
    }
  }

  const handleRetry = async () => {
    setRetrying(true)
    setMsg('')
    try {
      const res = await fetch(`/api/oauth/retry`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setMsg('Token refreshed successfully!')
        setMsgType('success')
      } else {
        setMsg(data.error || 'Refresh failed — token may be revoked. Re-login to Claude Code and extract again.')
        setMsgType('error')
      }
      refreshStatus()
    } catch {
      setMsg('Network error')
      setMsgType('error')
    } finally {
      setRetrying(false)
    }
  }

  const handleCopy = async () => {
    try {
      const res = await fetch('/api/oauth/generate-code', { method: 'POST' })
      const { code } = await res.json()
      const origin = window.location.origin
      const cmd = `T=$(security find-generic-password -a "$USER" -s "Claude Code-credentials" -w 2>/dev/null || cat ~/.claude/.credentials.json) && R=$(echo "$T" | python3 -c "import sys,json;print(json.load(sys.stdin)['claudeAiOauth']['refreshToken'])") && curl -s -X POST ${origin}/api/oauth/upload -H "Content-Type: application/json" -d "{\\"token\\":\\"$R\\",\\"code\\":\\"${code}\\"}" && echo " ✅ Token uploaded"`
      await navigator.clipboard.writeText(cmd)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      setMsg('Failed to generate upload code')
      setMsgType('error')
    }
  }

  const statusConfig = {
    valid: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-900/30', label: 'Connected' },
    expired: { icon: AlertCircle, color: 'text-yellow-400', bg: 'bg-yellow-900/30', label: 'Expired' },
    error: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-900/30', label: 'Error' },
    not_configured: { icon: Shield, color: 'text-[hsl(var(--muted-foreground))]', bg: 'bg-[hsl(var(--muted))]', label: 'Not Connected' },
  }

  const cfg = oauthStatus ? statusConfig[oauthStatus.status] : null
  const StatusIcon = cfg?.icon || Shield
  const needsToken = oauthStatus?.status === 'expired' || oauthStatus?.status === 'not_configured' || oauthStatus?.status === 'error'

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
                  ? 'Token expired or revoked'
                  : 'Loading...'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {cfg && (
              <span className={`px-2 py-0.5 rounded-full text-xs ${cfg.bg} ${cfg.color}`}>
                {cfg.label}
              </span>
            )}
            {oauthStatus?.status === 'expired' && (
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="flex items-center gap-1.5 bg-[hsl(var(--accent))] text-[hsl(var(--foreground))] rounded-md px-3 py-1.5 text-sm hover:opacity-90 disabled:opacity-50"
              >
                <RefreshCw size={14} className={retrying ? 'animate-spin' : ''} />
                {retrying ? 'Retrying...' : 'Retry refresh'}
              </button>
            )}
          </div>
        </div>
      </div>

      {msg && (
        <div className={`rounded-lg p-4 mt-4 ${msgType === 'error' ? 'bg-red-900/20 border border-red-800' : 'bg-green-900/20 border border-green-800'}`}>
          <p className={`text-sm ${msgType === 'error' ? 'text-red-400' : 'text-green-400'}`}>{msg}</p>
        </div>
      )}

      {needsToken && (
        <div className="bg-yellow-900/10 border border-yellow-800/50 rounded-lg p-4 mt-4">
          <p className="text-yellow-400 text-sm font-medium mb-1">How to fix</p>
          <ol className="text-sm text-[hsl(var(--muted-foreground))] list-decimal list-inside space-y-1">
            <li>Open Terminal on a Mac where Claude Code is installed</li>
            <li>Run <code className="bg-[hsl(var(--muted))] px-1 py-0.5 rounded text-xs">claude</code> and complete the browser login if prompted</li>
            <li>Click <strong>Copy extract command</strong> below and paste it in Terminal</li>
            <li>This page updates automatically once the token is received</li>
          </ol>
        </div>
      )}

      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-6 mt-4">
        <p className="font-medium mb-1">Quick Extract</p>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-3">
          Extracts the token from your Mac&apos;s Keychain and uploads it here automatically.
        </p>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 bg-[hsl(var(--primary))] text-white rounded-md px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          {copied ? <><Check size={14} /> Copied! Paste in Terminal</> : <><Copy size={14} /> Copy extract command</>}
        </button>
      </div>

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

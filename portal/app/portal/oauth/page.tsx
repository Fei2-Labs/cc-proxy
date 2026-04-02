'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Shield, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

type OAuthStatusType = {
  status: 'valid' | 'expired' | 'error' | 'not_configured'
  expiresAt: number | null
}

function OAuthContent() {
  const [oauthStatus, setOauthStatus] = useState<OAuthStatusType | null>(null)
  const [connecting, setConnecting] = useState(false)
  const searchParams = useSearchParams()
  const success = searchParams.get('success')
  const error = searchParams.get('error')

  useEffect(() => {
    fetch('/api/oauth/status').then(r => r.ok ? r.json() : null).then(d => d && setOauthStatus(d))
  }, [])

  const handleConnect = async () => {
    setConnecting(true)
    try {
      const res = await fetch('/api/oauth/start', { method: 'POST' })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch {
      setConnecting(false)
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

  return (
    <div>
      <h1 className="text-2xl font-bold font-mono mb-6">OAuth</h1>

      {success && (
        <div className="bg-green-900/20 border border-green-800 rounded-lg p-4 mb-6">
          <p className="text-green-400 text-sm">OAuth connected successfully. The proxy is now using the new token.</p>
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
                {oauthStatus?.status === 'valid' && oauthStatus.expiresAt
                  ? `Token expires ${new Date(oauthStatus.expiresAt).toLocaleString()}`
                  : oauthStatus?.status === 'not_configured'
                  ? 'Connect to start proxying API requests'
                  : oauthStatus?.status === 'expired'
                  ? 'Token expired \u2014 reconnect to refresh'
                  : 'Loading...'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {cfg && (
              <span className={`px-2 py-0.5 rounded-full text-xs ${cfg.bg} ${cfg.color}`}>
                {cfg.label}
              </span>
            )}
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="bg-[hsl(var(--primary))] text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {connecting ? 'Redirecting...' : oauthStatus?.status === 'valid' ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 text-sm text-[hsl(var(--muted-foreground))]">
        <p>This connects to Anthropic using the official Claude Code OAuth protocol.</p>
        <p className="mt-1">The refresh token is stored securely in the local database.</p>
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

'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { Shield, CheckCircle, AlertCircle } from 'lucide-react'

type OAuthStatusType = { status: 'valid' | 'expired' | 'error' | 'not_configured' }

function OAuthContent() {
  const [status, setStatus] = useState<OAuthStatusType | null>(null)

  const refresh = useCallback(() => {
    fetch('/api/oauth/status').then(r => r.ok ? r.json() : null).then(d => d && setStatus(d))
  }, [])

  useEffect(() => {
    refresh()
    const i = setInterval(refresh, 5000)
    return () => clearInterval(i)
  }, [refresh])

  const valid = status?.status === 'valid'
  const Icon = valid ? CheckCircle : status?.status === 'expired' ? AlertCircle : Shield

  return (
    <div>
      <h1 className="text-2xl font-bold font-mono mb-6">OAuth</h1>

      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg ${valid ? 'bg-green-900/30' : 'bg-yellow-900/30'}`}>
              <Icon size={24} className={valid ? 'text-green-400' : 'text-yellow-400'} />
            </div>
            <div>
              <p className="font-medium">Anthropic OAuth</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                {valid ? 'Connected — proxy is forwarding requests' : 'Not connected — use the macOS app to sync token'}
              </p>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-xs ${valid ? 'bg-green-900/30 text-green-400' : 'bg-yellow-900/30 text-yellow-400'}`}>
            {valid ? 'Connected' : 'Needs token'}
          </span>
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

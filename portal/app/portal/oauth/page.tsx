'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { Shield, CheckCircle, AlertCircle, Copy, Check } from 'lucide-react'

type OAuthStatusType = { status: 'valid' | 'expired' | 'error' | 'not_configured' }

function OAuthContent() {
  const [status, setStatus] = useState<OAuthStatusType | null>(null)
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(() => {
    fetch('/api/oauth/status').then(r => r.ok ? r.json() : null).then(d => d && setStatus(d))
  }, [])

  useEffect(() => {
    refresh()
    const i = setInterval(refresh, 5000)
    return () => clearInterval(i)
  }, [refresh])

  const handleCopy = async () => {
    const res = await fetch('/api/oauth/generate-code', { method: 'POST' })
    const { code } = await res.json()
    const cmd = `claude --print-access-token 2>/dev/null && T=$(security find-generic-password -a "$USER" -s "Claude Code-credentials" -w 2>/dev/null || cat ~/.claude/.credentials.json) && R=$(echo "$T" | python3 -c "import sys,json;print(json.load(sys.stdin)['claudeAiOauth']['refreshToken'])") && curl -s -X POST ${window.location.origin}/api/oauth/upload -H "Content-Type: application/json" -d "{\\"token\\":\\"$R\\",\\"code\\":\\"${code}\\"}" && echo "\\n✅ Done"`
    await navigator.clipboard.writeText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

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
                {valid ? 'Connected — proxy is forwarding requests' : 'Not connected'}
              </p>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-xs ${valid ? 'bg-green-900/30 text-green-400' : 'bg-yellow-900/30 text-yellow-400'}`}>
            {valid ? 'Connected' : 'Needs token'}
          </span>
        </div>
      </div>

      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-6 mt-4">
        <p className="font-medium mb-2">{valid ? 'Update token' : 'Connect'}</p>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">
          Copy and paste into Terminal on a Mac with Claude Code logged in. This page updates automatically.
        </p>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 bg-[hsl(var(--primary))] text-white rounded-md px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          {copied ? <><Check size={14} /> Copied! Paste in Terminal</> : <><Copy size={14} /> Copy command</>}
        </button>
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

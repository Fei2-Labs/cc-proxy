'use client'

import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const params = useSearchParams()
  const urlError = params.get('error')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/magiclink/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to send link')
        return
      }
      setSent(true)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))]">
      <div className="w-full max-w-sm bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-8">
        <h1 className="text-2xl font-bold font-mono mb-6 text-center">CC Proxy</h1>
        {sent ? (
          <div className="text-center text-sm text-[hsl(var(--muted-foreground))]">
            <p className="mb-2">✉️ Check your email</p>
            <p>We sent a sign-in link to <strong className="text-[hsl(var(--foreground))]">{email}</strong></p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              name="email"
              type="email"
              placeholder="you@example.com"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded-md px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
            />
            {(error || urlError) && (
              <p className="text-[hsl(var(--destructive))] text-sm">
                {error || (urlError === 'invalid_or_expired' ? 'Link expired or already used' : urlError)}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="bg-[hsl(var(--primary))] text-white rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

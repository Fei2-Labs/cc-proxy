'use client'

import { useState, type FormEvent } from 'react'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }

      window.location.href = '/portal'
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
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            name="password"
            type="password"
            placeholder="Admin password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded-md px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
          />
          {error && <p className="text-[hsl(var(--destructive))] text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="bg-[hsl(var(--primary))] text-white rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

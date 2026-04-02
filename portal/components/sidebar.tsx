'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Key, Shield, BarChart3, FileText, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { label: 'Dashboard', href: '/portal', icon: LayoutDashboard },
  { label: 'Tokens', href: '/portal/tokens', icon: Key },
  { label: 'OAuth', href: '/portal/oauth', icon: Shield },
  { label: 'Usage', href: '/portal/usage', icon: BarChart3 },
  { label: 'Logs', href: '/portal/logs', icon: FileText },
]

export function Sidebar() {
  const pathname = usePathname()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <aside className="w-60 h-screen bg-[hsl(var(--card))] border-r border-[hsl(var(--border))] flex flex-col">
      <div className="px-4 py-5 text-lg font-bold font-mono">CC Proxy</div>
      <nav className="flex-1 flex flex-col gap-1 px-2">
        {navItems.map(({ label, href, icon: Icon }) => {
          const active = href === '/portal' ? pathname === '/portal' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]',
                active && 'bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]'
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
      </nav>
      <button
        onClick={handleLogout}
        className="flex items-center gap-3 mt-auto px-5 py-4 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] border-t border-[hsl(var(--border))]"
      >
        <LogOut size={16} />
        Logout
      </button>
    </aside>
  )
}

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold font-mono mb-2">Dashboard</h1>
      <p className="text-[hsl(var(--muted-foreground))] text-sm">
        Overview of your CC Proxy gateway. Stats and metrics will appear here.
      </p>
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-6">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Active Tokens</p>
          <p className="text-3xl font-bold font-mono mt-1">—</p>
        </div>
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-6">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Requests Today</p>
          <p className="text-3xl font-bold font-mono mt-1">—</p>
        </div>
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-6">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">OAuth Status</p>
          <p className="text-3xl font-bold font-mono mt-1">—</p>
        </div>
      </div>
    </div>
  )
}

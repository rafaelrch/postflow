export default function AgendaLoading() {
  return (
    <div className="flex-1 overflow-y-auto p-8" style={{ background: 'var(--paper)' }}>
      <div className="max-w-6xl mx-auto animate-pulse">
        <div className="flex items-center justify-between mb-10">
          <div>
            <div className="h-3 w-24 rounded bg-black/10 dark:bg-white/10 mb-3" />
            <div className="h-9 w-56 rounded bg-black/10 dark:bg-white/10" />
          </div>
          <div className="h-10 w-36 rounded-xl bg-black/10 dark:bg-white/10" />
        </div>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={`h${i}`} className="h-4 rounded bg-black/[0.06] dark:bg-white/[0.06]" />
          ))}
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-black/[0.04] dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/[0.05]" />
          ))}
        </div>
      </div>
    </div>
  );
}

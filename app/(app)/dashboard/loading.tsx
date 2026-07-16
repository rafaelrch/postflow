export default function DashboardLoading() {
  return (
    <div className="flex-1 overflow-y-auto p-8" style={{ background: 'var(--paper)' }}>
      <div className="max-w-6xl mx-auto animate-pulse">
        <div className="flex items-center justify-between mb-10">
          <div>
            <div className="h-3 w-24 rounded bg-black/10 dark:bg-white/10 mb-3" />
            <div className="h-9 w-64 rounded bg-black/10 dark:bg-white/10" />
          </div>
          <div className="h-10 w-40 rounded-xl bg-black/10 dark:bg-white/10" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl overflow-hidden border border-black/[0.07] dark:border-white/[0.07]">
              <div className="aspect-[4/5] bg-black/[0.06] dark:bg-white/[0.06]" />
              <div className="p-3">
                <div className="h-3 w-3/4 rounded bg-black/10 dark:bg-white/10 mb-2" />
                <div className="h-2.5 w-1/2 rounded bg-black/[0.06] dark:bg-white/[0.06]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

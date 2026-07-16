export default function ContaLoading() {
  return (
    <div className="p-8 max-w-2xl mx-auto w-full animate-pulse">
      <div className="h-7 w-32 rounded bg-black/10 dark:bg-white/10" />
      <div className="mt-2 h-4 w-56 rounded bg-black/[0.06] dark:bg-white/[0.06]" />
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6">
          <div className="h-5 w-36 rounded bg-black/10 dark:bg-white/10 mb-5" />
          <div className="space-y-3">
            <div className="h-4 w-full rounded bg-black/[0.06] dark:bg-white/[0.06]" />
            <div className="h-4 w-5/6 rounded bg-black/[0.06] dark:bg-white/[0.06]" />
            <div className="h-4 w-2/3 rounded bg-black/[0.06] dark:bg-white/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  );
}

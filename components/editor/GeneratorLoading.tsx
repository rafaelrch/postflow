export default function GeneratorLoading() {
  return (
    <div
      className="h-full flex overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label="Carregando carrossel"
      style={{ background: 'var(--paper)' }}
    >
      <div
        className="w-[320px] shrink-0 border-r border-black/[0.06] dark:border-white/[0.06]"
        style={{ background: 'var(--surface)' }}
      />
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-3 text-[12px]" style={{ color: 'var(--ink-dim)' }}>
          <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: 'var(--accent)' }} />
          Carregando seu carrossel…
        </div>
      </div>
    </div>
  );
}

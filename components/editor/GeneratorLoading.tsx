export default function GeneratorLoading() {
  return (
    <div
      className="h-full flex overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label="Carregando carrossel"
      style={{ background: 'var(--paper)' }}
    >
      {/* Espelha o painel flutuante do editor — mesma largura, margem e raio.
          Coluna cheia colada na borda fazia a barra "pular" ao terminar de
          carregar. */}
      <div
        className="w-[285px] shrink-0 ml-[15px] my-[18px] rounded-[16px]"
        style={{ background: 'var(--studio-panel)' }}
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

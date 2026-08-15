'use client';

/**
 * Rede de segurança do /admin. Erros esperados de LEITURA já são tratados
 * dentro de OverviewMetrics (RetryPanel); isto aqui pega o que escapou.
 * A mensagem técnica fica no console do servidor, não na tela.
 */
export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="brand-card max-w-xl border-[var(--danger)] p-6 sm:p-8" role="alert">
      <p className="section-kicker text-[var(--danger)]">Erro</p>
      <h2 className="font-display mt-1 text-3xl leading-none">O painel não carregou</h2>
      <hr className="hairline my-4" />
      <p className="text-sm text-[var(--ink-2)]">
        Nada foi alterado — o painel só lê dados. Tente de novo; se persistir, o motivo está no log
        do servidor.
      </p>
      <button type="button" onClick={reset} className="brand-btn primary mt-5">
        Tentar de novo
      </button>
    </section>
  );
}

'use client';

/**
 * Rede de segurança do /admin. Erros esperados de LEITURA já são tratados
 * dentro de OverviewMetrics (RetryPanel); isto aqui pega o que escapou.
 * A mensagem técnica fica no console do servidor, não na tela.
 */
export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="admin-state-card admin-state-card--danger" role="alert">
      <p className="admin-state-code">Erro</p>
      <h2>O painel não carregou</h2>
      <p>
        Nada foi alterado — o painel só lê dados. Tente de novo; se persistir, o motivo está no log
        do servidor.
      </p>
      <button type="button" onClick={reset} className="admin-state-action">
        Tentar de novo
      </button>
    </section>
  );
}

import Link from 'next/link';

/**
 * UI do 403 do /admin.
 *
 * Não diz QUAL condição falhou (fora da allowlist, e-mail não confirmado,
 * allowlist não configurada): para quem está do lado de fora, isso é
 * informação sobre a configuração do servidor. O motivo fica no `reason` que
 * só o servidor enxerga.
 */
export default function AdminForbidden() {
  return (
    <section className="admin-state-card" data-testid="admin-403">
      <p className="admin-state-code">403 · acesso negado</p>
      <h2>Esta conta não tem acesso</h2>
      <p>
        Você está autenticado, mas esta conta não pode ver o painel administrativo.
      </p>
      <Link href="/dashboard" className="admin-state-action admin-state-action--secondary">
        Voltar ao Creatools
      </Link>
    </section>
  );
}

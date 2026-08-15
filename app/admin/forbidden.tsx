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
    <section className="brand-card max-w-xl p-6 sm:p-8" data-testid="admin-403">
      <p className="section-kicker">403 · acesso negado</p>
      <h2 className="font-display mt-1 text-3xl leading-none">Esta conta não tem acesso</h2>
      <hr className="hairline my-4" />
      <p className="text-sm text-[var(--ink-2)]">
        Você está autenticado, mas esta conta não pode ver o painel administrativo.
      </p>
      <Link href="/dashboard" className="brand-btn mt-5 outline">
        Voltar ao Creatools
      </Link>
    </section>
  );
}

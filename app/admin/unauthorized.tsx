import Link from 'next/link';

/**
 * UI do 401 do /admin — renderizada quando requireAdminPage() chama
 * unauthorized(). O status HTTP é 401 de verdade, não uma tela bonita com 200.
 */
export default function AdminUnauthorized() {
  return (
    <section className="brand-card max-w-xl p-6 sm:p-8" data-testid="admin-401">
      <p className="section-kicker">401 · não autenticado</p>
      <h2 className="font-display mt-1 text-3xl leading-none">Entre para continuar</h2>
      <hr className="hairline my-4" />
      <p className="text-sm text-[var(--ink-2)]">
        Esta área é interna. Faça login com a conta administrativa.
      </p>
      <Link href="/login?next=/admin" className="brand-btn primary mt-5">
        Ir para o login
      </Link>
    </section>
  );
}

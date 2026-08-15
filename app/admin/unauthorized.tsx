import Link from 'next/link';

/**
 * UI do 401 do /admin — renderizada quando requireAdminPage() chama
 * unauthorized(). O status HTTP é 401 de verdade, não uma tela bonita com 200.
 */
export default function AdminUnauthorized() {
  return (
    <section className="admin-state-card" data-testid="admin-401">
      <p className="admin-state-code">401 · não autenticado</p>
      <h2>Entre para continuar</h2>
      <p>
        Esta área é interna. Faça login com a conta administrativa.
      </p>
      <Link href="/login?next=/admin" className="admin-state-action">
        Ir para o login
      </Link>
    </section>
  );
}

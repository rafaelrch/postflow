import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/**
 * Moldura comum das três páginas de retorno do checkout do Asaas
 * (sucesso / cancelado / expirado).
 *
 * São páginas de recado, não de estado: nenhuma delas consulta o banco nem
 * decide se o usuário virou assinante. Quem decide isso é o webhook.
 */
export default function Shell({
  title,
  children,
  cta,
}: {
  title: string;
  children: React.ReactNode;
  cta: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-6 py-16">
      <Link
        href="/"
        className="mb-8 inline-flex w-fit items-center gap-2 text-sm text-[var(--ink-dim)] transition-colors hover:text-[var(--ink)]"
      >
        <ArrowLeft size={16} aria-hidden />
        Voltar para o início
      </Link>

      <h1 className="text-3xl font-semibold text-[var(--foreground)]">{title}</h1>

      <div className="mt-4 space-y-4 text-[var(--ink-dim)]">{children}</div>

      <div className="mt-8 flex flex-wrap gap-3">{cta}</div>
    </main>
  );
}

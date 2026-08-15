'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

/**
 * Erro de carga do painel.
 *
 * A mensagem técnica NÃO aparece na tela: ela pode carregar nome de tabela e
 * detalhe de query. O motivo real vai para o log do servidor; aqui fica o que
 * a pessoa pode fazer a respeito.
 */
export default function RetryPanel({ message }: { message?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="admin-retry-panel" role="alert">
      <p>Falha ao carregar</p>
      <p>
        {message ?? 'Não foi possível ler os números agora. Nada foi alterado — o painel só lê dados.'}
      </p>
      <button
        type="button"
        onClick={() => startTransition(() => router.refresh())}
        disabled={pending}
        className="admin-retry-button"
        data-testid="admin-tentar-de-novo"
      >
        {pending ? 'Tentando…' : 'Tentar de novo'}
      </button>
    </div>
  );
}

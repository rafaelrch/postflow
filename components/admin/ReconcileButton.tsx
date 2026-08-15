'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { RefreshCcwDot } from 'lucide-react';
import type { ReconciliationSummary } from '@/lib/asaas-reconciliation';

/**
 * Dispara a reconciliação dos eventos pendentes do Asaas.
 *
 * É a ÚNICA ação de escrita da aba Saúde, e ela é deliberadamente estreita:
 * registra cancelamento que veio do provedor e conclui o evento. Não concede
 * acesso, não revoga acesso, não mexe em crédito nem em cobrança. O que ela
 * não souber resolver continua pendente e continua no alerta — ver
 * lib/asaas-reconciliation.ts.
 *
 * O resumo fica na tela em vez de virar toast: o número de eventos que ficaram
 * de fora, e por quê, é a informação que decide o próximo passo do Rafael.
 */
export default function ReconcileButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enviando, setEnviando] = useState(false);
  const [resumo, setResumo] = useState<ReconciliationSummary | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function reconciliar() {
    if (enviando || pending) return;
    setEnviando(true);
    setErro(null);
    try {
      const resposta = await fetch('/api/admin/reconciliar', { method: 'POST' });
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        setErro(dados?.error ?? 'Falha ao reconciliar os eventos.');
        return;
      }
      setResumo(dados as ReconciliationSummary);
      // Os alertas são lidos no servidor: sem revalidar, a tela continuaria
      // mostrando o estado de antes da reconciliação.
      startTransition(() => router.refresh());
    } catch {
      setErro('Falha ao reconciliar os eventos.');
    } finally {
      setEnviando(false);
    }
  }

  const ocupado = enviando || pending;

  return (
    <div className="admin-reconcile">
      <button
        type="button"
        className="admin-metric-retry"
        data-testid="reconciliar-eventos"
        disabled={ocupado}
        onClick={reconciliar}
      >
        <RefreshCcwDot size={12} strokeWidth={1.8} aria-hidden />
        {ocupado ? 'Reconciliando…' : 'Reconciliar eventos pendentes'}
      </button>

      {erro && (
        <p role="alert" data-testid="reconciliar-erro">{erro}</p>
      )}

      {resumo && !erro && (
        <p role="status" data-testid="reconciliar-resumo">
          {resumo.scanned === 0
            ? 'Nenhum evento pendente.'
            : `${resumo.scanned} evento(s) lidos · ${resumo.reconciled} reconciliado(s) · ` +
              `${resumo.alreadyReconciled} já estava(m) em dia · ${resumo.skipped.length} continua(m) pendente(s)`}
          {resumo.skipped.length > 0 && ' — os pendentes seguem no alerta acima, para você decidir.'}
        </p>
      )}
    </div>
  );
}

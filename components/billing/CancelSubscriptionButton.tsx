'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';

/**
 * Cancelar assinatura, a partir do card "Assinatura" em /conta.
 *
 * A página é server component; o botão e o popup vivem aqui.
 *
 * A regra que o texto desta tela precisa respeitar: cancelar NÃO tira o acesso
 * agora. Para a cobrança e o acesso segue até o fim do ciclo já pago (ver
 * scheduleSubscriptionCancellation). Dizer "você perderá o acesso" seria
 * mentira, e a mentira contrária — dizer "cancelado" quando a rota falhou — é
 * pior ainda: a pessoa é cobrada no mês seguinte e abre chargeback. Por isso o
 * estado de sucesso só aparece com res.ok.
 */

function fmtDia(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    // Fuso fixo: a data vem gravada como o fim do dia em Brasília, que em UTC
    // já é o dia seguinte. Sem isto, o navegador de quem estiver fora do Brasil
    // (ou o servidor, em /conta) mostraria um dia diferente do outro.
    timeZone: 'America/Sao_Paulo',
  });
}

/** Mensagem por código da rota. Genérico só como último recurso. */
function mensagemDeErro(code: unknown): string {
  if (code === 'no_active_subscription') {
    return 'Não encontramos assinatura ativa nesta conta. Se você acha que isso está errado, fale com o suporte antes de tentar de novo.';
  }
  return 'Não foi possível cancelar agora, tente mais tarde. Nada foi alterado na sua assinatura.';
}

export default function CancelSubscriptionButton({
  currentPeriodEnd,
  cancelAtPeriodEnd,
}: {
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Estado local para a tela virar sem F5. O router.refresh() confirma pelo
  // servidor logo em seguida; até ele voltar, isto já mostra a verdade.
  const [agendado, setAgendado] = useState(cancelAtPeriodEnd);
  const [fimDoAcesso, setFimDoAcesso] = useState<string | null>(currentPeriodEnd);

  const dia = fmtDia(fimDoAcesso);

  async function confirmar() {
    // Guarda do clique duplo: o botão já fica disabled, mas um segundo clique
    // pode chegar antes do re-render. Dois POSTs aqui viram dois cancelamentos.
    if (enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch('/api/asaas/cancel', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(mensagemDeErro(body?.code));
        return;
      }
      if (typeof body?.currentPeriodEnd === 'string' || body?.currentPeriodEnd === null) {
        setFimDoAcesso(body.currentPeriodEnd);
      }
      setAgendado(true);
      setAberto(false);
      router.refresh();
    } catch {
      setErro(mensagemDeErro(null));
    } finally {
      setEnviando(false);
    }
  }

  if (agendado) {
    return (
      <p
        data-testid="assinatura-cancelada"
        className="mt-5 pt-4 border-t border-[var(--border)] text-sm"
        style={{ color: 'var(--ink-dim)' }}
      >
        {dia
          ? <>Assinatura cancelada — seu acesso continua até <strong style={{ color: 'var(--ink)' }}>{dia}</strong>. Não haverá nova cobrança.</>
          : 'Assinatura cancelada — seu acesso continua até o fim do período já pago. Não haverá nova cobrança.'}
      </p>
    );
  }

  return (
    <div className="mt-5 pt-4 border-t border-[var(--border)]">
      <button
        type="button"
        data-testid="abrir-cancelamento"
        onClick={() => { setErro(null); setAberto(true); }}
        /*
          Vermelho sólido com texto branco. SEM a classe `outline`: o .brand-btn
          base já traz a borda e a sombra dura da marca (--sh-2 = 4px 4px 0 0
          var(--ink)), com --sh-3 no hover e --sh-press no clique. Só o fundo e a
          cor do texto mudam aqui — sombra nova, inventada, sairia do padrão do
          resto do app e não seguiria o tema.
          #fff sobre --danger (#C0392B) dá ~5,4:1, acima do 4,5:1 da WCAG AA.
        */
        className="brand-btn sm"
        style={{ background: 'var(--danger)', color: '#fff' }}
      >
        Cancelar assinatura
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => { if (!enviando) setAberto(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancelar-assinatura-titulo"
            className="relative w-full max-w-[520px] rounded-[18px] p-7"
            style={{ background: 'var(--paper)', border: '1.5px solid var(--line-strong)', boxShadow: 'var(--sh-2)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              data-testid="fechar-cancelamento"
              onClick={() => setAberto(false)}
              disabled={enviando}
              aria-label="Fechar"
              className="absolute top-4 right-4 w-8 h-8 grid place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              style={{ color: 'var(--ink-dim)' }}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.75} aria-hidden />
            </button>

            <span
              className="grid place-items-center w-11 h-11 rounded-[12px] mb-4"
              style={{ background: 'var(--danger)', color: '#fff' }}
              aria-hidden
            >
              <HugeiconsIcon icon={Alert01Icon} size={20} strokeWidth={1.75} aria-hidden />
            </span>

            <h2
              id="cancelar-assinatura-titulo"
              className="font-display text-[26px] leading-tight mb-2"
              style={{ color: 'var(--ink)' }}
            >
              Cancelar sua assinatura?
            </h2>

            <p
              data-testid="texto-cancelamento"
              className="text-[14px] leading-relaxed mb-6"
              style={{ color: 'var(--ink-dim)' }}
            >
              {dia
                ? <>Sua assinatura não será renovada. Você continua com acesso até <strong style={{ color: 'var(--ink)' }}>{dia}</strong>.</>
                : 'Sua assinatura não será renovada. Você continua com acesso até o fim do período já pago.'}
            </p>

            {erro && (
              <p
                data-testid="erro-cancelamento"
                role="alert"
                className="text-[13px] leading-relaxed mb-4 rounded-[10px] p-3"
                style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)' }}
              >
                {erro}
              </p>
            )}

            <div className="flex items-center gap-2">
              {/* Saída segura primeiro e com o peso visual: fechar não cancela. */}
              <button
                type="button"
                data-testid="manter-assinatura"
                onClick={() => setAberto(false)}
                disabled={enviando}
                className="brand-btn primary flex-1 justify-center"
                style={{ padding: '10px 14px' }}
              >
                Manter assinatura
              </button>
              <button
                type="button"
                data-testid="confirmar-cancelamento"
                onClick={confirmar}
                disabled={enviando}
                /*
                  Mesmo vermelho sólido do botão de /conta: são a mesma ação, e
                  duas aparências para a mesma coisa é o que confunde. O
                  desabilitado durante o envio continua vindo do
                  .brand-btn:disabled (opacidade + sombra --sh-1), sem estilo
                  próprio. "Manter assinatura" segue com o peso da saída segura.
                */
                className="brand-btn flex-1 justify-center"
                style={{ padding: '10px 14px', background: 'var(--danger)', color: '#fff' }}
              >
                {enviando ? 'Cancelando…' : 'Sim, cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

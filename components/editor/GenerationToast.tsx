'use client';

/**
 * Toast de progresso da geração de imagem por IA.
 *
 * Vive dentro de `toast.custom(...)`, e `toast.custom` NÃO aplica o
 * `toastOptions.style` do `<Toaster>` — por isso o card traz o próprio estilo.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ EXCEÇÃO DELIBERADA À REGRA DO "SÓ TOKEN" — não "corrija" isto.
 *
 * O resto da barra lateral usa `--ink`/`--paper`/`--line`, que INVERTEM no dark
 * mode. Aqui o card é branco fixo nos dois temas, por pedido do Rafael: com os
 * tokens, no escuro o `--paper` viraria quase preto e o `--ink` quase branco —
 * ou seja, texto branco sobre card branco, ilegível. Um card que flutua sobre o
 * canvas do editor precisa da própria paleta, independente do tema do app.
 *
 * Por isso as cores abaixo são literais: fundo branco, tinta escura no título,
 * cinza médio no hint, e barra/spinner escuros para terem contraste sobre o
 * branco. Quem quiser mexer, mexa aqui — não trocando por token.
 */

const CARD = '#FFFFFF';
const TITLE_INK = '#12120F';
const HINT_INK = '#6B6A63';
const TRACK = '#E6E4DC';
const FILL = '#12120F';

export default function GenerationToast({
  title,
  percent,
  hint = 'As imagens aparecem no carrossel assim que ficam prontas',
  visible = true,
}: {
  title: string;
  percent?: number;
  hint?: string;
  /** `t.visible` do react-hot-toast: entra subindo, sai subindo. */
  visible?: boolean;
}) {
  const indeterminate = percent === undefined;

  return (
    <div
      data-visible={visible ? 'true' : 'false'}
      className="postflow-gen-toast flex items-start gap-3 px-[18px] py-[14px] w-[380px] max-w-[calc(100vw-32px)]"
      style={{
        background: CARD,
        borderRadius: 16,
        // Sombra em camadas: uma difusa e ampla que dá o "levitando", outra
        // curta e próxima que ancora o card. Borda quase invisível só para o
        // card não se dissolver num fundo claro.
        boxShadow: '0 16px 40px rgba(0,0,0,.14), 0 4px 12px rgba(0,0,0,.08)',
        border: '1px solid rgba(0,0,0,.04)',
      }}
    >
      <style>{`
        @keyframes postflow-gen-spin { to { transform: rotate(360deg); } }
        @keyframes postflow-gen-slide { 0% { left: -35%; } 100% { left: 100%; } }
        @keyframes postflow-gen-in  { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes postflow-gen-out { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-12px); } }
        .postflow-gen-toast { animation: postflow-gen-in 260ms cubic-bezier(.21,1.02,.73,1) both; }
        .postflow-gen-toast[data-visible='false'] { animation: postflow-gen-out 260ms cubic-bezier(.06,.71,.55,1) forwards; }
        /* Com movimento reduzido continua havendo fade — só o deslocamento sai. */
        @media (prefers-reduced-motion: reduce) {
          @keyframes postflow-gen-in  { from { opacity: 0; } to { opacity: 1; } }
          @keyframes postflow-gen-out { from { opacity: 1; } to { opacity: 0; } }
          .postflow-gen-toast [data-progress-fill][data-indeterminate] { animation: none; }
        }
      `}</style>

      <span
        aria-hidden
        className="mt-[2px] shrink-0 rounded-full"
        style={{
          width: 18,
          height: 18,
          border: `2px solid ${TRACK}`,
          borderTopColor: HINT_INK,
          animation: 'postflow-gen-spin 0.7s linear infinite',
        }}
      />

      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <p className="text-[13px] font-bold leading-tight truncate" style={{ color: TITLE_INK }}>
          {title}
        </p>

        <div className="flex items-center gap-2">
          <div
            className="relative flex-1 overflow-hidden rounded-full"
            style={{ height: 3, background: TRACK }}
          >
            {indeterminate ? (
              <span
                data-progress-fill
                data-indeterminate="true"
                className="absolute inset-y-0 rounded-full"
                style={{
                  width: '35%',
                  background: FILL,
                  animation: 'postflow-gen-slide 1.2s ease-in-out infinite',
                }}
              />
            ) : (
              <span
                data-progress-fill
                className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-out"
                style={{ width: `${Math.max(0, Math.min(100, percent))}%`, background: FILL }}
              />
            )}
          </div>
          {!indeterminate && (
            <span className="text-[12px] tabular-nums shrink-0" style={{ color: HINT_INK }}>
              {Math.round(percent)}%
            </span>
          )}
        </div>

        <p className="text-[12px] leading-snug" style={{ color: HINT_INK }}>
          {hint}
        </p>
      </div>
    </div>
  );
}

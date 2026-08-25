'use client';

import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, SparklesIcon, Tick01Icon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';
import { MAX_INSTRUCTION_LENGTH, type RefineScope } from '@/lib/refine-text';
import type { RefinableField } from '@/lib/refine-fields';
import type { RefinePreview } from '@/hooks/useRefineText';
import { helpCls, inputCls, labelCls, selectCls } from './tokens';

/**
 * REFINAR TEXTO COM IA — melhora o texto que já existe, em três escopos.
 *
 * Postura herdada do `AiGenPanel`: um SELETOR de escopo em vez de vários
 * botões de disparo (dois botões lado a lado fazem o usuário ler duas vezes
 * para decidir; o seletor pergunta uma coisa de cada vez), direção livre em
 * textarea, e um botão só.
 *
 * ⚠️ Como no AiGenPanel, a instrução e o escopo são estado LOCAL. Quem usa
 * precisa passar `key={...activeSlideIndex}` para o painel remontar ao trocar
 * de slide — senão a direção escrita para o slide 1 continua na tela no slide 2
 * e o usuário refina o slide errado achando que escreveu de novo.
 *
 * O QUE ESTE PAINEL NÃO FAZ: escrever no store. Ele mostra o texto proposto ao
 * lado do atual e espera o "Aplicar". Este é o requisito central da task —
 * refinar por cima sem mostrar o que mudou é como o usuário perde um texto de
 * que gostava.
 */

const ESCOPOS: { id: RefineScope; rotulo: string }[] = [
  { id: 'carousel', rotulo: 'Carrossel inteiro' },
  { id: 'slide', rotulo: 'Este slide' },
  { id: 'field', rotulo: 'Este campo' },
];

/** Corta para o preview não virar uma parede de texto na barra de 285px. */
function resume(texto: string, max = 180): string {
  const limpo = texto.replace(/\s+/g, ' ').trim();
  return limpo.length > max ? `${limpo.slice(0, max - 1).trimEnd()}…` : limpo;
}

export default function RefineTextPanel({
  slideNumber,
  fields,
  loading,
  preview,
  onRefine,
  onApply,
  onDiscard,
}: {
  slideNumber: number;
  /** Campos de texto do slide ativo. Vazio = não há o que refinar por campo. */
  fields: RefinableField[];
  loading: boolean;
  preview: RefinePreview | null;
  onRefine: (params: { scope: RefineScope; instruction?: string; field?: string }) => void;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const [scope, setScope] = useState<RefineScope>('carousel');
  const [instruction, setInstruction] = useState('');
  const [field, setField] = useState('');

  // O escopo 'field' só existe com um campo para escolher. Indisponível com
  // MOTIVO VISÍVEL, nunca um erro depois de o usuário clicar em refinar.
  const fieldAvailable = fields.length > 0;
  const fieldSelecionado = fields.some((f) => f.key === field) ? field : fields[0]?.key ?? '';
  const escopoEfetivo: RefineScope = scope === 'field' && !fieldAvailable ? 'carousel' : scope;

  // Teto do servidor (400 acima de 500). Travado NO CAMPO para o usuário nunca
  // descobrir o limite por um erro — o contador aparece quando aperta.
  const excedente = MAX_INSTRUCTION_LENGTH - instruction.length;

  const disparar = () =>
    onRefine({
      scope: escopoEfetivo,
      instruction: instruction.trim() || undefined,
      ...(escopoEfetivo === 'field' ? { field: fieldSelecionado } : {}),
    });

  return (
    <div className="flex flex-col gap-2.5">
      <p className={helpCls}>
        Melhora o texto que já existe. Você vê a sugestão antes de aplicar.
      </p>

      <div>
        <span className={cn(labelCls, 'block mb-1.5')}>Refinar</span>
        <div className="flex flex-col gap-1">
          {ESCOPOS.map(({ id, rotulo }) => {
            const indisponivel = id === 'field' && !fieldAvailable;
            return (
              <button
                key={id}
                type="button"
                onClick={() => !indisponivel && setScope(id)}
                aria-pressed={escopoEfetivo === id}
                disabled={indisponivel}
                title={indisponivel ? 'Este slide não tem campo de texto preenchido para refinar.' : undefined}
                className={cn(
                  'h-8 rounded-[var(--radius-sm)] text-[12px] transition-colors border-[1.5px] px-2 text-left',
                  escopoEfetivo === id
                    ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
                    : 'bg-[var(--paper)] text-[var(--ink-dim)] border-[var(--line-strong)] hover:border-[var(--ink)]',
                  indisponivel && 'opacity-40 cursor-not-allowed hover:border-[var(--line-strong)]'
                )}
              >
                {id === 'slide' ? `Este slide (${slideNumber})` : rotulo}
              </button>
            );
          })}
        </div>
        {!fieldAvailable && (
          <p className={cn(helpCls, 'mt-1')}>
            &ldquo;Este campo&rdquo; fica disponível quando o slide tem texto escrito.
          </p>
        )}
      </div>

      {escopoEfetivo === 'field' && (
        <div>
          <span className={cn(labelCls, 'block mb-1')}>Campo</span>
          <select
            aria-label="Campo"
            className={selectCls}
            value={fieldSelecionado}
            onChange={(e) => setField(e.target.value)}
          >
            {fields.map((f) => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <span className={cn(labelCls, 'block mb-1')}>Direção (opcional)</span>
        <textarea
          aria-label="Direção (opcional)"
          value={instruction}
          // `maxLength` é a trava real: o servidor devolve 400 acima de 500 e o
          // usuário não pode descobrir isso depois de esperar a IA.
          maxLength={MAX_INSTRUCTION_LENGTH}
          onChange={(e) => setInstruction(e.target.value.slice(0, MAX_INSTRUCTION_LENGTH))}
          placeholder="Ex.: deixe mais direto, sem adjetivo…"
          className={cn(inputCls, 'resize-none')}
          style={{ minHeight: 56 }}
        />
        {excedente <= 60 && (
          <span className={helpCls}>{excedente} caracteres restantes</span>
        )}
      </div>

      <button
        type="button"
        onClick={disparar}
        disabled={loading}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-[var(--radius-sm)] bg-[var(--ink)] text-[var(--paper)] text-[12px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <HugeiconsIcon icon={SparklesIcon} size={14} strokeWidth={1.75} aria-hidden />
        {loading ? 'Refinando…' : 'Refinar com IA'}
      </button>

      {preview && (
        <div className="flex flex-col gap-2 p-2.5 rounded-[var(--radius-sm)] border-[1.5px] border-[var(--line-strong)]">
          <span className={labelCls}>
            {preview.diffs.length === 1 ? 'Sugestão' : `${preview.diffs.length} sugestões`}
          </span>

          {preview.diffs.map((d) => (
            <div key={`${d.slideIndex}-${d.key}`} className="flex flex-col gap-1">
              <span className={numericLabel}>
                Slide {d.slideIndex + 1} · {d.label}
              </span>
              {/* Atual e proposto EMPILHADOS, não em duas colunas: a barra tem
                  285px e duas colunas de ~120 quebrariam cada frase em tiras
                  ilegíveis. O que importa é a comparação, não o lado a lado. */}
              <p className={cn(helpCls, 'line-through opacity-60')}>{resume(d.before)}</p>
              <p className="text-[12px] leading-relaxed text-[var(--ink)]">{resume(d.after)}</p>
            </div>
          ))}

          <div className="grid grid-cols-2 gap-1 pt-1">
            <button
              type="button"
              onClick={onDiscard}
              className="h-8 flex items-center justify-center gap-1 rounded-[var(--radius-sm)] border-[1.5px] border-[var(--line-strong)] text-[12px] text-[var(--ink-dim)] hover:border-[var(--ink)] transition-colors"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.75} aria-hidden />
              Descartar
            </button>
            <button
              type="button"
              onClick={onApply}
              className="h-8 flex items-center justify-center gap-1 rounded-[var(--radius-sm)] bg-[var(--ink)] text-[var(--paper)] text-[12px] font-semibold hover:opacity-90 transition-opacity"
            >
              <HugeiconsIcon icon={Tick01Icon} size={14} strokeWidth={1.75} aria-hidden />
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Cabeçalho de cada diferença — menor que o rótulo de campo, não compete com ele. */
const numericLabel = 'text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]';

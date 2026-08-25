'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert01Icon, Cancel01Icon, EyeOffIcon, Tick01Icon } from '@hugeicons/core-free-icons';
import { useEditorStore } from '@/hooks/useEditorStore';
import { cn } from '@/lib/utils';
import type { CornerPlaceholderHit, DeckCornerSlot } from '@/lib/corner-placeholder';
import { DEFAULT_CORNERS, type Slide, type SlideStyle } from '@/types';

/**
 * O AVISO DO CANTO DE FÁBRICA.
 *
 * Todo deck nasce com os cantos preenchidos: 'LOREM IPSUM' / '@LOREMIPSUM' no
 * Manifesto e no Radar, '@handle' / 'Título do carrossel' no Atelier e no
 * Minimalista. Quem não editar leva esse texto dentro do PNG que publica. Este
 * popup aparece na beira do vazamento — exportar ou agendar — e oferece as duas
 * saídas de verdade: digitar o texto certo, ou desativar o canto.
 *
 * 🔸 ONDE A CORREÇÃO É GRAVADA depende do `escopo` do hit, não do estilo — o
 * detector já resolveu essa pergunta e o modal só obedece:
 *   • 'slide' → `slide.templateSlots` / `templateSlotStyles`, em TODOS os slides;
 *   • 'deck'  → `globalSettings.corners`, uma vez só.
 *
 * 🔸 Fechar NÃO é uma terceira saída ruim: o usuário pode querer exportar
 * assim mesmo, e o trabalho dele não é bloqueado. Fechar adia SÓ aquela ação,
 * sem persistir nada — na próxima exportação o aviso volta.
 */

/**
 * Rótulo de cada canto, pela POSIÇÃO dele no card — e só por ela.
 *
 * 🔸 Nada de '(sua marca)' ou '(seu @)'. O canto é espaço livre: cabe marca,
 * arroba, nicho, slogan, o nome da série. O próprio Rafael usa
 * 'BRANDING & TECNOLOGIA' no canto esquerdo, que não é marca nenhuma.
 * Presumir "uma marca por usuário" foi decisão REJEITADA por ele — o Creatools
 * atende creators E agências —, e é a mesma decisão que desenhou este popup.
 * Rótulo que promete o conteúdo do canto contradiz o popup que o contém.
 */
const SLOT_LABELS: Record<string, string> = {
  'cantos.left': 'Canto esquerdo',
  'cantos.right': 'Canto direito',
  'header.category': 'Cabeçalho esquerdo',
  'header.handle': 'Cabeçalho direito',
  topLeft: 'Canto esquerdo',
  topRight: 'Canto direito',
};

/** Os cantos de cada estilo, na ordem em que aparecem no card. */
const SLOTS_BY_STYLE: Partial<Record<SlideStyle, string[]>> = {
  template01: ['cantos.left', 'cantos.right'],
  template02: ['header.category', 'header.handle'],
  // Escopo deck: as chaves são as de `globalSettings.corners`, então servem de
  // slot e de destino da escrita sem tradução no meio.
  editorial: ['topLeft', 'topRight'],
  minimalist: ['topLeft', 'topRight'],
};

interface CornerPlaceholderModalProps {
  /** Os cantos de fábrica detectados — só eles ganham campo para digitar. */
  hits: CornerPlaceholderHit[];
  style: SlideStyle;
  /**
   * Fecha o popup e SEGUE com a ação original (exportar/agendar), venha ela de
   * "aplicar", de "desativar" ou do X. Depois de resolver o canto o usuário não
   * deve ter de clicar em exportar outra vez.
   */
  onClose: () => void;
}

export default function CornerPlaceholderModal({ hits, style, onClose }: CornerPlaceholderModalProps) {
  const { slides, updateSlide, globalSettings, updateCornersConfig } = useEditorStore();
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Um campo por canto AVISADO (a ordem do template), sem repetir slide: o
  // canto é o mesmo no deck inteiro. Um canto que o usuário já escreveu não
  // ganha campo — um campo vazio ali seria um convite a apagar o que ele fez.
  const slots = (SLOTS_BY_STYLE[style] ?? []).filter((slot) => hits.some((h) => h.slot === slot));

  // Quem manda é o hit, não o estilo: a lista de estilos de cada família vive
  // no detector, num lugar só.
  const escopo = hits[0]?.escopo ?? 'slide';

  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /**
   * Grava o texto que o usuário digitou.
   *
   * O canto é a assinatura do carrossel, não conteúdo de um slide: ele aparece
   * igual em todas as páginas, seja lá o que o usuário escreva nele. Por isso,
   * no escopo 'slide', a escrita vai para TODOS os slides — escrever num só
   * produziria um deck com assinaturas diferentes por página (mesma regra do
   * `setDeckSlotText` da barra lateral). No escopo 'deck' o estado já é único:
   * uma escrita em `globalSettings.corners` resolve o carrossel inteiro.
   *
   * Campo deixado em branco NÃO é alterado: continua de fábrica, e o aviso
   * volta para ele na próxima exportação.
   */
  const aplicarTextos = () => {
    const preenchidos = slots.filter((slot) => values[slot]?.trim());
    if (preenchidos.length === 0) {
      onClose();
      return;
    }

    if (escopo === 'deck') {
      // Uma escrita só, com updateCornersConfig — NUNCA updateSlide: o card do
      // Atelier/Minimalista nem olha `slide.templateSlots`.
      const patch: Partial<typeof globalSettings.corners> = {};
      for (const slot of preenchidos) {
        const atual = globalSettings.corners?.[slot as DeckCornerSlot]
          ?? DEFAULT_CORNERS[slot as DeckCornerSlot];
        patch[slot as DeckCornerSlot] = { ...atual, text: values[slot].trim() };
      }
      updateCornersConfig(patch);
      onClose();
      return;
    }

    slides.forEach((slide: Slide, i: number) => {
      const templateSlots = { ...(slide.templateSlots ?? {}) };
      for (const slot of preenchidos) templateSlots[slot] = values[slot].trim();
      updateSlide(i, { templateSlots });
    });
    onClose();
  };

  /**
   * Some com os cantos: `visible: false` POR CANTO.
   *
   * 🔸 Só os cantos AVISADOS — a mesma lista `slots` que virou campo aqui em
   * cima. Um botão nunca desfaz trabalho que o usuário já fez e que o popup nem
   * estava questionando: quem escreveu no canto esquerdo e deixou o direito de
   * fábrica clica em desativar para sumir com o texto de exemplo, não com o que
   * ele escreveu.
   *
   * 🔴 NUNCA pelo interruptor geral `corners.show`. Dois motivos, um por
   * família: no Radar ele não faz nada (o card decide slot a slot, e o texto
   * continuaria no PNG); no Atelier/Minimalista ele faria demais — apagaria os
   * DOIS cantos, inclusive o que o aviso não estava questionando.
   */
  const desativarCantos = () => {
    if (escopo === 'deck') {
      const patch: Partial<typeof globalSettings.corners> = {};
      for (const slot of slots) {
        const atual = globalSettings.corners?.[slot as DeckCornerSlot]
          ?? DEFAULT_CORNERS[slot as DeckCornerSlot];
        patch[slot as DeckCornerSlot] = { ...atual, visible: false };
      }
      updateCornersConfig(patch);
      onClose();
      return;
    }

    slides.forEach((slide: Slide, i: number) => {
      const templateSlotStyles = { ...(slide.templateSlotStyles ?? {}) };
      for (const slot of slots) {
        templateSlotStyles[slot] = { ...(templateSlotStyles[slot] ?? {}), visible: false };
      }
      updateSlide(i, { templateSlotStyles });
    });
    onClose();
  };

  const inputCls =
    'w-full px-3 py-2.5 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm text-gray-900 dark:text-white placeholder:text-gray-900/30 dark:placeholder:text-white/30 focus:outline-none focus:border-black/30 dark:focus:border-white/30 transition-colors';

  const content = (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      // Clique FORA fecha — e, como o X, segue com a ação original.
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="corner-placeholder-title"
        data-testid="corner-placeholder-modal"
        className="bg-[var(--surface)] border border-black/10 dark:border-white/10 rounded-2xl w-full max-w-md flex flex-col max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/8 dark:border-white/8">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Alert01Icon} size={16} strokeWidth={1.75} aria-hidden className="text-amber-500" />
            <h2
              id="corner-placeholder-title"
              className="text-base font-semibold text-gray-900 dark:text-white"
            >
              Os cantos ainda estão com o texto de exemplo
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="corner-placeholder-close"
            aria-label="Fechar"
            className="text-gray-900/40 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={20} strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5">
          <p className="text-sm text-gray-900/70 dark:text-white/70">
            Do jeito que está, o texto de exemplo vai junto dentro das imagens que você
            baixar ou publicar.
          </p>

          <div className="flex flex-col gap-3">
            {slots.map((slot, i) => (
              <div key={slot}>
                <label
                  htmlFor={`corner-field-${slot}`}
                  className="block text-[11px] uppercase tracking-[0.14em] text-gray-900/50 dark:text-white/50 font-semibold mb-2"
                >
                  {SLOT_LABELS[slot] ?? slot}
                </label>
                <input
                  id={`corner-field-${slot}`}
                  ref={i === 0 ? firstFieldRef : undefined}
                  data-testid={`corner-placeholder-input-${slot}`}
                  value={values[slot] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [slot]: e.target.value }))}
                  placeholder={hits.find((h) => h.slot === slot)?.text ?? ''}
                  className={inputCls}
                />
              </div>
            ))}
          </div>

          <p className="text-[12px] text-gray-900/45 dark:text-white/45">
            Cabe qualquer texto. O que você escrever vale para todos os slides — o canto
            é a assinatura do carrossel inteiro. Campo em branco fica como está.
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-black/8 dark:border-white/8">
          <button
            type="button"
            onClick={desativarCantos}
            data-testid="corner-placeholder-disable"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-900/60 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <HugeiconsIcon icon={EyeOffIcon} size={16} strokeWidth={1.75} aria-hidden />
            {slots.length === 1 ? 'Desativar este canto' : 'Desativar os cantos'}
          </button>
          <button
            type="button"
            onClick={aplicarTextos}
            data-testid="corner-placeholder-apply"
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors',
              'bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-900/90 dark:hover:bg-white/90',
            )}
          >
            <HugeiconsIcon icon={Tick01Icon} size={16} strokeWidth={1.75} aria-hidden />
            Usar este texto
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}

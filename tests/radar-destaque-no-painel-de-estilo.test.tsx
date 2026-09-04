// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import {
  TEMPLATE_02_HIGHLIGHT_PAIRS,
  template02IsHighlightSlot,
  template02TextSlotsForModel,
} from '@/lib/templates/template-02';
import { useEditorStore } from '@/hooks/useEditorStore';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, type Slide } from '@/types';

/**
 * O DESTAQUE SAIU DE "CONTEÚDO DO SLIDE" E FOI PARA "ESTILO DO TEXTO".
 *
 * Ordem do Rafael (03/09/2026), palavras dele: *"essa parte de destaque eu
 * quero que fique na aba do Estilo do texto. A aba do Conteúdo é só pra colocar
 * o texto, tipo conteúdo, entendeu? Então o título, a chamada para ação etc."*
 *
 * O critério que ele deu é uma regra, não um gosto: CONTEÚDO é o que a pessoa
 * ESCREVE; ESTILO é COMO aquilo aparece. Escolher quais palavras do título
 * ganham o marcador é a segunda coisa — o texto já está escrito.
 *
 * 🔴 O RISCO QUE ESTE ARQUIVO GUARDA É A DUPLICATA. `cover.highlight` e
 * `content.highlight` são slots de TEXTO no spec, então entram sozinhos em
 * `template02TextSlotsForModel` e os DOIS painéis iteram essa mesma lista. Sem
 * o filtro do painel de conteúdo, o destaque apareceria duas vezes: como
 * textarea cru de um lado e como pastilhas do outro — e o textarea cru é
 * exatamente o campo que as pastilhas vieram substituir (digitando à mão é
 * fácil errar o acento e o marcador não pintar nada).
 *
 * Vale para a CAPA (modelo 1, par `cover.headline`) e para os INTERNOS
 * (modelos 2 e 3, par `content.title`).
 */

vi.mock('@/hooks/useGenerateCarouselImages', async () => {
  const real = await vi.importActual<typeof import('@/hooks/useGenerateCarouselImages')>(
    '@/hooks/useGenerateCarouselImages',
  );
  return {
    ...real,
    useGenerateCarouselImages: () => ({
      generateAll: vi.fn(), generateOne: vi.fn(), generating: false, progress: null,
    }),
    isEditorialCoverSlide: () => false,
  };
});
vi.mock('@/lib/upload-image', () => ({ uploadImageFile: vi.fn(async () => 'https://x/y.png') }));
vi.mock('react-hot-toast', () => ({
  default: { loading: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

import EditorSidebar from '@/components/editor/EditorSidebar';

afterEach(cleanup);

const TITULO = 'CINCO ERROS QUE TRAVAM';

/** A capa é o índice 0 (modelo 1); o índice 1 é um interno (modelo 2). */
const CASOS = [
  { nome: 'CAPA', indice: 0, titulo: 'cover.headline', destaque: 'cover.highlight' },
  { nome: 'INTERNO', indice: 1, titulo: 'content.title', destaque: 'content.highlight' },
] as const;

function montaBarra(active: number, slots: Record<string, string>) {
  useEditorStore.setState({
    slides: [1, 2, 3, 2, 3].map((m, i) => ({
      ...DEFAULT_SLIDE,
      id: `s${i}`,
      position: i,
      templateModel: m,
      templateSlots: i === active ? slots : {},
    })) as Slide[],
    activeSlideIndex: active,
    style: 'template02',
    globalSettings: DEFAULT_GLOBAL_SETTINGS,
  });
  render(<EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />);
}

/** Abre um painel da barra e devolve o elemento dele. */
function abre(panel: string): HTMLElement {
  const el = document.querySelector(`[data-panel="${panel}"]`) as HTMLElement;
  expect(el, `o painel ${panel} não está na barra`).toBeTruthy();
  fireEvent.click(within(el).getByRole('button', { expanded: false }));
  return el;
}

describe.each(CASOS)('$nome — as pastilhas moram no painel de ESTILO', (caso) => {
  it('o painel de ESTILO desenha as pastilhas do título', () => {
    montaBarra(caso.indice, { [caso.titulo]: TITULO });
    const estilo = abre('estiloDoTexto');

    const chips = within(estilo).getByRole('group', { name: 'Palavras em destaque' });
    expect(Array.from(chips.querySelectorAll('button')).map((b) => b.textContent)).toEqual([
      'CINCO', 'ERROS', 'QUE', 'TRAVAM',
    ]);
  });

  it('o painel de CONTEÚDO não tem mais pastilha nenhuma', () => {
    montaBarra(caso.indice, { [caso.titulo]: TITULO });
    const conteudo = abre('conteudoSlide');

    expect(within(conteudo).queryByRole('group', { name: 'Palavras em destaque' })).toBeNull();
  });

  it('o slot de destaque não aparece DUAS vezes na barra', () => {
    // O bug que o filtro evita: o painel de conteúdo iterava a mesma lista de
    // slots de texto e desenhava o destaque como textarea, ao lado das
    // pastilhas do outro painel.
    montaBarra(caso.indice, { [caso.titulo]: TITULO });
    abre('conteudoSlide');
    abre('estiloDoTexto');

    expect(document.querySelectorAll('[role="group"][aria-label="Palavras em destaque"]'))
      .toHaveLength(1);
  });

  it('clicar numa pastilha, no painel de estilo, grava o termo no slot certo', () => {
    montaBarra(caso.indice, { [caso.titulo]: TITULO });
    const estilo = abre('estiloDoTexto');

    const chips = within(estilo).getByRole('group', { name: 'Palavras em destaque' });
    fireEvent.click(within(chips).getByText('ERROS'));

    expect(useEditorStore.getState().slides[caso.indice].templateSlots?.[caso.destaque])
      .toBe('ERROS');
  });

  it('o painel de conteúdo continua com os campos de TEXTO — só o destaque saiu', () => {
    // O pedido foi mover uma coisa, não esvaziar o painel. Ele tem de continuar
    // trazendo todo slot de texto que NÃO é destaque, e nenhum a menos.
    montaBarra(caso.indice, { [caso.titulo]: TITULO });
    const conteudo = abre('conteudoSlide');

    const modelo = caso.indice === 0 ? 1 : 2;
    const esperados = template02TextSlotsForModel(modelo).filter(
      (d) => !template02IsHighlightSlot(d.slot),
    );
    expect(esperados.length, 'o modelo ficou sem slot de texto nenhum').toBeGreaterThan(0);
    expect(conteudo.querySelectorAll('textarea')).toHaveLength(esperados.length);
  });
});

describe('o par TÍTULO → DESTAQUE é dado da lib, não cópia em componente', () => {
  it('a lista cobre a capa e os internos, e só eles', () => {
    expect(TEMPLATE_02_HIGHLIGHT_PAIRS.map((p) => p.destaque)).toEqual([
      'cover.highlight',
      'content.highlight',
    ]);
  });

  it('template02IsHighlightSlot reconhece os dois e recusa os outros', () => {
    expect(template02IsHighlightSlot('cover.highlight')).toBe(true);
    expect(template02IsHighlightSlot('content.highlight')).toBe(true);
    expect(template02IsHighlightSlot('cover.headline')).toBe(false);
    expect(template02IsHighlightSlot('content.title')).toBe(false);
    expect(template02IsHighlightSlot('cover.cta')).toBe(false);
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

/**
 * REFINAR TEXTO COM IA — a UI (fatia 2).
 *
 * O que estes testes travam:
 *
 * 1. **Cada escopo monta o corpo certo.** O contrato da rota já está provado em
 *    tests/refine-text-route.test.ts; aqui se prova que a UI FALA esse contrato.
 * 2. **Nada é escrito antes do "Aplicar".** É o requisito central da task: o
 *    usuário vê a sugestão e decide. Um refinamento que sobrescreve calado é
 *    como ele perde um texto de que gostava.
 * 3. **Desfazer volta em UM passo.** `pushHistory` antes de aplicar, e o `undo`
 *    que já existe na store devolve o texto original.
 * 4. **Erro não altera nada.** 402, 429 e 502 mostram mensagem e o texto fica
 *    exatamente como estava.
 *
 * A rota é MOCKADA (fetch). Nenhuma chamada real, nenhuma chave, nenhum crédito.
 */

const { mockToastError, mockToastSuccess, mockToast } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToast: vi.fn(),
}));

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(mockToast, {
    error: mockToastError,
    success: mockToastSuccess,
    loading: vi.fn(),
    custom: vi.fn(),
    dismiss: vi.fn(),
  });
  return { default: toast, toast };
});

import EditorSidebar from '@/components/editor/EditorSidebar';
import { useEditorStore } from '@/hooks/useEditorStore';
import { PANEL_REGISTRY, TEMPLATE_SIDEBAR_CONFIG } from '@/components/editor/sidebar/panels';
import { refinableFields, slidesPayload, textPatch, previewDiffs } from '@/lib/refine-fields';
import { MAX_INSTRUCTION_LENGTH } from '@/lib/refine-text';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, type Slide } from '@/types';
import { TEMPLATE_03_MODEL_COVER, TEMPLATE_03_MODEL_STEP } from '@/lib/templates/template-03';

const TITULO_0 = 'O erro que trava seu carrossel';
const DESC_0 = 'A maioria escreve para si mesma, não para quem lê.';

function slide(i: number, extra: Partial<Slide> = {}): Slide {
  return {
    ...DEFAULT_SLIDE,
    id: `s${i}`,
    position: i,
    title: i === 0 ? TITULO_0 : `Título do slide ${i + 1}`,
    description: i === 0 ? DESC_0 : `Descrição do slide ${i + 1}.`,
    ...extra,
  } as Slide;
}

function carregaEditor(slides: Slide[] = [slide(0), slide(1), slide(2)]) {
  act(() => {
    useEditorStore.getState().loadCarousel({
      id: 'c1',
      title: 'Deck de teste',
      style: 'editorial',
      slides,
      globalSettings: DEFAULT_GLOBAL_SETTINGS,
    });
  });
}

function carregaEditorT3() {
  const slides = [
    slide(0, {
      title: 'projeção antiga da capa',
      description: 'projeção antiga do corpo',
      templateModel: TEMPLATE_03_MODEL_COVER,
      templateSlots: {
        's1.title': 'Capa canônica',
        's1.body': 'Corpo canônico da capa',
        's1.handle': '@flowline',
        's1.image': 'https://cdn.test/capa.webp',
      },
    }),
    slide(1, {
      title: 'projeção antiga do passo',
      description: 'projeção antiga do corpo do passo',
      templateModel: TEMPLATE_03_MODEL_STEP,
      templateSlots: {
        's2.title': 'Passo 01 - Comece pelo fim',
        's2.body': 'Defina a ação antes de escrever.',
        's2.handle': '@flowline',
        's2.image': 'https://cdn.test/passo.webp',
      },
    }),
  ];
  carregaEditor(slides);
  act(() => useEditorStore.setState({ style: 'template03' }));
  return slides;
}

/** Resposta 200 da rota: os slides propostos. */
function respondeOk(slides: unknown) {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ slides }),
  });
}

function respondeErro(status: number, body: Record<string, unknown> = {}) {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: false,
    status,
    json: async () => body,
  });
}

/** Payload do último POST para /api/refine-text. */
function ultimoCorpo() {
  const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
  return JSON.parse(calls[calls.length - 1][1].body as string);
}

function renderizaBarra() {
  return render(
    <EditorSidebar onDownloadSlide={() => {}} onDownloadAll={() => {}} onOpenWizard={() => {}} />
  );
}

/** Abre o painel "Refinar texto com IA" na barra. */
function abrePainel() {
  fireEvent.click(screen.getByText('Refinar texto com IA'));
}

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn() as unknown as typeof fetch;
  carregaEditor();
});

afterEach(() => {
  // O auto-cleanup do testing-library depende de `globals: true`, que este
  // projeto não usa — sem isto cada render fica no document e o getByText
  // seguinte acha dois de tudo.
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe('Refinar texto — o corpo que cada escopo envia', () => {
  it('carrossel inteiro manda todos os slides, sem slideIndex nem field', async () => {
    respondeOk([{ position: 0, title: 'Refinado', description: DESC_0 }]);
    renderizaBarra();
    abrePainel();

    fireEvent.click(screen.getByRole('button', { name: 'Carrossel inteiro' }));
    fireEvent.click(screen.getByRole('button', { name: /Refinar com IA/ }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const corpo = ultimoCorpo();

    expect(corpo.scope).toBe('carousel');
    expect(corpo.style).toBe('editorial');
    expect(corpo.slides).toHaveLength(3);
    expect(corpo.slides.map((s: { position: number }) => s.position)).toEqual([0, 1, 2]);
    expect(corpo.slideIndex).toBeUndefined();
    expect(corpo.field).toBeUndefined();
  });

  it('este slide manda slideIndex do slide ativo', async () => {
    act(() => useEditorStore.getState().setActiveSlideIndex(1));
    respondeOk([{ position: 1, title: 'Refinado' }]);
    renderizaBarra();
    abrePainel();

    fireEvent.click(screen.getByRole('button', { name: /Este slide/ }));
    fireEvent.click(screen.getByRole('button', { name: /Refinar com IA/ }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const corpo = ultimoCorpo();

    expect(corpo.scope).toBe('slide');
    expect(corpo.slideIndex).toBe(1);
    expect(corpo.field).toBeUndefined();
    // A contagem NUNCA muda, mesmo com escopo de um slide só: o servidor
    // confere contagem e positions contra o que entrou.
    expect(corpo.slides).toHaveLength(3);
  });

  it('este campo manda field e slideIndex', async () => {
    respondeOk([{ position: 0, title: TITULO_0 }]);
    renderizaBarra();
    abrePainel();

    fireEvent.click(screen.getByRole('button', { name: 'Este campo' }));
    fireEvent.change(screen.getByLabelText('Campo'), { target: { value: 'description' } });
    fireEvent.click(screen.getByRole('button', { name: /Refinar com IA/ }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const corpo = ultimoCorpo();

    expect(corpo.scope).toBe('field');
    expect(corpo.slideIndex).toBe(0);
    expect(corpo.field).toBe('description');
  });

  it('a direção do usuário vai em instruction', async () => {
    respondeOk([{ position: 0, title: 'Refinado' }]);
    renderizaBarra();
    abrePainel();

    fireEvent.change(screen.getByLabelText('Direção (opcional)'), {
      target: { value: 'mais direto, sem adjetivo' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Refinar com IA/ }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(ultimoCorpo().instruction).toBe('mais direto, sem adjetivo');
  });

  it(`instruction acima de ${MAX_INSTRUCTION_LENGTH} chars é travada no campo e nunca enviada`, async () => {
    respondeOk([{ position: 0, title: 'Refinado' }]);
    renderizaBarra();
    abrePainel();

    const campo = screen.getByLabelText('Direção (opcional)') as HTMLTextAreaElement;
    // O maxLength do DOM é a trava real; o handler apara o que passar por ele
    // (colar programático, por exemplo).
    expect(campo.maxLength).toBe(MAX_INSTRUCTION_LENGTH);

    fireEvent.change(campo, { target: { value: 'a'.repeat(MAX_INSTRUCTION_LENGTH + 250) } });
    fireEvent.click(screen.getByRole('button', { name: /Refinar com IA/ }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(ultimoCorpo().instruction.length).toBe(MAX_INSTRUCTION_LENGTH);
  });
});

describe('Refinar texto — escopo "este campo" sem campo disponível', () => {
  it('fica indisponível, com motivo visível, quando o slide não tem texto', () => {
    carregaEditor([slide(0, { title: '', description: '' }), slide(1)]);
    renderizaBarra();
    abrePainel();

    // Sem jest-dom neste projeto: a propriedade do DOM é a asserção.
    const botao = screen.getByRole('button', { name: 'Este campo' }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(botao.getAttribute('title')).toContain('não tem campo de texto');
    expect(screen.getByText(/fica disponível quando o slide tem texto/)).toBeTruthy();
  });

  it('com texto no slide, a opção fica disponível e lista os campos', () => {
    renderizaBarra();
    abrePainel();

    expect((screen.getByRole('button', { name: 'Este campo' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Este campo' }));

    const seletor = screen.getByLabelText('Campo');
    const opcoes = Array.from(within(seletor).getAllByRole('option')).map((o) => o.textContent);
    expect(opcoes).toEqual(['Título', 'Descrição']);
  });
});

describe('Refinar texto — preview antes de sobrescrever', () => {
  it('mostra a sugestão e NÃO escreve no store antes do Aplicar', async () => {
    respondeOk([
      { position: 0, title: 'O erro que trava tudo', description: DESC_0 },
      { position: 1, title: 'Título do slide 2', description: 'Descrição do slide 2.' },
      { position: 2, title: 'Título do slide 3', description: 'Descrição do slide 3.' },
    ]);
    renderizaBarra();
    abrePainel();
    fireEvent.click(screen.getByRole('button', { name: /Refinar com IA/ }));

    await screen.findByText('O erro que trava tudo');
    // O texto atual aparece ao lado do proposto, para comparar.
    expect(screen.getAllByText(TITULO_0).length).toBeGreaterThan(0);

    // 🔴 O store continua intacto: nada foi escrito.
    expect(useEditorStore.getState().slides[0].title).toBe(TITULO_0);
    expect(useEditorStore.getState().history).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /Aplicar/ }));
    expect(useEditorStore.getState().slides[0].title).toBe('O erro que trava tudo');
  });

  it('Descartar joga a sugestão fora e deixa o texto original', async () => {
    respondeOk([{ position: 0, title: 'Uma sugestão qualquer' }]);
    renderizaBarra();
    abrePainel();
    fireEvent.click(screen.getByRole('button', { name: /Refinar com IA/ }));

    await screen.findByText('Uma sugestão qualquer');
    fireEvent.click(screen.getByRole('button', { name: /Descartar/ }));

    expect(screen.queryByText('Uma sugestão qualquer')).toBeNull();
    expect(useEditorStore.getState().slides[0].title).toBe(TITULO_0);
    expect(useEditorStore.getState().history).toHaveLength(0);
  });
});

describe('Refinar texto — Template 3 usa os slots canônicos', () => {
  it('resposta sem mudança é determinística e envia title/description projetados de s1/s2', async () => {
    const slides = carregaEditorT3();
    respondeOk(slides.map((s) => ({
      position: s.position,
      title: s.title,
      description: s.description,
      templateSlots: s.templateSlots,
    })));
    renderizaBarra();
    abrePainel();
    fireEvent.click(screen.getByRole('button', { name: /Refinar com IA/ }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('A IA não sugeriu nenhuma mudança neste texto.'));
    expect(ultimoCorpo().slides[0].title).toBe('Capa canônica');
    expect(ultimoCorpo().slides[0].description).toBe('Corpo canônico da capa');
    expect(screen.queryByRole('button', { name: /Aplicar/ })).toBeNull();
  });

  it('aplica a sugestão no slot s2 e mantém a projeção genérica sincronizada', async () => {
    const slides = carregaEditorT3();
    respondeOk([
      {
        position: 0,
        title: 'Capa canônica',
        description: 'Corpo canônico da capa',
        templateSlots: slides[0].templateSlots,
      },
      {
        position: 1,
        title: 'Passo 01 - Termine pelo começo',
        description: 'Defina a ação antes de escrever.',
        templateSlots: {
          ...slides[1].templateSlots,
          's2.title': 'Passo 01 - Termine pelo começo',
        },
      },
    ]);
    renderizaBarra();
    abrePainel();
    fireEvent.click(screen.getByRole('button', { name: /Refinar com IA/ }));
    await screen.findByText('Passo 01 - Termine pelo começo');
    fireEvent.click(screen.getByRole('button', { name: /Aplicar/ }));

    const passo = useEditorStore.getState().slides[1];
    expect(passo.templateSlots?.['s2.title']).toBe('Passo 01 - Termine pelo começo');
    expect(passo.title).toBe('Passo 01 - Termine pelo começo');
  });
});

describe('Refinar texto — aplicar, desfazer e autosave', () => {
  it('desfazer volta ao texto original em UM passo', async () => {
    respondeOk([
      { position: 0, title: 'Refinado 1', description: 'Descrição refinada 1.' },
      { position: 1, title: 'Refinado 2' },
      { position: 2, title: 'Refinado 3' },
    ]);
    renderizaBarra();
    abrePainel();
    fireEvent.click(screen.getByRole('button', { name: /Refinar com IA/ }));

    await screen.findByText('Refinado 1');
    fireEvent.click(screen.getByRole('button', { name: /Aplicar/ }));

    expect(useEditorStore.getState().slides.map((s) => s.title))
      .toEqual(['Refinado 1', 'Refinado 2', 'Refinado 3']);

    act(() => useEditorStore.getState().undo());

    // Um clique só devolve o carrossel inteiro — o refinamento é atômico.
    expect(useEditorStore.getState().slides.map((s) => s.title))
      .toEqual([TITULO_0, 'Título do slide 2', 'Título do slide 3']);
    expect(useEditorStore.getState().slides[0].description).toBe(DESC_0);
  });

  it('o autosave existente pega a mudança: saveStatus vira unsaved', async () => {
    act(() => useEditorStore.getState().setSaveStatus('saved'));
    respondeOk([{ position: 0, title: 'Refinado' }]);
    renderizaBarra();
    abrePainel();
    fireEvent.click(screen.getByRole('button', { name: /Refinar com IA/ }));

    await screen.findByText('Refinado');
    expect(useEditorStore.getState().saveStatus).toBe('saved');

    fireEvent.click(screen.getByRole('button', { name: /Aplicar/ }));
    expect(useEditorStore.getState().saveStatus).toBe('unsaved');
  });

  it('só as chaves de texto que voltaram entram no slide — estilo intacto', async () => {
    // `position` gravada DIFERENTE do índice: o payload manda o índice, e se o
    // slide inteiro da resposta fosse escrito por cima, a position do slide
    // seria sobrescrita e a ordem do deck se perderia.
    carregaEditor([slide(0, { position: 7 }), slide(1), slide(2)]);
    const original = useEditorStore.getState().slides[0];
    respondeOk([{ position: 0, title: 'Só o título mudou' }]);
    renderizaBarra();
    abrePainel();
    fireEvent.click(screen.getByRole('button', { name: /Refinar com IA/ }));

    await screen.findByText('Só o título mudou');
    fireEvent.click(screen.getByRole('button', { name: /Aplicar/ }));

    const depois = useEditorStore.getState().slides[0];
    expect(depois.title).toBe('Só o título mudou');
    // A descrição não veio na resposta: continua a original, não vira undefined.
    expect(depois.description).toBe(DESC_0);
    // Nada de imagem, cor, fonte ou layout foi tocado.
    expect(depois.backgroundColor).toBe(original.backgroundColor);
    expect(depois.fontSize).toEqual(original.fontSize);
    expect(depois.textPosition).toBe(original.textPosition);
    expect(depois.shadow).toEqual(original.shadow);
    expect(depois.imageType).toBe(original.imageType);
    // 🔴 position nunca entra no patch — ela é do deck, não da IA.
    expect(depois.position).toBe(7);
  });
});

describe('Refinar texto — erro nunca altera o texto', () => {
  const casos: [string, number, Record<string, unknown>, RegExp][] = [
    ['sem assinatura (402)', 402, { code: 'subscription_required', error: 'Esse recurso exige uma assinatura ativa.' }, /assinatura ativa/],
    ['rate limit (429)', 429, { code: 'rate_limited' }, /Aguarde alguns segundos/],
    ['contrato quebrado (502)', 502, { code: 'slide_count_mismatch' }, /continua como estava/],
    ['JSON inválido da IA (502)', 502, { code: 'invalid_ai_response' }, /continua como estava/],
    ['sessão expirada (401)', 401, {}, /sessão expirou/i],
  ];

  it.each(casos)('%s mostra mensagem e deixa o texto intacto', async (_nome, status, body, esperado) => {
    respondeErro(status, body);
    renderizaBarra();
    abrePainel();
    fireEvent.click(screen.getByRole('button', { name: /Refinar com IA/ }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(mockToastError.mock.calls[0][0]).toMatch(esperado);

    // Nem preview, nem escrita, nem histórico.
    expect(screen.queryByRole('button', { name: /Aplicar/ })).toBeNull();
    expect(useEditorStore.getState().slides[0].title).toBe(TITULO_0);
    expect(useEditorStore.getState().slides[0].description).toBe(DESC_0);
    expect(useEditorStore.getState().history).toHaveLength(0);
  });

  it('rede fora também não altera nada', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Falha de rede'));
    renderizaBarra();
    abrePainel();
    fireEvent.click(screen.getByRole('button', { name: /Refinar com IA/ }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(useEditorStore.getState().slides[0].title).toBe(TITULO_0);
  });
});

describe('Refinar texto — as partes puras', () => {
  it('slidesPayload manda só chaves de texto, com position pelo índice', () => {
    const payload = slidesPayload([slide(0, { backgroundColor: '#FF0000', position: 99 })]);

    expect(Object.keys(payload[0]).sort()).toEqual(['description', 'position', 'title']);
    expect(payload[0]).not.toHaveProperty('backgroundColor');
    // 🔴 position vem do ÍNDICE, não do campo gravado: é por ele que o servidor
    // confere a ordem e por ele que o updateSlide escreve de volta.
    expect(payload[0].position).toBe(0);
  });

  it('textPatch devolve só o que mudou, nunca o slide inteiro', () => {
    const s = slide(0);
    expect(textPatch(s, { position: 0, title: TITULO_0, description: DESC_0 })).toEqual({});
    expect(textPatch(s, { position: 0, title: 'Novo', description: DESC_0 })).toEqual({ title: 'Novo' });
  });

  it('refinableFields ignora campo vazio — não há o que refinar em texto que não existe', () => {
    const chaves = refinableFields(slide(0, { description: '' }), 'editorial', 0).map((f) => f.key);
    expect(chaves).toEqual(['title']);
  });

  it('previewDiffs não inventa diferença quando o texto voltou igual', () => {
    const s = [slide(0)];
    expect(previewDiffs(s, [{ position: 0, title: TITULO_0, description: DESC_0 }], 'editorial')).toEqual([]);
  });
});

describe('Regressão — a barra lateral continua inteira', () => {
  it('o painel novo entra em todos os estilos, sem derrubar os que já existiam', () => {
    for (const [estilo, grupos] of Object.entries(TEMPLATE_SIDEBAR_CONFIG)) {
      const ids = grupos.flatMap((g) => g.panels.map((p) => (typeof p === 'string' ? p : p.id)));
      expect(ids, `estilo ${estilo}`).toContain('refinarTexto');
      // Todo id configurado tem definição no registry — inclusive o novo.
      for (const id of ids) expect(PANEL_REGISTRY[id], `${estilo}/${id}`).toBeTruthy();
    }
  });

  it('os painéis do Editorial continuam renderizando junto do novo', () => {
    renderizaBarra();

    for (const rotulo of ['Imagem', 'Texto do slide', 'Layout do slide', 'Sombra / Overlay', 'Fundo do slide', 'Cantos']) {
      expect(screen.getByText(rotulo), rotulo).toBeTruthy();
    }
    expect(screen.getByText('Refinar texto com IA')).toBeTruthy();
  });

  it('o Perfil continua com os painéis dele', () => {
    act(() => useEditorStore.getState().setStyle('profile'));
    renderizaBarra();

    for (const rotulo of ['Perfil', 'Tema do carrossel', 'Conteúdo do slide', 'Destaques no texto', 'Imagem']) {
      expect(screen.getByText(rotulo), rotulo).toBeTruthy();
    }
    expect(screen.getByText('Refinar texto com IA')).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

/**
 * WIZARD REDESENHADO — 4 etapas.
 *
 * O que importa provar aqui é a FIAÇÃO do passo 1: o formato escolhido tem de
 * chegar ao editor e ao banco. Um seletor bonito que não muda o carrossel é
 * pior que nenhum seletor, porque mente para o usuário.
 */

const { inserts, loadCarousel, mockGetUser } = vi.hoisted(() => ({
  inserts: [] as { table: string; payload: Record<string, unknown> }[],
  loadCarousel: vi.fn(),
  mockGetUser: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('react-hot-toast', () => ({
  default: { loading: vi.fn(), success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/upload-image', () => ({ uploadImageFile: vi.fn() }));

/**
 * A chave ATELIER_ENABLED (lib/feature-flags.ts) está `false` desde 02/09/2026
 * — o Atelier saiu do grid do wizard. Este arquivo a fixa em `true` DE
 * PROPÓSITO: ele exercita o caminho de forma LIVRE da criação (o passo 4,
 * "Identidade visual"), e o Atelier é o único template desse tipo que o wizard
 * lista — todos os outros estão em `FIXED_VISUAL_STYLES`. Sem fixar a chave, a
 * cobertura desse caminho sumiria junto com a oferta, e o código dele
 * apodreceria calado até o Atelier voltar. Desativar não é remover: o caminho
 * continua de pé e continua testado.
 *
 * Quem prova o que o grid mostra em cada estado da chave — e que carrossel
 * Atelier salvo continua abrindo com ela desligada — é
 * tests/atelier-feature-flag.test.tsx.
 */
vi.mock('@/lib/feature-flags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/feature-flags')>()),
  ATELIER_ENABLED: true,
}));
vi.mock('@/hooks/useEditorStore', () => ({ useEditorStore: () => ({ loadCarousel }) }));
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    // getSession é o que useCreditsStore.refresh() usa depois de gerar com IA.
    auth: { getUser: mockGetUser, getSession: async () => ({ data: { session: null } }) },
    from: (table: string) => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }),
      insert: (payload: Record<string, unknown>) => {
        inserts.push({ table, payload });
        return {
          select: () => ({
            single: async () => ({ data: { id: 'carousel-1', title: 'Novo Carrossel' }, error: null }),
          }),
        };
      },
      delete: () => ({ eq: async () => ({}) }),
    }),
  }),
}));

import CreateWizard from '@/components/editor/CreateWizard';

beforeEach(() => {
  inserts.length = 0;
  loadCarousel.mockClear();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

/** Contador do progresso. O denominador fica num span próprio (animado), então
 * o texto é lido do elemento inteiro em vez de casado por getByText. */
function contador() {
  return screen.getByTestId('wizard-progress').textContent;
}

/** Botão primário do rodapé. */
function primario() {
  return screen.queryByText('Continuar') ?? screen.getByText('Gerar');
}

describe('CreateWizard — 4 etapas', () => {
  it('abre no formato do post, com contador 1 / 4 e sem Voltar', () => {
    render(<CreateWizard onClose={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Formato do post' })).toBeTruthy();
    expect(contador()).toBe('1 / 4');
    expect(screen.queryByText('Voltar')).toBeNull();

    // Os três formatos de lib/formats.ts, com as dimensões reais.
    expect(screen.getByText('Carrossel')).toBeTruthy();
    expect(screen.getByText('Quadrado')).toBeTruthy();
    expect(screen.getByText('Stories')).toBeTruthy();
    expect(screen.getByText(/1080 × 1920/)).toBeTruthy();
  });

  it('percorre as 4 etapas e o botão final vira Gerar', () => {
    render(<CreateWizard onClose={vi.fn()} />);

    fireEvent.click(primario());
    expect(screen.getByRole('heading', { name: 'Template' })).toBeTruthy();
    expect(contador()).toBe('2 / 4');
    expect(screen.getByText('Voltar')).toBeTruthy();

    fireEvent.click(primario());
    expect(screen.getByRole('heading', { name: 'Conteúdo' })).toBeTruthy();

    // O passo de conteúdo barra o avanço enquanto o prompt da IA está vazio.
    expect((primario().closest('button') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByDisplayValue('Criar com IA'), { target: { value: 'manual' } });

    fireEvent.click(primario());
    expect(screen.getByRole('heading', { name: 'Identidade visual' })).toBeTruthy();
    expect(contador()).toBe('4 / 4');
    expect(screen.getByText('Gerar')).toBeTruthy();
  });

  it('o grid traz os 4 templates na ordem, sem Minimalista', () => {
    render(<CreateWizard onClose={vi.fn()} />);
    fireEvent.click(primario());

    for (const label of ['Profile', 'Atelier', 'Manifesto', 'Radar']) {
      expect(screen.getByText(label), `template ${label} ausente`).toBeTruthy();
    }
    // O Minimalista foi retirado do wizard de propósito.
    expect(screen.queryByText(/Minimalista/i)).toBeNull();

    // A faixa de detalhe acompanha o selecionado (profile é o padrão).
    expect(screen.getByText(/Estética de post no Twitter\/X/i)).toBeTruthy();
    fireEvent.click(screen.getByText('Radar'));
    expect(screen.getByText(/os 3 modelos se alternam/i)).toBeTruthy();
  });

  it('a barra de progresso não tem contorno — só preenchimento', () => {
    render(<CreateWizard onClose={vi.fn()} />);

    const contadorEl = screen.getByTestId('wizard-progress');
    const barra = contadorEl.parentElement!.querySelector('.cw-progress-fill')!;
    const trilho = barra.parentElement as HTMLElement;
    const bolinha = trilho.querySelector('.cw-progress-knob') as HTMLElement;

    // O traçado é o preenchimento; borda desenhada aqui vira contorno duplo.
    expect(trilho.style.border).toBe('');
    expect(bolinha.style.border).toBe('');
    // A bolinha e o contador continuam existindo.
    expect(bolinha).toBeTruthy();
    expect(contadorEl.textContent).toBe('1 / 4');
  });

  it('o denominador do contador troca por um nó novo, para poder animar', () => {
    // A key no span do total é o que faz o 4 → 3 entrar com fade em vez de
    // saltar. Sem nó próprio, não há o que animar.
    vaiParaConteudo('Atelier');
    const antes = screen.getByTestId('wizard-progress').querySelector('.cw-total-swap');
    expect(antes?.textContent).toBe('4');

    fireEvent.click(screen.getByText('Voltar'));
    fireEvent.click(screen.getByText('Manifesto'));

    const depois = screen.getByTestId('wizard-progress').querySelector('.cw-total-swap');
    expect(depois?.textContent).toBe('3');
    expect(depois).not.toBe(antes);
  });

  it('o botão de web search declara o estado de toggle', () => {
    vaiParaConteudo('Atelier');
    const botao = screen.getByTitle(/busca fatos e notícias atuais/i);

    // aria-pressed alimenta o hover do :not([aria-pressed='true']) e é o que
    // um leitor de tela anuncia.
    expect(botao.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(botao);
    expect(botao.getAttribute('aria-pressed')).toBe('true');
    expect(botao.className).toContain('cw-chip');
  });

  it('as miniaturas seguem o formato escolhido no passo 1', () => {
    render(<CreateWizard onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Stories'));   // 9:16 → 1080 × 1920
    fireEvent.click(primario());

    /*
     * A afirmação continua sendo a mesma — a miniatura tem a LARGURA do
     * formato escolhido, e não a do 4:5 — mas mudou de alvo na TASK 2B.
     *
     * Antes ela media a div interna do SlidePreview (1080 × 132/1920 =
     * 74.25px), porque em 9:16 o card caía na miniatura viva por falta de
     * preview naquele formato. Agora existe preview 9:16 e o card mostra a
     * imagem, então quem carrega a largura do formato é a MOLDURA do card:
     * round(132 × 9/16) = 74px. Medir a div do SlidePreview aqui voltaria a
     * afirmar "o card caiu no fallback", que é o contrário do que a TASK 2B
     * entregou. A queda para a miniatura viva segue coberta, por asset
     * ausente e por erro de carregamento, em wizard-template-preview.
     */
    const molduras = Array.from(document.querySelectorAll('span[style*="width: 74px"]'));
    expect(molduras.length).toBe(4);
  });

  /** Vai até o passo de conteúdo com o template escolhido. */
  function vaiParaConteudo(template: string) {
    render(<CreateWizard onClose={vi.fn()} />);
    fireEvent.click(primario());
    fireEvent.click(screen.getByText(template));
    fireEvent.click(primario());
  }

  it('os campos manuais são os SLOTS do template de spec, por slide', () => {
    vaiParaConteudo('Manifesto');
    fireEvent.change(screen.getByDisplayValue('Criar com IA'), { target: { value: 'manual' } });

    // Deck fechado: 6 slides, paginados um a um.
    expect(screen.getByTestId('manual-pager').textContent).toBe('Slide 1 de 6');
    // Slots reais da capa do T1 (s1.headline / s1.eyebrow / s1.subline), com
    // o texto do spec como placeholder — não um par título/descrição genérico.
    expect(screen.getByPlaceholderText(/^Barcelona lança tipografia/)).toBeTruthy();
    expect(screen.getByPlaceholderText(/^\*Barcelona FC cria fonte/)).toBeTruthy();
    expect(screen.getByPlaceholderText(/^Cada número virou fragmento/)).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Próximo slide'));
    expect(screen.getByTestId('manual-pager').textContent).toBe('Slide 2 de 6');
  });

  it('o Template 2 pede os slots do modelo daquela posição', () => {
    vaiParaConteudo('Radar');
    fireEvent.change(screen.getByDisplayValue('Criar com IA'), { target: { value: 'manual' } });

    // Modelo 1 (capa) tem Destaque e Chamada; o modelo 2 tem Descrição.
    expect(screen.getByText('Destaque')).toBeTruthy();
    expect(screen.getByText('Chamada')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Próximo slide'));
    expect(screen.getByText('Descrição')).toBeTruthy();
    expect(screen.queryByText('Chamada')).toBeNull();
  });

  it('a grade de slides vai de 1 a 20, com 5 como padrão', () => {
    vaiParaConteudo('Atelier');
    const grade = screen.getByRole('group', { name: 'Número de slides' });
    const pills = Array.from(grade.querySelectorAll('button'));
    expect(pills.length).toBe(20);
    expect(pills.find((b) => b.getAttribute('aria-pressed') === 'true')?.textContent).toBe('5');

    fireEvent.click(pills[11]);
    expect(pills[11].getAttribute('aria-pressed')).toBe('true');
  });

  it('o JSON é validado contra o template escolhido, com erro claro', () => {
    vaiParaConteudo('Manifesto');
    fireEvent.change(screen.getByDisplayValue('Criar com IA'), { target: { value: 'json' } });

    const caixa = screen.getByPlaceholderText(/s1\.headline/);
    // O formato genérico não serve no T1: lá os campos são slots do spec.
    fireEvent.change(caixa, { target: { value: '{"slides":[{"title":"oi","description":"tudo"}]}' } });
    fireEvent.click(primario());

    const erro = screen.getByRole('alert');
    expect(erro.textContent).toMatch(/nenhum campo do Manifesto reconhecido/i);
    expect(erro.textContent).toMatch(/s1\.headline/);
    // Não avançou.
    expect(screen.getByRole('heading', { name: 'Conteúdo' })).toBeTruthy();

    // Com slots reais o JSON é aceito e o wizard gera — no T1 o conteúdo é o
    // último passo, então não há para onde avançar.
    fireEvent.change(caixa, { target: { value: '{"slides":[{"s1.headline":"Um título"}]}' } });
    expect(screen.getByText('Gerar')).toBeTruthy();
  });

  it('Template 1 e 2 encerram no conteúdo: 3 passos, sem identidade visual', () => {
    for (const template of ['Manifesto', 'Radar']) {
      vaiParaConteudo(template);
      expect(contador(), `${template} deveria ter 3 passos`).toBe('3 / 3');
      expect(screen.getByText('Gerar')).toBeTruthy();
      expect(screen.queryByText('Continuar')).toBeNull();
      cleanup();
    }

    // Os estilos de forma livre continuam com os 4.
    vaiParaConteudo('Atelier');
    expect(contador()).toBe('3 / 4');
    expect(screen.getByText('Continuar')).toBeTruthy();
  });

  it('voltar ao template e escolher um de 3 passos não deixa o wizard num passo morto', () => {
    // Editorial vai até o passo 4; trocar para Template 2 lá atrás precisa
    // trazer o usuário de volta para um passo que ainda existe.
    vaiParaVisual('Atelier');
    expect(contador()).toBe('4 / 4');

    fireEvent.click(screen.getByText('Voltar'));
    fireEvent.click(screen.getByText('Voltar'));
    fireEvent.click(screen.getByText('Radar'));
    expect(contador()).toBe('2 / 3');

    fireEvent.click(screen.getByText('Continuar'));
    expect(contador()).toBe('3 / 3');
    expect(screen.getByText('Gerar')).toBeTruthy();
  });

  it('o idioma viaja no payload; "conteúdo exato" não é mais enviado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ slides: [], caption: '', hashtags: [] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    vaiParaConteudo('Atelier');
    // O controle de "conteúdo exato" saiu da interface.
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText(/conteúdo exato/i)).toBeNull();

    fireEvent.change(screen.getByPlaceholderText(/Sobre o que é o conteúdo/), { target: { value: 'hábitos' } });
    fireEvent.change(screen.getByDisplayValue('Português (Brasil)'), { target: { value: 'en-US' } });
    fireEvent.click(primario());
    fireEvent.click(screen.getByText('Gerar'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(body.language).toBe('en-US');
    expect(body.exactContent).toBeUndefined();
    // Contrato antigo intacto.
    expect(body.prompt).toBe('hábitos');
    expect(body.style).toBe('editorial');
    expect(body.slideCount).toBe(5);
    expect(body.imageType).toBe('background');
    expect(body.generateImages).toBe(false);

    vi.unstubAllGlobals();
  });

  /** Vai do passo 1 até a identidade visual com o template escolhido. */
  function vaiParaVisual(template: string) {
    vaiParaConteudo(template);
    fireEvent.change(screen.getByDisplayValue('Criar com IA'), { target: { value: 'manual' } });
    fireEvent.click(primario());
  }

  it('ID visual: o estilo livre expõe identidade da marca, cores e tipografia', () => {
    vaiParaVisual('Atelier');

    expect(screen.getByText('Minha identidade visual')).toBeTruthy();
    expect(screen.getByText('Definir manualmente')).toBeTruthy();
    expect(screen.getByLabelText('Cor de fundo')).toBeTruthy();
    expect(screen.getByLabelText('Cor de destaque')).toBeTruthy();
    expect(screen.getByText('Tipografia')).toBeTruthy();
  });

  it('ID visual: o Profile só escolhe tema, sem a identidade do onboarding', () => {
    vaiParaVisual('Profile');

    // O ProfileSlide lê globalSettings.theme; cor livre ou paleta da marca não
    // teriam efeito nenhum neste template.
    expect(screen.getByText('Tema')).toBeTruthy();
    expect(screen.getByText('Escuro')).toBeTruthy();
    expect(screen.getByText('Claro')).toBeTruthy();
    expect(screen.queryByText('Minha identidade visual')).toBeNull();
    expect(screen.queryByText('Definir manualmente')).toBeNull();
    expect(screen.queryByLabelText('Cor de fundo')).toBeNull();
    expect(screen.queryByText('Tipografia')).toBeNull();
  });

  it('o tema escolhido no Profile chega ao carrossel gerado', async () => {
    vaiParaVisual('Profile');
    fireEvent.click(screen.getByText('Claro'));
    fireEvent.click(screen.getByText('Gerar'));

    await waitFor(() => expect(loadCarousel).toHaveBeenCalled());
    expect(loadCarousel.mock.calls[0][0].globalSettings.theme).toBe('light');
  });

  it('as cores manuais chegam ao carrossel gerado', async () => {
    vaiParaVisual('Atelier');

    fireEvent.change(screen.getByLabelText('Cor de destaque'), { target: { value: '#ff0000' } });
    fireEvent.click(screen.getByText('Gerar'));

    await waitFor(() => expect(loadCarousel).toHaveBeenCalled());
    expect(loadCarousel.mock.calls[0][0].globalSettings.accentColor).toBe('#ff0000');
  });

  it('Voltar desce uma etapa sem fechar o modal', () => {
    const onClose = vi.fn();
    render(<CreateWizard onClose={onClose} />);

    fireEvent.click(primario());
    expect(contador()).toBe('2 / 4');
    fireEvent.click(screen.getByText('Voltar'));

    expect(contador()).toBe('1 / 4');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('o formato escolhido chega ao editor E ao banco — não é decorativo', async () => {
    render(<CreateWizard onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('Stories'));   // 9:16
    fireEvent.click(primario());                    // → template
    fireEvent.click(primario());                    // → conteúdo
    fireEvent.change(screen.getByDisplayValue('Criar com IA'), { target: { value: 'manual' } });
    fireEvent.click(primario());                    // → identidade visual
    fireEvent.click(screen.getByText('Gerar'));

    await waitFor(() => expect(loadCarousel).toHaveBeenCalled());

    // 1) O editor recebe o formato em globalSettings.format.
    const carregado = loadCarousel.mock.calls[0][0];
    expect(carregado.globalSettings.format).toBe('9:16');

    // 2) O banco recebe em carousels.global_settings, que é de onde
    //    mapDbCarouselToGlobalSettings relê depois do reload.
    const carrossel = inserts.find((i) => i.table === 'carousels');
    expect(carrossel).toBeTruthy();
    expect((carrossel!.payload.global_settings as { format?: string }).format).toBe('9:16');
  });

  it('o padrão continua 4:5 quando o usuário não mexe no passo 1', async () => {
    render(<CreateWizard onClose={vi.fn()} />);

    fireEvent.click(primario());
    fireEvent.click(primario());
    fireEvent.change(screen.getByDisplayValue('Criar com IA'), { target: { value: 'manual' } });
    fireEvent.click(primario());
    fireEvent.click(screen.getByText('Gerar'));

    await waitFor(() => expect(loadCarousel).toHaveBeenCalled());
    expect(loadCarousel.mock.calls[0][0].globalSettings.format).toBe('4:5');
  });
});

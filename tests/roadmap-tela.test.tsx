// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { mockToastError, mockToastSuccess, mockRefresh } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockRefresh: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: { error: mockToastError, success: mockToastSuccess },
}));

/** A task nasce visível: depois de criar, a tela relê o quadro do servidor. */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import RoadmapClient, { emptyColumns } from '../app/(app)/roadmap/RoadmapClient';
import { ROADMAP_STATUSES, type RoadmapCard, type RoadmapColumn } from '../lib/roadmap';

function card(over: Partial<RoadmapCard> = {}): RoadmapCard {
  return {
    id: 'c1',
    title: 'Exportar em PDF',
    description: 'Uma descrição bem longa que precisa ser truncada na tela do quadro.',
    status: 'backlog',
    position: 0,
    createdAt: '2026-08-01',
    voteCount: 3,
    hasVoted: false,
    ...over,
  };
}

function board(cards: RoadmapCard[] = []): RoadmapColumn[] {
  return emptyColumns().map((col) => ({
    ...col,
    cards: cards.filter((c) => c.status === col.status),
  }));
}

function okResponse(body: unknown = { ok: true, voted: true }) {
  return { ok: true, status: 200, json: async () => body } as Response;
}
function errResponse(status: number, body: unknown = {}) {
  return { ok: false, status, json: async () => body } as Response;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse()));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// ───────────────────────────────────────────────────────── colunas

describe('roadmap — as 4 colunas', () => {
  it('renderiza as 4 na ordem, com os rótulos de interface', () => {
    render(<RoadmapClient initialColumns={board()} />);
    const titulos = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titulos).toEqual(['Backlog', 'Faremos', 'Estamos cozinhando', 'Pronto']);
  });

  it('cada coluna tem sua barra colorida, e as cores são distintas', () => {
    render(<RoadmapClient initialColumns={board()} />);
    const cores = ROADMAP_STATUSES.map(
      (s) => screen.getByTestId(`column-accent-${s}`).getAttribute('style') ?? '',
    );
    expect(new Set(cores).size).toBe(4);
    expect(cores.every((c) => c.includes('background'))).toBe(true);
  });

  it('o card cai na coluna do seu status', () => {
    render(<RoadmapClient initialColumns={board([card({ status: 'cozinhando' })])} />);
    const alvo = screen.getByTestId('card-c1');
    expect(screen.getByTestId('column-cozinhando').contains(alvo)).toBe(true);
    expect(screen.getByTestId('column-backlog').contains(alvo)).toBe(false);
  });
});

// ───────────────────────────────────────────────────────── estados

describe('roadmap — vazio, carregando e erro', () => {
  /**
   * COLUNA VAZIA FICA VAZIA (Rafael, 21/08). Havia uma frase por coluna; saiu.
   * O contador do cabeçalho continua sendo quem diz que ali não tem nada.
   */
  it('coluna vazia não tem caixa de texto nenhuma, e o contador fica', () => {
    render(<RoadmapClient initialColumns={board()} />);
    for (const s of ROADMAP_STATUSES) {
      expect(screen.queryByTestId(`column-empty-${s}`)).toBeNull();
      expect(screen.getByTestId(`column-${s}`).textContent).toContain('0');
    }
  });

  it('nenhuma das frases antigas de coluna vazia sobrou na tela', () => {
    const { container } = render(<RoadmapClient initialColumns={board()} />);
    const texto = container.textContent ?? '';
    expect(texto).not.toMatch(/Nada no backlog/i);
    expect(texto).not.toMatch(/Nada decidido/i);
    expect(texto).not.toMatch(/Nada em produção/i);
    expect(texto).not.toMatch(/primeira entrega/i);
  });

  it('carregando: esqueleto em cada coluna, sem card e sem frase de vazio', () => {
    render(<RoadmapClient initialColumns={board()} state="loading" />);
    for (const s of ROADMAP_STATUSES) {
      expect(screen.getByTestId(`column-loading-${s}`)).toBeTruthy();
      expect(screen.queryByTestId(`column-empty-${s}`)).toBeNull();
    }
  });

  /** Erro não pode virar quadro vazio: seria mentir dizendo "não há nada ainda". */
  it('erro: mensagem em cada coluna, e nenhuma frase de vazio', () => {
    render(<RoadmapClient initialColumns={board()} state="error" />);
    for (const s of ROADMAP_STATUSES) {
      expect(screen.getByTestId(`column-error-${s}`).textContent).toMatch(/não foi possível/i);
      expect(screen.queryByTestId(`column-empty-${s}`)).toBeNull();
    }
  });
});

// ───────────────────────────────────────────────────────── card

describe('roadmap — card', () => {
  it('mostra título, descrição e a contagem', () => {
    render(<RoadmapClient initialColumns={board([card()])} />);
    expect(screen.getByText('Exportar em PDF')).toBeTruthy();
    expect(screen.getByTestId('card-desc-c1').textContent).toContain('descrição bem longa');
    expect(screen.getByTestId('vote-count-c1').textContent).toBe('3');
  });

  it('a descrição é truncada em 3 linhas com reticências', () => {
    render(<RoadmapClient initialColumns={board([card()])} />);
    const style = screen.getByTestId('card-desc-c1').getAttribute('style') ?? '';
    expect(style).toContain('-webkit-line-clamp: 3');
    expect(style).toContain('overflow: hidden');
  });

  /** SÓ VOTOS: o ícone de comentário da referência não entra nesta entrega. */
  it('não existe contador de comentário na tela', () => {
    const { container } = render(<RoadmapClient initialColumns={board([card()])} />);
    expect(container.querySelector('[data-testid*="comment"]')).toBeNull();
    expect(container.textContent).not.toMatch(/coment/i);
  });
});

// ───────────────────────────────────────────────────────── voto

describe('roadmap — voto', () => {
  it('o botão é nativo e o aria-pressed reflete o hasVoted do servidor', () => {
    render(<RoadmapClient initialColumns={board([card({ hasVoted: true })])} />);
    const botao = screen.getByTestId('vote-c1');
    expect(botao.tagName).toBe('BUTTON');
    expect(botao.getAttribute('aria-pressed')).toBe('true');
  });

  it('clicar marca o voto, soma 1 e manda o cardId para a rota', async () => {
    render(<RoadmapClient initialColumns={board([card()])} />);
    fireEvent.click(screen.getByTestId('vote-c1'));

    await waitFor(() => expect(screen.getByTestId('vote-count-c1').textContent).toBe('4'));
    expect(screen.getByTestId('vote-c1').getAttribute('aria-pressed')).toBe('true');

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/roadmap/vote');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ cardId: 'c1' });
  });

  it('clicar de novo desfaz: desmarca e subtrai 1', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      okResponse({ ok: true, voted: false }),
    );
    render(<RoadmapClient initialColumns={board([card({ hasVoted: true, voteCount: 3 })])} />);

    fireEvent.click(screen.getByTestId('vote-c1'));

    await waitFor(() => expect(screen.getByTestId('vote-count-c1').textContent).toBe('2'));
    expect(screen.getByTestId('vote-c1').getAttribute('aria-pressed')).toBe('false');
  });

  /** O otimismo tem que ser reversível — senão a tela mente sobre o servidor. */
  it('falha da rota REVERTE o número e o aria-pressed, e avisa', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(errResponse(500, {}));
    render(<RoadmapClient initialColumns={board([card()])} />);

    fireEvent.click(screen.getByTestId('vote-c1'));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(screen.getByTestId('vote-count-c1').textContent).toBe('3');
    expect(screen.getByTestId('vote-c1').getAttribute('aria-pressed')).toBe('false');
  });

  it('sessão expirada (401) diz para entrar de novo', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(errResponse(401));
    render(<RoadmapClient initialColumns={board([card()])} />);
    fireEvent.click(screen.getByTestId('vote-c1'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(expect.stringMatching(/sessão/i)));
    expect(screen.getByTestId('vote-count-c1').textContent).toBe('3');
  });

  it('rate limit (429) explica que foi rápido demais', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(errResponse(429));
    render(<RoadmapClient initialColumns={board([card()])} />);
    fireEvent.click(screen.getByTestId('vote-c1'));
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(expect.stringMatching(/muitas vezes seguidas/i)),
    );
  });

  it('rede fora: reverte também', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('offline'));
    render(<RoadmapClient initialColumns={board([card()])} />);
    fireEvent.click(screen.getByTestId('vote-c1'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(screen.getByTestId('vote-count-c1').textContent).toBe('3');
  });

  it('visitante sem sessão é avisado e nada é enviado', async () => {
    render(<RoadmapClient initialColumns={board([card()])} isAuthenticated={false} />);
    fireEvent.click(screen.getByTestId('vote-c1'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(expect.stringMatching(/entre na sua conta/i)));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  /** O servidor é a autoridade: uma corrida pode terminar diferente do palpite. */
  it('se o servidor discordar do otimismo, a tela segue o servidor', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      okResponse({ ok: true, voted: true }),
    );
    render(<RoadmapClient initialColumns={board([card({ hasVoted: true, voteCount: 5 })])} />);

    fireEvent.click(screen.getByTestId('vote-c1'));

    await waitFor(() => expect(screen.getByTestId('vote-c1').getAttribute('aria-pressed')).toBe('true'));
    expect(screen.getByTestId('vote-count-c1').textContent).toBe('5');
  });
});

// ───────────────────────────────────────────────────────── popup

describe('roadmap — popup Criar task', () => {
  const TITULO_VALIDO = 'Exportar em PDF';

  function abrir() {
    render(<RoadmapClient initialColumns={board()} />);
    fireEvent.click(screen.getByTestId('criar-task'));
  }

  function preencherTitulo(valor = TITULO_VALIDO) {
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: valor } });
  }

  it('o botão do topo e o cartão da primeira coluna abrem o mesmo popup', () => {
    render(<RoadmapClient initialColumns={board()} />);
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByTestId('adicionar-task-card'));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('o cartão de adicionar fica só na PRIMEIRA coluna', () => {
    render(<RoadmapClient initialColumns={board()} />);
    const cartao = screen.getByTestId('adicionar-task-card');
    expect(screen.getByTestId('column-backlog').contains(cartao)).toBe(true);
    expect(screen.getAllByTestId('adicionar-task-card')).toHaveLength(1);
  });

  // ── a referência que o Rafael mandou ──────────────────────────────────────

  it('o título do diálogo é "Criar task" e o primário é "Criar"', () => {
    abrir();
    // Pelo id do `aria-labelledby`: o botão do cabeçalho do quadro também diz
    // "Criar task", e um getByText pegaria os dois.
    expect(document.getElementById('criar-task-titulo')?.textContent).toBe('Criar task');
    expect(screen.getByTestId('enviar-sugestao').textContent).toBe('Criar');
    expect(screen.getByTestId('cancelar-task').textContent).toBe('Cancelar');
  });

  it('tem seta de voltar e X, e os dois fecham', () => {
    abrir();
    fireEvent.click(screen.getByTestId('voltar-popup'));
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByTestId('criar-task'));
    fireEvent.click(screen.getByTestId('fechar-popup'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('os campos têm rótulo ACIMA e placeholder próprio', () => {
    abrir();
    expect(screen.getByLabelText('Título').getAttribute('placeholder')).toBe('Título da task');
    const desc = screen.getByLabelText('Descrição') as HTMLTextAreaElement;
    expect(desc.tagName).toBe('TEXTAREA');
    expect(desc.getAttribute('placeholder')).toBe('Descrição (opcional)');
    expect(desc.rows).toBe(5);
    expect(desc.className).toContain('resize-y');
  });

  /**
   * O aviso "sua sugestão passa por aprovação" SAIU: com a task nascendo no
   * Backlog ele virou mentira, e aviso que mente é pior que aviso nenhum.
   */
  it('não avisa mais que a sugestão passa por aprovação', () => {
    abrir();
    expect(screen.queryByTestId('aviso-aprovacao')).toBeNull();
    expect(screen.getByRole('dialog').textContent).not.toMatch(/aprova/i);
  });

  // ── o primário só acende com título válido ────────────────────────────────

  it('"Criar" começa desabilitado e acende quando o título fica válido', () => {
    abrir();
    const botao = screen.getByTestId('enviar-sugestao') as HTMLButtonElement;
    expect(botao.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'oi' } });
    expect(botao.disabled).toBe(true);

    preencherTitulo();
    expect(botao.disabled).toBe(false);
  });

  it('título com HTML mantém o "Criar" apagado', () => {
    abrir();
    preencherTitulo('<script>alert(1)</script>');
    expect((screen.getByTestId('enviar-sugestao') as HTMLButtonElement).disabled).toBe(true);
  });

  it('título inválido não envia nada', async () => {
    abrir();
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'oi' } });
    fireEvent.click(screen.getByTestId('enviar-sugestao'));

    await waitFor(() => expect(globalThis.fetch).not.toHaveBeenCalled());
  });

  // ── descrição opcional ────────────────────────────────────────────────────

  /** A descrição é OPCIONAL: só o título segura o envio. */
  it('descrição vazia envia, e o corpo vai com a descrição em branco', async () => {
    abrir();
    preencherTitulo();
    expect((screen.getByTestId('enviar-sugestao') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId('enviar-sugestao'));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/roadmap/suggestions');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      title: TITULO_VALIDO,
      description: '',
    });
  });

  it('descrição de duas letras também envia', async () => {
    abrir();
    preencherTitulo();
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'ok' } });
    fireEvent.click(screen.getByTestId('enviar-sugestao'));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByTestId('erro-descricao')).toBeNull();
  });

  /** O teto e o HTML continuam valendo para quem escrever alguma coisa. */
  it('HTML na descrição não envia e mostra o erro no campo', async () => {
    abrir();
    preencherTitulo();
    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Texto com <img src=x onerror=1> dentro.' },
    });
    fireEvent.click(screen.getByTestId('enviar-sugestao'));

    await waitFor(() => expect(screen.getByTestId('erro-descricao').textContent).toMatch(/HTML/));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('válidos enviam o corpo certo, já aparado', async () => {
    abrir();
    preencherTitulo('  Exportar em PDF  ');
    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: '  Queria baixar o carrossel como PDF.  ' },
    });
    fireEvent.click(screen.getByTestId('enviar-sugestao'));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/roadmap/suggestions');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      title: 'Exportar em PDF',
      description: 'Queria baixar o carrossel como PDF.',
    });
  });

  it('contadores de caractere acompanham o que foi digitado', () => {
    abrir();
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'abcde' } });
    expect(screen.getByTestId('contador-titulo').textContent).toBe('5/120');
    expect(screen.getByTestId('contador-descricao').textContent).toBe('0/2000');
  });

  it('erro 400 do servidor vira toast com a mensagem do campo', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      errResponse(400, { error: 'Dados inválidos.', fields: { title: 'O título não pode conter HTML.' } }),
    );
    abrir();
    preencherTitulo();
    fireEvent.click(screen.getByTestId('enviar-sugestao'));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('O título não pode conter HTML.'),
    );
  });

  /** Nasce no Backlog: o aviso diz isso, e a tela relê o quadro do servidor. */
  it('sucesso avisa que já está no Backlog, fecha o popup e recarrega o quadro', async () => {
    abrir();
    preencherTitulo();
    fireEvent.click(screen.getByTestId('enviar-sugestao'));

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringMatching(/backlog/i)),
    );
    expect(mockToastSuccess).not.toHaveBeenCalledWith(expect.stringMatching(/revisão|aprova/i));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('ESC fecha o popup', () => {
    abrir();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

// ───────────────────────────────────────────────────────── quadro x servidor

/**
 * O QUADRO TEM DE SEGUIR O SERVIDOR.
 *
 * `router.refresh()` re-renderiza o Server Component e entrega ao Client
 * Component um `initialColumns` NOVO — mas ele NÃO desmonta nada: a doc do Next
 * 16.2.10 (`03-api-reference/04-functions/use-router.md`) diz que o payload é
 * mesclado "without losing unaffected client-side React (e.g. useState)". Ou
 * seja: prop nova, estado velho. Um `useState(initialColumns)` que só lê a prop
 * no primeiro mount ignora o quadro atualizado para sempre, e foi exatamente
 * isso que segurou a task recém-criada fora da tela.
 *
 * Estes testes rodam o caminho REAL do refresh: props novas no mesmo componente
 * montado. É o que o `rerender` faz.
 */
describe('roadmap — o quadro segue o servidor', () => {
  it('card novo vindo do servidor aparece sem remontar o componente', () => {
    const { rerender } = render(<RoadmapClient initialColumns={board([card()])} />);
    expect(screen.getByTestId('card-c1')).toBeTruthy();
    expect(screen.queryByTestId('card-c2')).toBeNull();

    // O que o refresh entrega: MESMO componente, outro `initialColumns`.
    rerender(<RoadmapClient initialColumns={board([card(), card({ id: 'c2', title: 'Modo escuro' })])} />);

    expect(screen.getByTestId('card-c2')).toBeTruthy();
    expect(screen.getByText('Modo escuro')).toBeTruthy();
  });

  it('contagem de voto atualizada pelo servidor chega à tela', () => {
    const { rerender } = render(<RoadmapClient initialColumns={board([card({ voteCount: 3 })])} />);
    expect(screen.getByTestId('vote-count-c1').textContent).toBe('3');

    rerender(<RoadmapClient initialColumns={board([card({ voteCount: 9, hasVoted: true })])} />);

    expect(screen.getByTestId('vote-count-c1').textContent).toBe('9');
    expect(screen.getByTestId('vote-c1').getAttribute('aria-pressed')).toBe('true');
  });

  it('card removido no servidor some da tela', () => {
    const { rerender } = render(<RoadmapClient initialColumns={board([card()])} />);
    rerender(<RoadmapClient initialColumns={board([])} />);
    expect(screen.queryByTestId('card-c1')).toBeNull();
  });

  /** O contador do cabeçalho é derivado do quadro: tem de andar junto. */
  it('o contador da coluna acompanha o quadro novo', () => {
    const { rerender } = render(<RoadmapClient initialColumns={board([])} />);
    expect(screen.getByTestId('column-backlog').textContent).toContain('0');

    rerender(<RoadmapClient initialColumns={board([card()])} />);
    expect(screen.getByTestId('column-backlog').textContent).toContain('1');
  });

  /** Re-render com a MESMA prop não pode desfazer um voto otimista em curso. */
  it('re-render com o mesmo quadro preserva o voto otimista', async () => {
    const colunas = board([card()]);
    const { rerender } = render(<RoadmapClient initialColumns={colunas} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('vote-c1'));
    });
    expect(screen.getByTestId('vote-count-c1').textContent).toBe('4');

    rerender(<RoadmapClient initialColumns={colunas} />);
    expect(screen.getByTestId('vote-count-c1').textContent).toBe('4');
  });
});

// ───────────────────────────────────────────────────────── cor

/**
 * Todo BOTÃO da tela vira PRETO (Rafael, 21/08) — o token de primário do
 * produto, `--ink`, o mesmo de `.brand-btn.primary`. As BARRAS coloridas do
 * cabeçalho de cada coluna FICAM: são identidade de coluna, não botão.
 */
describe('roadmap — botão primário é preto', () => {
  it('o "Criar task" do cabeçalho usa o token de primário, não o verde', () => {
    render(<RoadmapClient initialColumns={board()} />);
    const style = screen.getByTestId('criar-task').getAttribute('style') ?? '';
    expect(style).toContain('var(--ink)');
    expect(style).not.toContain('--success');
  });

  it('o "Criar" do popup usa o mesmo token', () => {
    render(<RoadmapClient initialColumns={board()} />);
    fireEvent.click(screen.getByTestId('criar-task'));
    const style = screen.getByTestId('enviar-sugestao').getAttribute('style') ?? '';
    expect(style).toContain('var(--ink)');
    expect(style).not.toContain('--success');
  });

  it('as barras de coluna continuam coloridas e distintas', () => {
    render(<RoadmapClient initialColumns={board()} />);
    const cores = ROADMAP_STATUSES.map(
      (s) => screen.getByTestId(`column-accent-${s}`).getAttribute('style') ?? '',
    );
    expect(new Set(cores).size).toBe(4);
  });
});

// ───────────────────────────────────────────────────────── acessibilidade

describe('roadmap — acessibilidade', () => {
  it('voto e criar task são botões nativos', () => {
    render(<RoadmapClient initialColumns={board([card()])} />);
    expect(screen.getByTestId('criar-task').tagName).toBe('BUTTON');
    expect(screen.getByTestId('adicionar-task-card').tagName).toBe('BUTTON');
    expect(screen.getByTestId('vote-c1').tagName).toBe('BUTTON');
  });

  it('todo botão tem foco visível', () => {
    render(<RoadmapClient initialColumns={board([card()])} />);
    for (const id of ['criar-task', 'adicionar-task-card', 'vote-c1']) {
      expect(screen.getByTestId(id).className).toContain('focus-visible:ring');
    }
  });

  it('cada coluna é uma região nomeada', () => {
    render(<RoadmapClient initialColumns={board()} />);
    expect(screen.getByLabelText('Estamos cozinhando')).toBeTruthy();
  });

  it('o popup é um dialog modal rotulado', () => {
    render(<RoadmapClient initialColumns={board()} />);
    fireEvent.click(screen.getByTestId('criar-task'));
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('criar-task-titulo');
  });

  /** 4 colunas em tela estreita: rolam na horizontal, não se espremem. */
  it('as colunas têm largura mínima e o quadro rola na horizontal', () => {
    const { container } = render(<RoadmapClient initialColumns={board()} />);
    expect(container.querySelector('.overflow-x-auto')).toBeTruthy();
    expect(screen.getByTestId('column-backlog').className).toContain('min-w-[280px]');
  });
});


// ───────────────────────────────────────── detalhe do card (popup)

/**
 * O POPUP EXISTE POR CAUSA DA DESCRIÇÃO LONGA. O card corta em 3 linhas e, até
 * esta entrega, não havia onde ler o resto — o texto estava no banco e o produto
 * não o mostrava. Por isso os testes daqui usam uma descrição que o card
 * TRUNCA de verdade e afirmam que o popup traz o texto INTEIRO.
 */
describe('roadmap — popup de detalhe do card', () => {
  const LONGA = Array.from(
    { length: 30 },
    (_, i) => `Linha ${i + 1} de uma descrição que não cabe nas três linhas do card.`,
  ).join('\n');

  it('clicar no título abre o detalhe com o título e a descrição COMPLETOS', () => {
    render(<RoadmapClient initialColumns={board([card({ description: LONGA })])} />);
    expect(screen.queryByTestId('detalhe-popup')).toBeNull();

    // O card continua truncando — é a metade do problema que não muda.
    expect(screen.getByTestId('card-desc-c1').getAttribute('style') ?? '').toContain(
      '-webkit-line-clamp: 3',
    );

    fireEvent.click(screen.getByTestId('abrir-detalhe-c1'));

    expect(screen.getByTestId('detalhe-titulo').textContent).toBe('Exportar em PDF');
    expect(screen.getByTestId('detalhe-descricao').textContent).toBe(LONGA);
  });

  it('a descrição do popup preserva as quebras de linha e rola sozinha', () => {
    render(<RoadmapClient initialColumns={board([card({ description: LONGA })])} />);
    fireEvent.click(screen.getByTestId('abrir-detalhe-c1'));

    const desc = screen.getByTestId('detalhe-descricao');
    expect(desc.className).toContain('whitespace-pre-wrap');
    expect(desc.className).toContain('overflow-y-auto');
    // Sem corte nenhum: o popup é justamente o lugar onde o texto não é cortado.
    expect(desc.getAttribute('style') ?? '').not.toContain('line-clamp');
  });

  it('mostra a contagem de votos e o estado do card', () => {
    render(<RoadmapClient initialColumns={board([card({ status: 'cozinhando', voteCount: 7 })])} />);
    fireEvent.click(screen.getByTestId('abrir-detalhe-c1'));

    expect(screen.getByTestId('detalhe-votos').textContent).toContain('7');
    expect(screen.getByTestId('detalhe-estado').textContent).toBe('Estamos cozinhando');
  });

  it('card sem descrição diz que não tem, em vez de abrir um popup vazio', () => {
    render(<RoadmapClient initialColumns={board([card({ description: '' })])} />);
    fireEvent.click(screen.getByTestId('abrir-detalhe-c1'));
    expect(screen.getByTestId('detalhe-descricao').textContent).toBe('Esta task não tem descrição.');
  });

  it('ESC fecha e o foco VOLTA para o gatilho', () => {
    render(<RoadmapClient initialColumns={board([card({ description: LONGA })])} />);
    const gatilho = screen.getByTestId('abrir-detalhe-c1');
    gatilho.focus();
    fireEvent.click(gatilho);
    expect(screen.getByTestId('detalhe-popup')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByTestId('detalhe-popup')).toBeNull();
    expect(document.activeElement).toBe(gatilho);
  });

  it('o X e o clique fora também fecham', () => {
    render(<RoadmapClient initialColumns={board([card()])} />);

    fireEvent.click(screen.getByTestId('abrir-detalhe-c1'));
    fireEvent.click(screen.getByTestId('fechar-detalhe'));
    expect(screen.queryByTestId('detalhe-popup')).toBeNull();

    fireEvent.click(screen.getByTestId('abrir-detalhe-c1'));
    fireEvent.click(screen.getByTestId('detalhe-popup'));
    expect(screen.queryByTestId('detalhe-popup')).toBeNull();
  });

  /** Clicar DENTRO do painel não pode fechar — só o clique no overlay. */
  it('clicar dentro do painel não fecha', () => {
    render(<RoadmapClient initialColumns={board([card()])} />);
    fireEvent.click(screen.getByTestId('abrir-detalhe-c1'));
    fireEvent.click(screen.getByTestId('detalhe-descricao'));
    expect(screen.getByTestId('detalhe-popup')).toBeTruthy();
  });

  it('é um dialog modal rotulado pelo próprio título', () => {
    render(<RoadmapClient initialColumns={board([card()])} />);
    fireEvent.click(screen.getByTestId('abrir-detalhe-c1'));
    const dialog = screen.getByTestId('detalhe-popup');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('roadmap-detalhe-titulo');
    expect(document.getElementById('roadmap-detalhe-titulo')).toBe(screen.getByTestId('detalhe-titulo'));
  });

  /**
   * O gatilho é o TÍTULO, não o card inteiro. Card-inteiro-clicável aqui só se
   * escreveria como botão em volta do like — botão dentro de botão.
   */
  it('o gatilho é um botão de verdade, e não há botão dentro de botão no card', () => {
    const { container } = render(<RoadmapClient initialColumns={board([card()])} />);
    expect(screen.getByTestId('abrir-detalhe-c1').tagName).toBe('BUTTON');
    expect(container.querySelectorAll('button button')).toHaveLength(0);
  });

  /** O like continua sendo o like: clicar nele não pode abrir o detalhe. */
  it('clicar no coração NÃO abre o detalhe', () => {
    render(<RoadmapClient initialColumns={board([card()])} />);
    fireEvent.click(screen.getByTestId('vote-c1'));
    expect(screen.queryByTestId('detalhe-popup')).toBeNull();
  });
});

// ───────────────────────────────────────── o like: coração + número

describe('roadmap — o like é só coração e número', () => {
  it('continua sendo um BUTTON, com aria-pressed acompanhando o estado', async () => {
    render(<RoadmapClient initialColumns={board([card()])} />);
    const botao = screen.getByTestId('vote-c1');
    expect(botao.tagName).toBe('BUTTON');
    expect(botao.getAttribute('aria-pressed')).toBe('false');
    expect(botao.getAttribute('aria-label')).toBe('Votar em Exportar em PDF');

    fireEvent.click(botao);
    await waitFor(() => expect(screen.getByTestId('vote-c1').getAttribute('aria-pressed')).toBe('true'));
  });

  it('coração VAZADO quando não votou e PREENCHIDO quando votou', () => {
    const { rerender } = render(<RoadmapClient initialColumns={board([card()])} />);
    expect(screen.getByTestId('vote-heart-c1').getAttribute('class')).not.toContain('fill-current');

    rerender(<RoadmapClient initialColumns={board([card({ hasVoted: true })])} />);
    const cheio = screen.getByTestId('vote-heart-c1').getAttribute('class') ?? '';
    expect(cheio).toContain('fill-current');
    expect(cheio).toContain('var(--danger)');
  });

  /** Sem "shape": nem pílula, nem borda, nem fundo. */
  it('o botão não tem borda nem fundo', () => {
    render(<RoadmapClient initialColumns={board([card({ hasVoted: true })])} />);
    const cls = screen.getByTestId('vote-c1').className;
    expect(cls).not.toMatch(/border/);
    expect(cls).not.toMatch(/\bbg-/);
  });

  /**
   * Sem borda em repouso, o anel de foco é a ÚNICA pista de "estou aqui" para
   * quem navega por Tab.
   */
  it('mantém foco visível', () => {
    render(<RoadmapClient initialColumns={board([card()])} />);
    expect(screen.getByTestId('vote-c1').className).toContain('focus-visible:ring');
  });

  it('hover deixa o coração AZUL enquanto não votou, e não apaga o vermelho de quem votou', () => {
    const { rerender } = render(<RoadmapClient initialColumns={board([card()])} />);
    expect(screen.getByTestId('vote-heart-c1').getAttribute('class')).toContain(
      'group-hover:text-[var(--studio-select)]',
    );

    rerender(<RoadmapClient initialColumns={board([card({ hasVoted: true })])} />);
    expect(screen.getByTestId('vote-heart-c1').getAttribute('class')).not.toContain('group-hover:');
  });

  it('o clique que VOTA comemora; o que desfaz o like, não', () => {
    const { unmount } = render(<RoadmapClient initialColumns={board([card()])} />);
    fireEvent.click(screen.getByTestId('vote-c1'));
    expect(screen.getByTestId('vote-heart-c1').getAttribute('class')).toContain('scale-125');
    unmount();

    render(<RoadmapClient initialColumns={board([card({ hasVoted: true })])} />);
    fireEvent.click(screen.getByTestId('vote-c1'));
    expect(screen.getByTestId('vote-heart-c1').getAttribute('class')).not.toContain('scale-125');
  });

  /** Quem pediu menos animação recebe a troca de cor sem o pulso. */
  it('respeita prefers-reduced-motion', () => {
    render(<RoadmapClient initialColumns={board([card()])} />);
    const cls = screen.getByTestId('vote-heart-c1').getAttribute('class') ?? '';
    expect(cls).toContain('motion-reduce:transition-none');
    expect(cls).toContain('motion-reduce:transform-none');
  });

  /** O chevron era o desenho antigo — ele saiu junto com a pílula. */
  it('não sobrou chevron nenhum no card', () => {
    const { container } = render(<RoadmapClient initialColumns={board([card()])} />);
    expect(container.querySelector('.lucide-chevron-up')).toBeNull();
  });
});

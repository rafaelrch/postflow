// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: { error: mockToastError, success: mockToastSuccess },
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
  /** "0 itens" é número, não informação — cada coluna diz o que o vazio significa. */
  it('cada coluna vazia tem frase própria, e nenhuma diz "0 itens"', () => {
    render(<RoadmapClient initialColumns={board()} />);
    const frases = ROADMAP_STATUSES.map((s) => screen.getByTestId(`column-empty-${s}`).textContent ?? '');
    expect(new Set(frases).size).toBe(4);
    for (const f of frases) {
      expect(f.length).toBeGreaterThan(10);
      expect(f).not.toMatch(/0 iten/i);
    }
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
  function abrir() {
    render(<RoadmapClient initialColumns={board()} />);
    fireEvent.click(screen.getByTestId('criar-task'));
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

  /** O aviso vem ANTES de enviar, senão a fila de moderação vira fila de duplicatas. */
  it('avisa que a sugestão passa por aprovação', () => {
    abrir();
    expect(screen.getByTestId('aviso-aprovacao').textContent).toMatch(/aprovação/i);
  });

  it('título curto não envia e mostra o erro no campo', async () => {
    abrir();
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'oi' } });
    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Uma descrição suficientemente longa.' },
    });
    fireEvent.click(screen.getByTestId('enviar-sugestao'));

    await waitFor(() => expect(screen.getByTestId('erro-titulo')).toBeTruthy());
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('descrição curta não envia', async () => {
    abrir();
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Exportar em PDF' } });
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'curta' } });
    fireEvent.click(screen.getByTestId('enviar-sugestao'));

    await waitFor(() => expect(screen.getByTestId('erro-descricao')).toBeTruthy());
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('HTML no título não envia', async () => {
    abrir();
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: '<script>alert(1)</script>' } });
    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Uma descrição suficientemente longa.' },
    });
    fireEvent.click(screen.getByTestId('enviar-sugestao'));

    await waitFor(() => expect(screen.getByTestId('erro-titulo').textContent).toMatch(/HTML/));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('válidos enviam o corpo certo, já aparado', async () => {
    abrir();
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: '  Exportar em PDF  ' } });
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
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Exportar em PDF' } });
    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Queria baixar o carrossel como PDF.' },
    });
    fireEvent.click(screen.getByTestId('enviar-sugestao'));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('O título não pode conter HTML.'),
    );
  });

  it('sucesso avisa que passa por revisão e fecha o popup', async () => {
    abrir();
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Exportar em PDF' } });
    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Queria baixar o carrossel como PDF.' },
    });
    fireEvent.click(screen.getByTestId('enviar-sugestao'));

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringMatching(/revisão/i)),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
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


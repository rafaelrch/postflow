// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { mockRefresh } = vi.hoisted(() => ({ mockRefresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

import RoadmapAdminClient from '../app/admin/roadmap/RoadmapAdminClient';
import { emptyAdminBoard, type AdminRoadmapBoard, type AdminRoadmapCard } from '../lib/admin-roadmap';
import { ROADMAP_STATUSES, ROADMAP_STATUS_LABELS } from '../lib/roadmap';

function card(over: Partial<AdminRoadmapCard> = {}): AdminRoadmapCard {
  return {
    id: 'c1',
    title: 'Exportar em PDF',
    description: 'Queria baixar o carrossel como PDF.',
    status: 'backlog',
    approval: 'approved',
    position: 0,
    createdAt: '2026-08-01',
    voteCount: 3,
    ...over,
  };
}

/** Monta o board a partir de uma lista solta, como a lib faria. */
function board(cards: AdminRoadmapCard[] = []): AdminRoadmapBoard {
  return {
    pendentes: cards.filter((c) => c.approval === 'pending'),
    colunas: ROADMAP_STATUSES.map((status) => ({
      status,
      label: ROADMAP_STATUS_LABELS[status],
      cards: cards.filter((c) => c.approval === 'approved' && c.status === status),
    })),
    recusados: cards.filter((c) => c.approval === 'rejected'),
  };
}

function okResponse(body: unknown = { ok: true }) {
  return { ok: true, status: 200, json: async () => body } as Response;
}
function errResponse(status: number, body: unknown = {}) {
  return { ok: false, status, json: async () => body } as Response;
}

/** O corpo do último PATCH, já desserializado. */
function ultimoCorpo() {
  const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
  const [, init] = calls[calls.length - 1];
  return JSON.parse((init as RequestInit).body as string);
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse()));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// ───────────────────────────────────────────── mostrar tudo, e qual é qual

describe('admin/roadmap — mostra o que o quadro público esconde', () => {
  const tudo = [
    card({ id: 'a1', title: 'No quadro' }),
    card({ id: 'p1', title: 'Pendente', approval: 'pending' }),
    card({ id: 'r1', title: 'Recusado', approval: 'rejected' }),
  ];

  it('lista aprovado, pendente e recusado na mesma tela', () => {
    render(<RoadmapAdminClient initialBoard={board(tudo)} />);
    expect(screen.getByTestId('admin-card-a1')).toBeTruthy();
    expect(screen.getByTestId('admin-card-p1')).toBeTruthy();
    expect(screen.getByTestId('admin-card-r1')).toBeTruthy();
  });

  /** Card recusado sem marca, no meio dos outros, é pegadinha. */
  it('cada card diz em que estado está, por selo e por atributo', () => {
    render(<RoadmapAdminClient initialBoard={board(tudo)} />);

    expect(screen.getByTestId('admin-selo-a1').textContent).toBe('No quadro');
    expect(screen.getByTestId('admin-selo-p1').textContent).toBe('Pendente');
    expect(screen.getByTestId('admin-selo-r1').textContent).toBe('Recusado');

    expect(screen.getByTestId('admin-card-p1').getAttribute('data-approval')).toBe('pending');
    expect(screen.getByTestId('admin-card-r1').getAttribute('data-approval')).toBe('rejected');
  });

  it('pendente e recusado ficam FORA das 4 colunas do quadro público', () => {
    render(<RoadmapAdminClient initialBoard={board(tudo)} />);
    const backlog = screen.getByTestId('admin-coluna-backlog');

    expect(backlog.contains(screen.getByTestId('admin-card-a1'))).toBe(true);
    expect(backlog.contains(screen.getByTestId('admin-card-p1'))).toBe(false);
    expect(backlog.contains(screen.getByTestId('admin-card-r1'))).toBe(false);

    expect(screen.getByTestId('admin-roadmap-pendentes').contains(screen.getByTestId('admin-card-p1'))).toBe(true);
    expect(screen.getByTestId('admin-roadmap-recusados').contains(screen.getByTestId('admin-card-r1'))).toBe(true);
  });

  /** É a contagem que diz o que a base quer primeiro. */
  it('mostra a contagem de votos de cada card', () => {
    render(<RoadmapAdminClient initialBoard={board([card({ voteCount: 12 })])} />);
    expect(screen.getByTestId('admin-votos-c1').textContent).toContain('12');
  });

  it('sem pendente nem recusado, as seções não aparecem', () => {
    render(<RoadmapAdminClient initialBoard={board([card()])} />);
    expect(screen.queryByTestId('admin-roadmap-pendentes')).toBeNull();
    expect(screen.queryByTestId('admin-roadmap-recusados')).toBeNull();
  });
});

// ───────────────────────────────────────────── as três ações

describe('admin/roadmap — mover, aprovar e recusar', () => {
  it('mover manda cardId e status para a rota do admin', async () => {
    render(<RoadmapAdminClient initialBoard={board([card()])} />);

    fireEvent.change(screen.getByTestId('admin-mover-c1'), { target: { value: 'cozinhando' } });

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/roadmap/admin');
    expect((init as RequestInit).method).toBe('PATCH');
    expect(ultimoCorpo()).toEqual({ cardId: 'c1', status: 'cozinhando' });
  });

  it('o card muda de coluna na tela', async () => {
    render(<RoadmapAdminClient initialBoard={board([card()])} />);
    fireEvent.change(screen.getByTestId('admin-mover-c1'), { target: { value: 'pronto' } });

    await waitFor(() =>
      expect(screen.getByTestId('admin-coluna-pronto').contains(screen.getByTestId('admin-card-c1'))).toBe(true),
    );
    expect(screen.getByTestId('admin-coluna-backlog').contains(screen.getByTestId('admin-card-c1'))).toBe(false);
  });

  /** Escolher a coluna em que o card já está não gasta requisição. */
  it('escolher a MESMA coluna não chama a rota', () => {
    render(<RoadmapAdminClient initialBoard={board([card()])} />);
    fireEvent.change(screen.getByTestId('admin-mover-c1'), { target: { value: 'backlog' } });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('aprovar manda approval=approved e joga o card no quadro', async () => {
    render(<RoadmapAdminClient initialBoard={board([card({ id: 'p1', approval: 'pending' })])} />);

    fireEvent.click(screen.getByTestId('admin-aprovar-p1'));

    await waitFor(() => expect(ultimoCorpo()).toEqual({ cardId: 'p1', approval: 'approved' }));
    await waitFor(() =>
      expect(screen.getByTestId('admin-coluna-backlog').contains(screen.getByTestId('admin-card-p1'))).toBe(true),
    );
    expect(screen.queryByTestId('admin-roadmap-pendentes')).toBeNull();
  });

  it('recusar manda approval=rejected e tira o card do quadro', async () => {
    render(<RoadmapAdminClient initialBoard={board([card()])} />);

    fireEvent.click(screen.getByTestId('admin-recusar-c1'));

    await waitFor(() => expect(ultimoCorpo()).toEqual({ cardId: 'c1', approval: 'rejected' }));
    await waitFor(() =>
      expect(screen.getByTestId('admin-roadmap-recusados').contains(screen.getByTestId('admin-card-c1'))).toBe(true),
    );
    expect(screen.getByTestId('admin-coluna-backlog').contains(screen.getByTestId('admin-card-c1'))).toBe(false);
  });

  /** Recusar tem de ter volta: senão vira apagar com outro nome. */
  it('recusado pode ser devolvido ao quadro', async () => {
    render(<RoadmapAdminClient initialBoard={board([card({ approval: 'rejected' })])} />);

    const voltar = screen.getByTestId('admin-aprovar-c1');
    expect(voltar.textContent).toMatch(/devolver ao quadro/i);
    fireEvent.click(voltar);

    await waitFor(() => expect(ultimoCorpo()).toEqual({ cardId: 'c1', approval: 'approved' }));
  });

  /** Recusar já resolve; apagar levaria os votos junto. */
  it('não existe ação de apagar card em lugar nenhum da tela', () => {
    const { container } = render(
      <RoadmapAdminClient initialBoard={board([card(), card({ id: 'p1', approval: 'pending' })])} />,
    );
    expect(container.querySelector('[data-testid*="apagar"]')).toBeNull();
    expect(container.querySelector('[data-testid*="excluir"]')).toBeNull();
    expect(container.textContent).not.toMatch(/apagar|excluir|deletar/i);
  });

  it('card aprovado não oferece "Aprovar"; recusado não oferece "Recusar"', () => {
    render(
      <RoadmapAdminClient
        initialBoard={board([card(), card({ id: 'r1', approval: 'rejected' })])}
      />,
    );
    expect(screen.queryByTestId('admin-aprovar-c1')).toBeNull();
    expect(screen.queryByTestId('admin-recusar-r1')).toBeNull();
  });

  it('a tela relê o quadro do servidor depois de uma ação que deu certo', async () => {
    render(<RoadmapAdminClient initialBoard={board([card()])} />);
    fireEvent.click(screen.getByTestId('admin-recusar-c1'));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it('avisa o que mudou, com o nome do card', async () => {
    render(<RoadmapAdminClient initialBoard={board([card()])} />);
    fireEvent.change(screen.getByTestId('admin-mover-c1'), { target: { value: 'faremos' } });

    await waitFor(() => {
      const aviso = screen.getByTestId('admin-roadmap-acao-ok').textContent ?? '';
      expect(aviso).toContain('Exportar em PDF');
      expect(aviso).toContain('Faremos');
    });
  });
});

// ───────────────────────────────────────────── falha reverte

describe('admin/roadmap — falha na ação reverte a tela', () => {
  /**
   * A tela não pode ficar mostrando uma coluna que o banco não tem: quem olhar
   * depois decide em cima de uma mentira.
   */
  it('mover que falha devolve o card à coluna de origem', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(errResponse(500, {}));
    render(<RoadmapAdminClient initialBoard={board([card()])} />);

    fireEvent.change(screen.getByTestId('admin-mover-c1'), { target: { value: 'pronto' } });

    await waitFor(() => expect(screen.getByTestId('admin-roadmap-acao-erro')).toBeTruthy());
    expect(screen.getByTestId('admin-coluna-backlog').contains(screen.getByTestId('admin-card-c1'))).toBe(true);
    expect(screen.getByTestId('admin-coluna-pronto').contains(screen.getByTestId('admin-card-c1'))).toBe(false);
    expect((screen.getByTestId('admin-mover-c1') as HTMLSelectElement).value).toBe('backlog');
  });

  it('aprovar que falha devolve o card para Aguardando decisão', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(errResponse(500, {}));
    render(<RoadmapAdminClient initialBoard={board([card({ id: 'p1', approval: 'pending' })])} />);

    fireEvent.click(screen.getByTestId('admin-aprovar-p1'));

    await waitFor(() => expect(screen.getByTestId('admin-roadmap-acao-erro')).toBeTruthy());
    expect(screen.getByTestId('admin-roadmap-pendentes').contains(screen.getByTestId('admin-card-p1'))).toBe(true);
    expect(screen.getByTestId('admin-selo-p1').textContent).toBe('Pendente');
  });

  it('rede fora reverte também', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('offline'));
    render(<RoadmapAdminClient initialBoard={board([card()])} />);

    fireEvent.click(screen.getByTestId('admin-recusar-c1'));

    await waitFor(() => expect(screen.getByTestId('admin-roadmap-acao-erro')).toBeTruthy());
    expect(screen.getByTestId('admin-selo-c1').textContent).toBe('No quadro');
  });

  it('ação que falha NÃO relê o quadro nem diz que deu certo', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(errResponse(500, {}));
    render(<RoadmapAdminClient initialBoard={board([card()])} />);

    fireEvent.click(screen.getByTestId('admin-recusar-c1'));

    await waitFor(() => expect(screen.getByTestId('admin-roadmap-acao-erro')).toBeTruthy());
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(screen.queryByTestId('admin-roadmap-acao-ok')).toBeNull();
  });

  it('403 explica que é a allowlist, não a senha', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(errResponse(403));
    render(<RoadmapAdminClient initialBoard={board([card()])} />);

    fireEvent.click(screen.getByTestId('admin-recusar-c1'));

    await waitFor(() =>
      expect(screen.getByTestId('admin-roadmap-acao-erro').textContent).toMatch(/allowlist/i),
    );
  });

  it('404 manda recarregar, em vez de repetir a ação num card que sumiu', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(errResponse(404));
    render(<RoadmapAdminClient initialBoard={board([card()])} />);

    fireEvent.click(screen.getByTestId('admin-recusar-c1'));

    await waitFor(() =>
      expect(screen.getByTestId('admin-roadmap-acao-erro').textContent).toMatch(/não existe mais/i),
    );
  });
});

// ───────────────────────────────────────────── vazio, carregando, erro

describe('admin/roadmap — vazio, carregando e erro', () => {
  it('vazio diz que ninguém sugeriu nada, e o quadro continua desenhado', () => {
    render(<RoadmapAdminClient initialBoard={emptyAdminBoard()} />);
    expect(screen.getByTestId('admin-roadmap-vazio').textContent).toMatch(/ninguém sugeriu/i);
    expect(screen.getByTestId('admin-coluna-backlog')).toBeTruthy();
  });

  it('carregando mostra esqueleto, sem quadro e sem frase de vazio', () => {
    render(<RoadmapAdminClient initialBoard={emptyAdminBoard()} state="loading" />);
    expect(screen.getByTestId('admin-roadmap-carregando')).toBeTruthy();
    expect(screen.queryByTestId('admin-roadmap-vazio')).toBeNull();
    expect(screen.queryByTestId('admin-coluna-backlog')).toBeNull();
  });

  /** Erro de carga NÃO pode parecer quadro vazio: as decisões são opostas. */
  it('erro diz que não carregou, e não desenha quadro nem vazio', () => {
    render(<RoadmapAdminClient initialBoard={emptyAdminBoard()} state="error" />);
    const alerta = screen.getByTestId('admin-roadmap-erro');
    expect(alerta.textContent).toMatch(/não carregou/i);
    expect(alerta.textContent).toMatch(/não.*quadro vazio/i);
    expect(screen.queryByTestId('admin-roadmap-vazio')).toBeNull();
    expect(screen.queryByTestId('admin-coluna-backlog')).toBeNull();
  });
});

// ───────────────────────────────────────────── o estado segue o servidor

/**
 * Mesma lição do quadro público: `router.refresh()` entrega PROP NOVA sem
 * desmontar o componente, e estado que espelha prop precisa se ressincronizar.
 */
describe('admin/roadmap — o quadro segue o servidor', () => {
  it('card novo vindo do servidor aparece sem remontar', () => {
    const { rerender } = render(<RoadmapAdminClient initialBoard={board([card()])} />);
    expect(screen.queryByTestId('admin-card-p1')).toBeNull();

    rerender(
      <RoadmapAdminClient initialBoard={board([card(), card({ id: 'p1', approval: 'pending' })])} />,
    );

    expect(screen.getByTestId('admin-card-p1')).toBeTruthy();
  });

  it('contagem de voto atualizada pelo servidor chega à tela', () => {
    const { rerender } = render(<RoadmapAdminClient initialBoard={board([card({ voteCount: 3 })])} />);
    rerender(<RoadmapAdminClient initialBoard={board([card({ voteCount: 41 })])} />);
    expect(screen.getByTestId('admin-votos-c1').textContent).toContain('41');
  });
});

// ───────────────────────────────────────────── acessibilidade do controle

/**
 * A escolha desta tela: CONTROLE EXPLÍCITO, não arrastar. Arrastar acessível
 * exigiria pegar/mover/soltar por teclado com anúncio por aria-live; sem isso, a
 * ÚNICA forma de mover um card seria o mouse — e mover é a operação principal
 * desta página. Estes testes travam a escolha.
 */
describe('admin/roadmap — mover é operável por teclado', () => {
  it('a coluna é um <select> nativo rotulado, com as 4 opções', () => {
    render(<RoadmapAdminClient initialBoard={board([card()])} />);
    const seletor = screen.getByTestId('admin-mover-c1') as HTMLSelectElement;

    expect(seletor.tagName).toBe('SELECT');
    expect([...seletor.options].map((o) => o.value)).toEqual([...ROADMAP_STATUSES]);
    expect(seletor.value).toBe('backlog');
    expect(screen.getByLabelText('Coluna')).toBe(seletor);
  });

  it('aprovar e recusar são botões nativos', () => {
    render(<RoadmapAdminClient initialBoard={board([card({ approval: 'pending' })])} />);
    expect(screen.getByTestId('admin-aprovar-c1').tagName).toBe('BUTTON');
    expect(screen.getByTestId('admin-recusar-c1').tagName).toBe('BUTTON');
  });

  it('não há nada arrastável na tela', () => {
    const { container } = render(<RoadmapAdminClient initialBoard={board([card()])} />);
    expect(container.querySelector('[draggable="true"]')).toBeNull();
  });

  /** Enquanto a ação está no ar, o card não aceita uma segunda. */
  it('o card fica ocupado durante a ação', async () => {
    let liberar: (v: Response) => void = () => {};
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise<Response>((resolve) => {
        liberar = resolve;
      }),
    );
    render(<RoadmapAdminClient initialBoard={board([card()])} />);

    fireEvent.click(screen.getByTestId('admin-recusar-c1'));

    await waitFor(() =>
      expect((screen.getByTestId('admin-mover-c1') as HTMLSelectElement).disabled).toBe(true),
    );
    expect(screen.getByTestId('admin-card-c1').getAttribute('aria-busy')).toBe('true');

    liberar(okResponse());
    await waitFor(() =>
      expect((screen.getByTestId('admin-mover-c1') as HTMLSelectElement).disabled).toBe(false),
    );
  });
});

// ───────────────────────────────────────── detalhe do card (popup)

describe('admin/roadmap — detalhe do card', () => {
  const LONGA = Array.from(
    { length: 30 },
    (_, i) => `Linha ${i + 1} de uma descrição que não cabe nas três linhas do card.`,
  ).join('\n');

  it('clicar no título abre o detalhe com a descrição COMPLETA', () => {
    render(<RoadmapAdminClient initialBoard={board([card({ description: LONGA })])} />);
    expect(screen.queryByTestId('admin-detalhe-popup')).toBeNull();

    fireEvent.click(screen.getByTestId('admin-abrir-detalhe-c1'));

    expect(screen.getByTestId('admin-detalhe-titulo').textContent).toBe('Exportar em PDF');
    expect(screen.getByTestId('admin-detalhe-descricao').textContent).toBe(LONGA);
  });

  it('mostra o selo, a coluna atual e a contagem de votos', () => {
    render(
      <RoadmapAdminClient
        initialBoard={board([card({ approval: 'pending', status: 'faremos', voteCount: 9 })])}
      />,
    );
    fireEvent.click(screen.getByTestId('admin-abrir-detalhe-c1'));

    expect(screen.getByTestId('admin-detalhe-selo').textContent).toBe('Pendente');
    expect(screen.getByTestId('admin-detalhe-coluna').textContent).toBe('Faremos');
    expect(screen.getByTestId('admin-detalhe-votos').textContent).toContain('9');
  });

  /**
   * ⚠️ A ARMADILHA DESTA TELA. O card do /admin tem CONTROLES dentro. Se o card
   * inteiro fosse a área clicável, mexer no seletor de coluna abriria o popup na
   * cara de quem só queria mover o card. O gatilho é o TÍTULO justamente por
   * isso, e estes três testes são o que segura a escolha.
   */
  it('mexer no <select> de coluna NÃO abre o popup', async () => {
    render(<RoadmapAdminClient initialBoard={board([card()])} />);

    const seletor = screen.getByTestId('admin-mover-c1');
    fireEvent.mouseDown(seletor);
    fireEvent.click(seletor);
    fireEvent.change(seletor, { target: { value: 'faremos' } });

    await waitFor(() => expect(ultimoCorpo()).toEqual({ cardId: 'c1', status: 'faremos' }));
    expect(screen.queryByTestId('admin-detalhe-popup')).toBeNull();
  });

  it('clicar em Aprovar NÃO abre o popup', async () => {
    render(<RoadmapAdminClient initialBoard={board([card({ approval: 'pending' })])} />);

    fireEvent.click(screen.getByTestId('admin-aprovar-c1'));

    await waitFor(() => expect(ultimoCorpo()).toEqual({ cardId: 'c1', approval: 'approved' }));
    expect(screen.queryByTestId('admin-detalhe-popup')).toBeNull();
  });

  it('clicar em Recusar NÃO abre o popup', async () => {
    render(<RoadmapAdminClient initialBoard={board([card()])} />);

    fireEvent.click(screen.getByTestId('admin-recusar-c1'));

    await waitFor(() => expect(ultimoCorpo()).toEqual({ cardId: 'c1', approval: 'rejected' }));
    expect(screen.queryByTestId('admin-detalhe-popup')).toBeNull();
  });

  it('ESC fecha e o foco VOLTA para o gatilho', () => {
    render(<RoadmapAdminClient initialBoard={board([card({ description: LONGA })])} />);
    const gatilho = screen.getByTestId('admin-abrir-detalhe-c1');
    gatilho.focus();
    fireEvent.click(gatilho);
    expect(screen.getByTestId('admin-detalhe-popup')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByTestId('admin-detalhe-popup')).toBeNull();
    expect(document.activeElement).toBe(gatilho);
  });

  it('o X e o clique fora também fecham', () => {
    render(<RoadmapAdminClient initialBoard={board([card()])} />);

    fireEvent.click(screen.getByTestId('admin-abrir-detalhe-c1'));
    fireEvent.click(screen.getByTestId('admin-fechar-detalhe'));
    expect(screen.queryByTestId('admin-detalhe-popup')).toBeNull();

    fireEvent.click(screen.getByTestId('admin-abrir-detalhe-c1'));
    fireEvent.click(screen.getByTestId('admin-detalhe-popup'));
    expect(screen.queryByTestId('admin-detalhe-popup')).toBeNull();
  });

  it('é um dialog modal rotulado pelo próprio título', () => {
    render(<RoadmapAdminClient initialBoard={board([card()])} />);
    fireEvent.click(screen.getByTestId('admin-abrir-detalhe-c1'));
    const dialog = screen.getByTestId('admin-detalhe-popup');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('admin-roadmap-detalhe-titulo');
  });

  /** O `<select>` é focável e não pode ficar aninhado num botão. */
  it('o gatilho é um BUTTON e não existe botão dentro de botão no card', () => {
    const { container } = render(<RoadmapAdminClient initialBoard={board([card({ approval: 'pending' })])} />);
    expect(screen.getByTestId('admin-abrir-detalhe-c1').tagName).toBe('BUTTON');
    expect(container.querySelectorAll('button button')).toHaveLength(0);
    expect(container.querySelectorAll('button select')).toHaveLength(0);
  });
});

// ───────────────────────────────────────── o coração do admin é leitura

describe('admin/roadmap — o contador de votos não é um like', () => {
  it('não é botão e não tem aria-pressed', () => {
    render(<RoadmapAdminClient initialBoard={board([card()])} />);
    const votos = screen.getByTestId('admin-votos-c1');
    expect(votos.tagName).toBe('SPAN');
    expect(votos.getAttribute('aria-pressed')).toBeNull();
    expect(votos.closest('button')).toBeNull();
  });

  /** Mesmo desenho do quadro público, para o olho reconhecer a mesma coisa. */
  it('usa o mesmo coração, e não o chevron antigo', () => {
    const { container } = render(<RoadmapAdminClient initialBoard={board([card()])} />);
    expect(screen.getByTestId('admin-votos-c1').querySelector('.lucide-heart')).toBeTruthy();
    expect(container.querySelector('.lucide-chevron-up')).toBeNull();
  });

  it('a contagem continua na tela', () => {
    render(<RoadmapAdminClient initialBoard={board([card({ voteCount: 12 })])} />);
    expect(screen.getByTestId('admin-votos-c1').textContent).toContain('12');
  });
});

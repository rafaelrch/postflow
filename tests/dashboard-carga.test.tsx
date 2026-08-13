// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import {
  DASHBOARD_COVER_COLUMNS,
  DASHBOARD_SELECT,
  loadDashboardCarousels,
} from '@/lib/dashboard-data';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));
vi.mock('@/lib/upload-image', () => ({ uploadImageFile: vi.fn(async () => 'https://x/y.png') }));
vi.mock('react-hot-toast', () => ({ default: { loading: vi.fn(), success: vi.fn(), error: vi.fn() } }));

import DashboardClient from '@/app/(app)/dashboard/DashboardClient';

/**
 * DASHBOARD VAZIO AO VOLTAR DO EDITOR — o bug que o Rafael reportou.
 *
 * Medido no dev server isolado: a rota fria gasta 4,2 s de application-code,
 * e o `withTimeout(query, 4000, { data: [] })` do `page.tsx` disparava e
 * entregava lista vazia. Um F5 caía em 1,3 s e "consertava". Erro de query caía
 * no mesmo fallback. Os três desfechos viravam a mesma tela de "você não tem
 * carrossel" — sem log e sem como o usuário perceber que foi falha.
 */

afterEach(() => {
  cleanup();
  refresh.mockClear();
});

const ok = (data: unknown[]) => Promise.resolve({ data, error: null });

describe('os três desfechos da carga', () => {
  it('SUCESSO com linhas: devolve os carrosséis e nenhum erro', async () => {
    const r = await loadDashboardCarousels(ok([{ id: 'a' }, { id: 'b' }]));
    // `toMatchObject`: o desfecho é `carousels` + `error`. O resultado ganhou
    // `total` com a paginação, e igualdade EXATA quebraria a cada campo novo
    // sem que a intenção deste teste tivesse mudado.
    expect(r).toMatchObject({ carousels: [{ id: 'a' }, { id: 'b' }], error: null });
  });

  it('SUCESSO com zero linhas: lista vazia é uma resposta legítima', async () => {
    const r = await loadDashboardCarousels(ok([]));
    expect(r).toMatchObject({ carousels: [], error: null });
    // Zero é uma AFIRMAÇÃO aqui: a query respondeu que não há nada.
    expect(r.total).toBe(0);
  });

  it('ERRO de query: não se disfarça de lista vazia', async () => {
    const onError = vi.fn();
    const r = await loadDashboardCarousels(
      Promise.resolve({ data: null, error: { message: 'permission denied' } }),
      { onError },
    );
    expect(r).toMatchObject({ carousels: [], error: 'query' });
    // 🔴 Total DESCONHECIDO, não zero: zero diria que o usuário não tem
    // carrossel, que é exatamente a mentira que este arquivo existe para impedir.
    expect(r.total).toBeNull();
    expect(onError).toHaveBeenCalledWith('query', { message: 'permission denied' });
  });

  it('promise REJEITADA também vira erro de query, não vazio', async () => {
    const onError = vi.fn();
    const r = await loadDashboardCarousels(Promise.reject(new Error('rede caiu')), { onError });
    expect(r.error).toBe('query');
    expect(onError).toHaveBeenCalledWith('query', expect.any(Error));
  });

  it('TIMEOUT: vira `timeout`, e vai para o log do servidor', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const nuncaResolve = new Promise<{ data: null; error: null }>(() => {});
    const p = loadDashboardCarousels(nuncaResolve, { timeoutMs: 50, onError });
    await vi.advanceTimersByTimeAsync(60);
    const r = await p;
    vi.useRealTimers();

    expect(r).toMatchObject({ carousels: [], error: 'timeout' });
    expect(r.total).toBeNull();
    expect(onError).toHaveBeenCalledWith('timeout', expect.stringContaining('50ms'));
  });

  it('query lenta mas dentro do prazo NÃO é timeout — era o caso do Rafael', async () => {
    vi.useFakeTimers();
    const lenta = new Promise<{ data: unknown[]; error: null }>((res) =>
      setTimeout(() => res({ data: [{ id: 'a' }], error: null }), 4200),
    );
    const p = loadDashboardCarousels(lenta, { timeoutMs: 8000 });
    await vi.advanceTimersByTimeAsync(4300);
    const r = await p;
    vi.useRealTimers();

    // 4,2 s estourava o teto antigo de 4 s e virava dashboard vazio.
    expect(r).toMatchObject({ carousels: [{ id: 'a' }], error: null });
  });

  it('não lança nunca — quem chama é um Server Component', async () => {
    await expect(loadDashboardCarousels(Promise.reject('x'))).resolves.toBeTruthy();
  });
});

describe('a query pede só as colunas que o dashboard usa', () => {
  it('nada de `slides(*)`', () => {
    expect(DASHBOARD_SELECT).not.toContain('slides(*)');
    expect(DASHBOARD_SELECT).toContain('coverSlide:slides(');
  });

  it('as colunas que o mapper lê estão todas lá', () => {
    for (const col of ['template_slots', 'template_model', 'content_layout', 'text_position',
      'background_image_url', 'editorial_image_offset_y']) {
      expect(DASHBOARD_COVER_COLUMNS).toContain(col);
    }
  });

  it('as que ele NÃO lê ficaram de fora', () => {
    for (const col of ['carousel_id', 'metadata', 'created_at', 'updated_at']) {
      expect(DASHBOARD_COVER_COLUMNS.split(', ')).not.toContain(col);
    }
  });
});

describe('a tela distingue "não tem" de "não deu para carregar"', () => {
  it('sem carrosséis e sem erro: convida a criar o primeiro', () => {
    render(<DashboardClient initialCarousels={[]} loadError={null} />);
    expect(screen.queryByText(/não foi possível carregar/i)).toBeNull();
  });

  it('com erro de query: avisa e oferece tentar de novo', () => {
    render(<DashboardClient initialCarousels={[]} loadError="query" />);
    expect(screen.getByText(/não foi possível carregar/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(refresh).toHaveBeenCalled();
  });

  it('com timeout: mesma tela honesta, nunca "você não tem carrossel"', () => {
    render(<DashboardClient initialCarousels={[]} loadError="timeout" />);
    expect(screen.getByText(/não foi possível carregar/i)).toBeTruthy();
  });

  it('erro NÃO apaga a lista quando ainda há algo para mostrar', () => {
    // Cinto de segurança: se um dia a carga passar a ser parcial, o aviso
    // aparece mas o que veio continua na tela.
    const carousel = {
      id: 'c1', title: 'Meu carrossel', style: 'editorial', status: 'draft',
      accent_color: '#000', theme: 'dark', font_pair: 'x', corners: null,
      profile_badge: null, created_at: '2026-01-01', updated_at: '2026-01-01',
      slides: [{ count: 3 }], coverSlide: null,
    };
    render(<DashboardClient initialCarousels={[carousel as never]} loadError="query" />);
    expect(screen.getAllByText('Meu carrossel').length).toBeGreaterThan(0);
    expect(screen.getByText(/não foi possível carregar/i)).toBeTruthy();
  });
});

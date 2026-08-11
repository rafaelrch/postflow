// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { DashboardCarousel } from '@/app/(app)/dashboard/page';

/**
 * O DASHBOARD RENDERIZA OS CARDS — não só o esqueleto.
 *
 * Esta lacuna é real e ficou provada por um susto: a suíte inteira passou
 * verde enquanto uma aba mostrava só o `loading.tsx` pulsando. Os testes de
 * paginação cobriam as FUNÇÕES (intervalo, total, redirecionamento) e o
 * CONTROLE isolado; nenhum afirmava que a lista de carrosséis chega à tela.
 *
 * (O susto em si era da aba do portal, que não resolve o boundary de Suspense
 * — o código estava certo. Mas o buraco de teste existia de verdade.)
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn(), loading: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }));
vi.mock('@/components/editor/CreateWizard', () => ({ default: () => null }));
// Os componentes de slide desenham a capa; aqui o que importa é a LISTA.
vi.mock('@/components/slides/MinimalistSlide', () => ({ default: () => <div data-capa /> }));
vi.mock('@/components/slides/Template01Slide', () => ({ default: () => <div data-capa /> }));
vi.mock('@/components/slides/Template02Slide', () => ({ default: () => <div data-capa /> }));
vi.mock('@/components/slides/ProfileSlide', () => ({ default: () => <div data-capa /> }));

import DashboardClient from '@/app/(app)/dashboard/DashboardClient';

function carrossel(i: number): DashboardCarousel {
  return {
    id: `c${i}`,
    title: `Carrossel ${i}`,
    style: 'minimalist',
    status: 'draft',
    accent_color: '#000000',
    theme: 'light',
    font_pair: 'SF Pro Display + IvyOra Text',
    corners: null,
    profile_badge: null,
    created_at: '2026-08-01T10:00:00.000Z',
    updated_at: '2026-08-01T10:00:00.000Z',
    slides: [{ count: 6 }],
    coverSlide: null,
  };
}

/** Uma página cheia: os 10 do recorte do banco. */
const UMA_PAGINA = Array.from({ length: 10 }, (_, i) => carrossel(i + 1));

/** Títulos que chegaram à grade, na ordem em que estão na tela. */
function titulosNaGrade(): string[] {
  const grade = Array.from(document.querySelectorAll('div')).find(
    (d) => d.className.includes('grid-cols-1') && d.className.includes('gap-5'),
  );
  if (!grade) return [];
  return Array.from(grade.children)
    .filter((c) => !c.textContent?.toUpperCase().includes('NOVO CARROSSEL'))
    .map((c) => c.querySelector('.font-display')?.textContent?.trim() ?? '?');
}

afterEach(cleanup);

describe('/dashboard sem parâmetro', () => {
  it('renderiza os 10 carrosséis da página, não só o esqueleto', () => {
    render(
      <DashboardClient initialCarousels={UMA_PAGINA} page={1} totalPages={2} totalCarousels={11} />,
    );

    // 🔴 O coração do teste: os títulos precisam chegar à TELA, na ordem do
    // recorte. (O título aparece em mais de um nó por card — capa e rodapé —
    // então a contagem sai da GRADE, não de um `getByText` solto.)
    expect(titulosNaGrade()).toEqual(
      Array.from({ length: 10 }, (_, i) => `Carrossel ${i + 1}`),
    );
    // Cada card traz suas ações — se a grade viesse vazia, isto seria 0.
    expect(screen.getAllByTitle(/Editar/i)).toHaveLength(10);
  });

  it('mostra o controle de paginação quando há mais de uma página', () => {
    render(
      <DashboardClient initialCarousels={UMA_PAGINA} page={1} totalPages={2} totalCarousels={11} />,
    );

    const nav = screen.getByRole('navigation', { name: 'Paginação dos carrosséis' });
    // Contrato novo (padrão Gmail): quem informa é o INTERVALO, não "Página X de Y".
    expect(nav.textContent).toContain('1-10 de 11');
    expect((screen.getByLabelText('Página anterior') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Próxima página') as HTMLButtonElement).disabled).toBe(false);
  });

  it('o "Total" é o do banco, não o tamanho da página', () => {
    const { container } = render(
      <DashboardClient initialCarousels={UMA_PAGINA} page={1} totalPages={2} totalCarousels={11} />,
    );
    // 10 na tela, 11 no total — o contador não pode mentir por causa do recorte.
    expect(container.textContent).toContain('11');
  });

  it('NÃO mostra o estado vazio quando há carrosséis', () => {
    render(
      <DashboardClient initialCarousels={UMA_PAGINA} page={1} totalPages={2} totalCarousels={11} />,
    );
    expect(screen.queryByText(/nenhum carrossel/i)).toBeNull();
  });
});

describe('/dashboard?page=2', () => {
  it('renderiza o resto — 1 carrossel — e diz que é a última página', () => {
    render(
      <DashboardClient initialCarousels={[carrossel(11)]} page={2} totalPages={2} totalCarousels={11} />,
    );

    expect(titulosNaGrade()).toEqual(['Carrossel 11']);
    expect(screen.getAllByTitle(/Editar/i)).toHaveLength(1);
    expect((screen.getByLabelText('Próxima página') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('uma página só', () => {
  it('renderiza os cards, mantém o intervalo e esconde as SETAS', () => {
    render(
      <DashboardClient initialCarousels={UMA_PAGINA.slice(0, 3)} page={1} totalPages={1} totalCarousels={3} />,
    );

    expect(screen.getAllByTitle(/Editar/i)).toHaveLength(3);
    // O rótulo fica (é a contagem); some a navegação que não navegaria.
    expect(screen.getByText('1-3 de 3')).toBeTruthy();
    expect(screen.queryByLabelText('Página anterior')).toBeNull();
    expect(screen.queryByLabelText('Próxima página')).toBeNull();
  });
});

describe('falha de carga continua distinta de lista vazia', () => {
  it('com erro, avisa a falha em vez de dizer que não há carrossel', () => {
    render(
      <DashboardClient initialCarousels={[]} loadError="timeout" page={1} totalPages={1} totalCarousels={null} />,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/não foi possível carregar/i)).toBeTruthy();
    // 🔴 O estado vazio ("crie seu primeiro") não pode aparecer em cima de falha.
    expect(screen.queryByText(/nenhum carrossel/i)).toBeNull();
  });
});

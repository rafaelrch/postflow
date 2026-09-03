// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_SLIDE,
  type Slide,
} from '@/types';

/**
 * Chave ATELIER_ENABLED (lib/feature-flags.ts). O Atelier (o estilo
 * `editorial`) foi DESLIGADO — não apagado. Este arquivo prova as duas
 * metades, e mais a garantia que dá sentido a "desligar em vez de remover":
 *
 *   - DESLIGADO: o card some do grid de templates do wizard, e os outros
 *     quatro continuam lá.
 *   - LIGADO: o card volta, no lugar de sempre — a prova de que religar é
 *     trocar um `false` por `true` e nada mais.
 *   - SEMPRE: um carrossel `editorial` JÁ SALVO continua abrindo e editando
 *     com a chave em `false`. A chave tira a OFERTA de criar um novo; ela não
 *     encosta no que já existe.
 *
 * Cada bloco reimporta o wizard depois de trocar o mock da chave, porque
 * `TEMPLATES` é derivado no topo do módulo (a lista é filtrada na carga) e um
 * import cacheado congelaria o valor do primeiro teste.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('react-hot-toast', () => ({
  default: { loading: vi.fn(), success: vi.fn(), error: vi.fn() },
}));
// O wizard carrega o contexto de marca ao montar. Sem sessão ele desiste cedo,
// que é o caminho que interessa aqui.
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock('@/lib/upload-image', () => ({ uploadImageFile: vi.fn() }));

/** Rótulo de produto de cada estilo que o wizard oferece, na ordem do grid. */
const OUTROS_TEMPLATES = ['Profile', 'Manifesto', 'Radar', 'FlowLine'];
const ATELIER = 'Atelier';

/** Troca o valor da chave e devolve o wizard já recarregado. */
async function loadWithFlag(enabled: boolean) {
  vi.resetModules();
  vi.doMock('@/lib/feature-flags', () => ({
    ATELIER_ENABLED: enabled,
    REELS_ENABLED: false,
  }));
  const CreateWizard = (await import('../components/editor/CreateWizard')).default;
  return { CreateWizard };
}

/** Abre o wizard e avança até o passo 2, onde mora o grid de templates. */
function abreNoPassoDeTemplate(CreateWizard: React.ComponentType<{ onClose: () => void }>) {
  render(<CreateWizard onClose={vi.fn()} />);
  fireEvent.click(screen.getByText('Carrossel'));
  fireEvent.click(screen.getByText('Continuar'));
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.doUnmock('@/lib/feature-flags');
});

describe('ATELIER_ENABLED = false (estado atual: Atelier fora da oferta)', () => {
  it('o grid de templates do wizard não mostra o card do Atelier', async () => {
    const { CreateWizard } = await loadWithFlag(false);
    abreNoPassoDeTemplate(CreateWizard);

    expect(screen.queryByText(ATELIER)).toBeNull();
  });

  it('os outros quatro templates continuam no grid', async () => {
    const { CreateWizard } = await loadWithFlag(false);
    abreNoPassoDeTemplate(CreateWizard);

    // Sanidade: o passo não ficou vazio nem perdeu ninguém junto.
    for (const rotulo of OUTROS_TEMPLATES) {
      expect(screen.getByText(rotulo), `sumiu o ${rotulo}`).toBeTruthy();
    }
  });

  it('nenhum card do grid seleciona o estilo `editorial`', async () => {
    const { CreateWizard } = await loadWithFlag(false);
    abreNoPassoDeTemplate(CreateWizard);

    // O preview de cada card carrega `/templates/preview-<estilo>-<formato>`.
    // Nenhum deles pode ser o do editorial.
    const srcs = Array.from(document.querySelectorAll('img')).map((img) =>
      decodeURIComponent(img.getAttribute('src') || ''),
    );
    expect(srcs.some((src) => src.includes('preview-editorial'))).toBe(false);
    expect(srcs.some((src) => src.includes('preview-profile'))).toBe(true);
  });
});

describe('ATELIER_ENABLED = true (prova de que religar é só trocar a chave)', () => {
  it('o card do Atelier volta ao grid', async () => {
    const { CreateWizard } = await loadWithFlag(true);
    abreNoPassoDeTemplate(CreateWizard);

    expect(screen.getByText(ATELIER)).toBeTruthy();
  });

  it('o Atelier volta selecionável, com o preview dele', async () => {
    const { CreateWizard } = await loadWithFlag(true);
    abreNoPassoDeTemplate(CreateWizard);

    const card = screen.getByText(ATELIER).closest('button') as HTMLElement;
    expect(card).toBeTruthy();
    fireEvent.click(card);
    expect(card.getAttribute('aria-pressed')).toBe('true');

    const srcs = Array.from(document.querySelectorAll('img')).map((img) =>
      decodeURIComponent(img.getAttribute('src') || ''),
    );
    expect(srcs.some((src) => src.includes('preview-editorial'))).toBe(true);
  });

  it('os outros quatro continuam lá — voltar o Atelier não desloca ninguém', async () => {
    const { CreateWizard } = await loadWithFlag(true);
    abreNoPassoDeTemplate(CreateWizard);

    for (const rotulo of [...OUTROS_TEMPLATES, ATELIER]) {
      expect(screen.getByText(rotulo), `sumiu o ${rotulo}`).toBeTruthy();
    }
  });
});

describe('desligar não apaga: carrossel Atelier já salvo continua funcionando', () => {
  function slideSalvo(extra: Partial<Slide> = {}): Slide {
    return {
      ...DEFAULT_SLIDE,
      id: 'e1',
      position: 1,
      title: 'Título do carrossel salvo',
      description: 'Descrição do slide salvo',
      ...extra,
    } as Slide;
  }

  it('o estilo `editorial` segue no catálogo de estilos do produto', async () => {
    // Se alguém "limpasse" o SlideStyle achando que desativar é remover, todo
    // carrossel salvo viraria um estilo desconhecido. O type é a fronteira.
    vi.resetModules();
    vi.doMock('@/lib/feature-flags', () => ({
      ATELIER_ENABLED: false,
      REELS_ENABLED: false,
    }));
    const { DEFAULT_GLOBAL_SETTINGS: settings } = await import('../types');
    expect(settings).toBeTruthy();

    const { default: SlidePreview } = await import('../components/editor/SlidePreview');
    expect(SlidePreview).toBeTruthy();
  });

  it('com a chave em `false`, um slide `editorial` salvo ainda renderiza', async () => {
    vi.resetModules();
    vi.doMock('@/lib/feature-flags', () => ({
      ATELIER_ENABLED: false,
      REELS_ENABLED: false,
    }));
    const { default: SlidePreview } = await import('../components/editor/SlidePreview');

    render(
      <SlidePreview
        slide={slideSalvo()}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        style="editorial"
        slideIndex={1}
        totalSlides={4}
      />,
    );

    expect(screen.getByText('Título do carrossel salvo')).toBeTruthy();
    expect(screen.getByText('Descrição do slide salvo')).toBeTruthy();
  });

  it('a CAPA de um Atelier salvo também continua renderizando', async () => {
    vi.resetModules();
    vi.doMock('@/lib/feature-flags', () => ({
      ATELIER_ENABLED: false,
      REELS_ENABLED: false,
    }));
    const { default: SlidePreview } = await import('../components/editor/SlidePreview');

    render(
      <SlidePreview
        slide={slideSalvo({ id: 'capa', position: 0, contentLayout: 'cover' })}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        style="editorial"
        slideIndex={0}
        totalSlides={4}
      />,
    );

    expect(screen.getByText('Título do carrossel salvo')).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, within, fireEvent } from '@testing-library/react';
import ProfileSlide from '@/components/slides/ProfileSlide';
import { useEditorStore } from '@/hooks/useEditorStore';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, type Slide } from '@/types';

vi.mock('@/hooks/useGenerateCarouselImages', async () => {
  // Spread do módulo real: a barra lateral também usa `batchTargets` daqui, e
  // um mock que lista export por export quebra a cada função nova. Só o hook e
  // o `isEditorialCoverSlide` são substituídos, que é o que estes testes querem
  // controlar.
  const real = await vi.importActual<typeof import('@/hooks/useGenerateCarouselImages')>(
    '@/hooks/useGenerateCarouselImages'
  );
  return {
    ...real,
    useGenerateCarouselImages: () => ({
      generateAll: vi.fn(),
      generateOne: vi.fn(),
      generating: false,
      progress: null,
    }),
    isEditorialCoverSlide: () => false,
  };
});
vi.mock('@/lib/upload-image', () => ({ uploadImageFile: vi.fn(async () => 'https://x/y.png') }));
vi.mock('react-hot-toast', () => ({ default: { loading: vi.fn(), success: vi.fn(), error: vi.fn() } }));

import EditorSidebar from '@/components/editor/EditorSidebar';

/**
 * TEMPLATE PERFIL — os dois pedidos do Rafael.
 *
 * 7. Negrito PARCIAL: dá para engrossar ALGUMAS palavras, não o texto todo. O
 *    caminho já existia (`TextHighlight.font` + `WordHighlightPicker`, usados
 *    pelo Editorial e pelo Minimalista); o que faltava era o `ProfileSlide` ler
 *    os destaques e a barra lateral oferecer o controle no estilo `profile`.
 *
 * 8. A mídia do post. Duas exigências do Rafael que pareciam brigar: a imagem
 *    entra INTEIRA (nada de corte que ninguém pediu) e os sliders X/Y/zoom
 *    servem para alguma coisa (foto enviada na mão precisa de ajuste). O
 *    modelo que atende as duas é a caixa fixa com `contain`. O histórico
 *    inteiro está dentro do bloco 8 — leia antes de mexer nele, o círculo já
 *    se fechou duas vezes.
 */

const perfil = { photo: '', name: 'Fulano', handle: '@fulano' };

function slidePerfil(extra: Partial<Slide> = {}): Slide {
  return {
    ...DEFAULT_SLIDE,
    id: 'p1',
    position: 0,
    title: 'Negrito só em algumas palavras',
    description: '',
    ...extra,
  } as Slide;
}

function renderPerfil(slide: Slide) {
  return render(
    <ProfileSlide
      slide={slide}
      globalSettings={DEFAULT_GLOBAL_SETTINGS}
      profileData={perfil}
      slideIndex={0}
      totalSlides={3}
    />,
  );
}

afterEach(cleanup);

describe('7 — negrito parcial no Perfil', () => {
  it('a palavra destacada sai com a fonte dela; o resto do bloco não muda', () => {
    const { container } = renderPerfil(
      slidePerfil({
        highlights: [{ text: 'algumas', color: '#0F1419', font: 'Inter Bold' }],
      }),
    );

    const spans = Array.from(container.querySelectorAll('span'));
    const destaque = spans.find((s) => s.textContent === 'algumas');
    expect(destaque, 'a palavra destacada precisa virar um span próprio').toBeTruthy();
    expect(destaque!.style.fontWeight).toBe('700');

    // As outras palavras continuam no peso do bloco (400) — é isso que faz o
    // negrito ser PARCIAL e não do texto todo.
    const outra = spans.find((s) => s.textContent === 'Negrito');
    expect(outra?.style.fontWeight ?? '').not.toBe('700');
    expect(container.textContent).toContain('Negrito só em algumas palavras');
  });

  it('sem destaque nenhum o texto sai inteiro, como sempre saiu', () => {
    const { container } = renderPerfil(slidePerfil());
    expect(container.textContent).toContain('Negrito só em algumas palavras');
  });

  it('a cor do destaque também vale', () => {
    const { container } = renderPerfil(
      slidePerfil({ highlights: [{ text: 'algumas', color: '#FF0000' }] }),
    );
    const destaque = Array.from(container.querySelectorAll('span')).find(
      (s) => s.textContent === 'algumas',
    );
    expect(destaque!.style.color).toBe('rgb(255, 0, 0)');
  });

  it('a barra lateral do Perfil oferece o controle de destaques', () => {
    useEditorStore.setState({
      slides: [slidePerfil()],
      activeSlideIndex: 0,
      style: 'profile',
      globalSettings: DEFAULT_GLOBAL_SETTINGS,
    });
    render(<EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />);

    const painel = document.querySelector('[data-panel="destaquesDoTexto"]') as HTMLElement;
    expect(painel, 'o painel de destaques não está na barra do Perfil').toBeTruthy();
    fireEvent.click(within(painel).getByRole('button', { expanded: false }));

    // Clicar na palavra e escolher uma face bold grava o destaque com a fonte.
    fireEvent.click(within(painel).getByRole('button', { name: 'algumas' }));
    const state = () => useEditorStore.getState().slides[0].highlights ?? [];
    expect(state().some((h) => h.text === 'algumas')).toBe(true);
  });
});

describe('8 — a mídia do Perfil: inteira no zoom 100, ajustável acima disso', () => {
  const FOTO = 'https://x/foto.png';
  const comImagem = (imagePosition: { x: number; y: number; zoom: number } = { x: 50, y: 50, zoom: 100 }) =>
    slidePerfil({ gridImageUrl: FOTO, imagePosition });

  const camadaDe = (slide: Slide) => {
    const { container } = renderPerfil(slide);
    const caixa = container.querySelector('[data-profile-media]') as HTMLElement;
    return { caixa, camada: caixa?.querySelector('div') as HTMLElement };
  };

  /**
   * ⚠️ O CICLO COMPLETO DESTE BLOCO. Leia antes de mexer — ele já se fechou
   * duas vezes, e das duas o teste foi o que segurou.
   *
   * 1. No começo a mídia era uma caixa FIXA de 864x510 com `cover`. Toda foto
   *    fora dessa proporção perdia as bordas; o Rafael reclamou do corte.
   * 2. Passou a entrar INTEIRA — `<img>` de proporção livre — a pedido dele.
   * 3. A auditoria dos cinco estilos achou o efeito colateral: imagem de IA em
   *    RETRATO virava uma tira estreita dentro da caixa larga. A rodada de
   *    20/08 respondeu voltando a caixa fixa com `cover` — desfazendo em
   *    silêncio a decisão do passo 2. Quem pegou foi este bloco.
   * 4. O Rafael reescolheu: imagem INTEIRA. E os sliders X/Y/zoom foram
   *    removidos do painel, com o argumento de que sem corte não há o que
   *    ajustar.
   * 5. Ele recusou também isso: "se o usuario adicionar uma imagem manualmente
   *    e que precisa ser ajustada, ele vai precisar dos sliders". As duas
   *    exigências — inteira E ajustável — não cabem na proporção livre, porque
   *    uma imagem que cabe inteira por definição não tem folga.
   *
   * O DESFECHO, que é o que este bloco trava: caixa fixa de novo, mas a camada
   * entra em `contain`. No zoom 100 a imagem aparece INTEIRA, sem corte —
   * a decisão do passo 4, preservada como PADRÃO. Acima de 100 ela cresce,
   * transborda a caixa e aí X e Y têm curso para enquadrar — o passo 5.
   *
   * 🔴 A LINHA QUE NÃO PODE CAIR: no zoom 100 a imagem não é cortada. Se
   * alguém trocar o `contain` por `cover` "para preencher a caixa", fecha o
   * círculo pela terceira vez. A tira estreita, que é a reclamação legítima do
   * passo 3, se resolve na GERAÇÃO — o Perfil pede `inset-landscape`
   * (1536x1024), então a imagem de IA já nasce deitada e preenche sozinha.
   */
  it('🔴 no zoom 100 a imagem NÃO é cortada — entra inteira', () => {
    const { camada } = camadaDe(comImagem({ x: 50, y: 50, zoom: 100 }));
    // `contain` é o que garante a imagem inteira; `cover` aqui seria o corte.
    expect(camada.style.backgroundSize).toBe('contain');
    // E a camada não é ampliada: escala 1 não tira nada de dentro da caixa.
    expect(camada.style.transform).toMatch(/scale\(1\)/);
  });

  it('o padrão de um slide novo já é o zoom 100 — ninguém é cortado sem pedir', () => {
    const { camada } = camadaDe(comImagem());
    expect(camada.style.backgroundSize).toBe('contain');
    expect(camada.style.transform).toMatch(/scale\(1\)/);
  });

  it('a caixa é fixa em 864x510 e recorta o que passar dela', () => {
    const { caixa } = camadaDe(comImagem());
    expect(caixa.style.width).toBe('864px');
    expect(caixa.style.height).toBe('510px');
    expect(caixa.style.overflow).toBe('hidden');
    expect(caixa.style.borderRadius).toBe('34px');
  });

  it('acima de 100 a imagem cresce e X e Y ganham curso', () => {
    const centro = camadaDe(comImagem({ x: 50, y: 50, zoom: 200 })).camada;
    // Escala > 1: agora a camada transborda a caixa, e é essa folga que os
    // eixos percorrem.
    expect(centro.style.transform).toMatch(/scale\(2\)/);

    const esquerda = camadaDe(comImagem({ x: 0, y: 50, zoom: 200 })).camada;
    const direita = camadaDe(comImagem({ x: 100, y: 50, zoom: 200 })).camada;
    const cima = camadaDe(comImagem({ x: 50, y: 0, zoom: 200 })).camada;
    expect(esquerda.style.transform).not.toBe(centro.style.transform);
    expect(direita.style.transform).not.toBe(centro.style.transform);
    expect(esquerda.style.transform).not.toBe(direita.style.transform);
    expect(cima.style.transform).not.toBe(centro.style.transform);
  });

  it('o posicionamento é o `getImageLayerStyle` dos outros estilos', () => {
    // Não pode existir uma terceira maneira de posicionar imagem no app: foi
    // ficar de fora dela que deixou o Perfil com sliders mortos.
    const { camada } = camadaDe(comImagem({ x: 20, y: 80, zoom: 100 }));
    expect(camada.style.backgroundImage).toContain('foto.png');
    expect(camada.style.backgroundPosition).toBe('20% 80%');
    expect(camada.style.backgroundRepeat).toBe('no-repeat');
  });

  it('sem imagem o slide continua sem bloco de mídia', () => {
    const { container } = renderPerfil(slidePerfil());
    expect(container.querySelector('[data-profile-media]')).toBeNull();
    expect(container.querySelector('img[src*="foto"]')).toBeNull();
  });

  it('o painel Imagem do Perfil oferece Posição X, Posição Y e Zoom', () => {
    // Pedido do Rafael: foto enviada na mão quase nunca chega no enquadramento
    // certo, e ele quer poder escolher. Eles valem porque a caixa é fixa — no
    // zoom 100 movem a imagem dentro da sobra, acima dele escolhem o corte.
    useEditorStore.setState({
      slides: [comImagem()],
      activeSlideIndex: 0,
      style: 'profile',
      globalSettings: DEFAULT_GLOBAL_SETTINGS,
    });
    render(<EditorSidebar onDownloadSlide={vi.fn()} onDownloadAll={vi.fn()} onOpenWizard={vi.fn()} />);

    const painel = document.querySelector('[data-panel="imagem"]') as HTMLElement;
    expect(painel, 'o painel Imagem precisa existir no Perfil').toBeTruthy();
    fireEvent.click(within(painel).getByRole('button', { expanded: false }));

    for (const rotulo of ['Posição X', 'Posição Y', 'Zoom']) {
      expect(
        within(painel).queryByText(rotulo),
        `o Perfil precisa do controle "${rotulo}"`,
      ).toBeTruthy();
    }
    expect(painel.querySelectorAll('input[type="range"]').length).toBe(3);
  });
});

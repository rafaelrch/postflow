// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import ProfileSlide from '@/components/slides/ProfileSlide';
import { applyEmbeddedImages, slideImageUrls } from '@/lib/export-images';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, type GlobalSettings, type Slide } from '@/types';

/**
 * A MÍDIA DO PERFIL CONTINUA SAINDO NA EXPORTAÇÃO.
 *
 * A mídia do post já trocou de forma três vezes em três rodadas — caixa com
 * `background-image`, `<img>` de proporção livre, e agora caixa fixa com a
 * camada em `contain`. Cada troca dessas passa RASPANDO na exportação, porque
 * a blindagem de `lib/export-images` é quem baixa as imagens e as embute antes
 * de a lib desenhar, e ela alcança `<img>` e `background-image` por caminhos
 * DIFERENTES. Trocar a forma sem olhar para cá é o jeito de o PNG voltar a sair
 * mudo, sem erro nenhum no console.
 *
 * Isto NÃO prova que o PNG final tem a imagem — só a tela responde isso. Prova
 * o elo que dá para provar sem browser: a URL entra na lista de download (PNG
 * solo e ZIP usam a mesma função) e a substituição por `data:` chega na camada
 * que o Perfil realmente desenha hoje.
 */

const FOTO = 'https://abc.supabase.co/storage/v1/object/public/postflow-assets/u/foto.png';
const G = DEFAULT_GLOBAL_SETTINGS as GlobalSettings;
const slide = (extra: Partial<Slide> = {}): Slide =>
  ({ ...DEFAULT_SLIDE, id: 'p1', title: 'Tema', description: '', ...extra }) as Slide;

afterEach(cleanup);

function arvorePerfil(s: Slide) {
  const { container } = render(
    <ProfileSlide
      slide={s}
      globalSettings={G}
      profileData={{ photo: '', name: 'Fulano', handle: '@fulano' }}
      slideIndex={0}
      totalSlides={3}
      forExport
    />,
  );
  return container;
}

describe('exportação do Perfil com a camada nova', () => {
  it('a URL da mídia continua na lista de download — vale para o PNG e o ZIP', () => {
    // Uma chamada por slide (PNG solo) e uma pelo deck (ZIP): é a MESMA função.
    expect(slideImageUrls([slide({ gridImageUrl: FOTO })], 'profile', G, 0)).toContain(FOTO);
    expect(slideImageUrls([slide({ gridImageUrl: FOTO })], 'profile', G)).toContain(FOTO);
  });

  it('o data URL chega na camada de background da mídia', () => {
    const container = arvorePerfil(slide({ gridImageUrl: FOTO }));
    const camada = (container.querySelector('[data-profile-media]') as HTMLElement)
      ?.querySelector('div') as HTMLElement;
    expect(camada, 'a mídia do Perfil desenha numa camada dentro da caixa').toBeTruthy();
    expect(camada.style.backgroundImage).toContain(FOTO);

    const desfazer = applyEmbeddedImages(container, new Map([[FOTO, 'data:image/png;base64,AAA']]));
    expect(camada.style.backgroundImage).toContain('data:image/png;base64,AAA');
    expect(camada.style.backgroundImage).not.toContain('supabase');

    desfazer();
    expect(camada.style.backgroundImage).toContain(FOTO);
  });

  it('o selo de verificado NÃO entra na lista — é asset local, mesma origem', () => {
    // Ele é o único `<img>` que sobrou na árvore do Perfil, e de propósito não
    // passa pelo download: sai do próprio deploy e não cai no caminho de rede
    // que a blindagem existe para cobrir.
    const urls = slideImageUrls([slide({ gridImageUrl: FOTO })], 'profile', G);
    expect(urls.some((u) => u.includes('selo_insta'))).toBe(false);
  });
});

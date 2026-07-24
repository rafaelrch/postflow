// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import ReelCard, { REEL_WIDTH } from '../components/reels/ReelCard';
import { DEFAULT_REEL, type ReelData } from '../lib/reels';
import { FORMATS } from '../lib/formats';

afterEach(cleanup);

function makeReel(over: Partial<ReelData> = {}): ReelData {
  return { ...DEFAULT_REEL, name: 'NOT JOURNAL', handle: 'notjournal.ai', caption: 'Legenda', ...over };
}

describe('ReelCard — layout do card', () => {
  it('o card usa a LARGURA 1080 e a altura do formato selecionado', () => {
    const { container, rerender } = render(<ReelCard reel={makeReel({ format: '4:5' })} />);
    const card = container.querySelector('[data-reel-card]') as HTMLElement;
    expect(card.style.width).toBe(`${REEL_WIDTH}px`);
    expect(card.style.height).toBe(`${FORMATS['4:5'].height}px`);
    expect(card.getAttribute('data-format')).toBe('4:5');

    rerender(<ReelCard reel={makeReel({ format: '9:16' })} />);
    const card916 = container.querySelector('[data-reel-card]') as HTMLElement;
    expect(card916.style.height).toBe(`${FORMATS['9:16'].height}px`);

    rerender(<ReelCard reel={makeReel({ format: '1:1' })} />);
    const card11 = container.querySelector('[data-reel-card]') as HTMLElement;
    expect(card11.style.height).toBe(`${FORMATS['1:1'].height}px`);
  });

  it('o cabeçalho tem padding horizontal; o bloco de vídeo é FULL-BLEED (sem padding, 100% largura)', () => {
    const { container } = render(<ReelCard reel={makeReel()} />);
    const header = container.querySelector('[data-reel-header]') as HTMLElement;
    const videoBlock = container.querySelector('[data-reel-video-block]') as HTMLElement;

    // Header: padding horizontal > 0
    expect(header.style.padding).toMatch(/52px/);

    // Vídeo full-bleed: largura 100%, sem padding, fundo preto, overflow hidden
    expect(videoBlock.style.width).toBe('100%');
    expect(videoBlock.style.padding === '' || videoBlock.style.padding === '0px').toBe(true);
    expect(videoBlock.style.background).toBe('rgb(0, 0, 0)');
    expect(videoBlock.style.overflow).toBe('hidden');
    // Sem borda/radius/shadow no bloco de vídeo
    expect(videoBlock.style.borderRadius === '' || videoBlock.style.borderRadius === '0px').toBe(true);
    expect(videoBlock.style.boxShadow).toBe('');
  });

  it('renderiza o <video> em object-fit CONTAIN, centrado, sem controles nativos', () => {
    const { container } = render(<ReelCard reel={makeReel({ videoUrl: 'blob:fake-video' })} />);
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video).toBeTruthy();
    expect(video.getAttribute('src')).toBe('blob:fake-video');
    expect(video.style.objectFit).toBe('contain');
    expect(video.style.objectPosition).toBe('center');
    // Sem controles nativos no conteúdo (não deve ter o atributo controls)
    expect(video.hasAttribute('controls')).toBe(false);
    expect(video.loop).toBe(true);
  });

  it('sem vídeo, o bloco full-bleed continua existindo (fundo preto), mas sem <video>', () => {
    const { container } = render(<ReelCard reel={makeReel({ videoUrl: undefined })} />);
    expect(container.querySelector('[data-reel-video-block]')).toBeTruthy();
    expect(container.querySelector('video')).toBeNull();
  });

  it('hideVideo (export) não renderiza o <video>, mas mantém cabeçalho/legenda', () => {
    const { container } = render(<ReelCard reel={makeReel({ videoUrl: 'blob:x' })} hideVideo />);
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('[data-reel-header]')?.textContent).toContain('NOT JOURNAL');
    expect(container.querySelector('[data-reel-header]')?.textContent).toContain('@notjournal.ai');
  });

  it('NÃO renderiza mais o selo de verificado (removido a pedido do Rafael)', () => {
    // Mesmo com verified=true no dado, o card não desenha o selo.
    const { container } = render(<ReelCard reel={makeReel({ verified: true })} />);
    expect(container.querySelector('[aria-label="Verificado"]')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('o formato padrão do template é 9:16 (Stories) — fixo', () => {
    const { container } = render(<ReelCard reel={{ ...DEFAULT_REEL }} />);
    const card = container.querySelector('[data-reel-card]') as HTMLElement;
    expect(card.getAttribute('data-format')).toBe('9:16');
    expect(card.style.height).toBe(`${FORMATS['9:16'].height}px`);
  });
});

describe('ReelCard — handle sem @@ (bug do preview/export)', () => {
  it('renderiza UM ÚNICO @ mesmo quando o handle já contém @', () => {
    const { container } = render(<ReelCard reel={makeReel({ handle: '@orafelrocha_' })} />);
    const header = container.querySelector('[data-reel-header]') as HTMLElement;
    expect(header.textContent).toContain('@orafelrocha_');
    expect(header.textContent).not.toContain('@@');
  });

  it('handle sem @ também vira exatamente um @handle', () => {
    const { container } = render(<ReelCard reel={makeReel({ handle: 'notjournal.ai' })} />);
    const header = container.querySelector('[data-reel-header]') as HTMLElement;
    expect(header.textContent).toContain('@notjournal.ai');
    expect(header.textContent).not.toContain('@@');
  });

  it('handle com múltiplos @ no início colapsa para um só', () => {
    const { container } = render(<ReelCard reel={makeReel({ handle: '@@@x' })} />);
    const header = container.querySelector('[data-reel-header]') as HTMLElement;
    expect(header.textContent).toContain('@x');
    expect(header.textContent).not.toContain('@@');
  });

  it('o bloco [header+vídeo] é centrado verticalmente no card (justifyContent center)', () => {
    const { container } = render(<ReelCard reel={makeReel()} />);
    const card = container.querySelector('[data-reel-card]') as HTMLElement;
    expect(card.style.justifyContent).toBe('center');
  });
});

describe('ReelCard — posição vertical (offset do bloco)', () => {
  // Vídeo landscape deixa sobra preta (letterbox), então há espaço p/ mover.
  const landscape = { videoUrl: 'blob:v', videoWidth: 1920, videoHeight: 1080 } as const;

  it('offset positivo move o bloco p/ baixo (translateY no wrapper)', () => {
    const { container } = render(
      <ReelCard reel={makeReel({ ...landscape, contentOffsetY: 200 })} />,
    );
    const block = container.querySelector('[data-reel-block]') as HTMLElement;
    expect(block.style.transform).toContain('translateY(200px)');
  });

  it('offset negativo move o bloco p/ cima', () => {
    const { container } = render(
      <ReelCard reel={makeReel({ ...landscape, contentOffsetY: -200 })} />,
    );
    const block = container.querySelector('[data-reel-block]') as HTMLElement;
    expect(block.style.transform).toContain('translateY(-200px)');
  });

  it('offset 0 = sem translate (bloco no centro)', () => {
    const { container } = render(<ReelCard reel={makeReel({ ...landscape, contentOffsetY: 0 })} />);
    const block = container.querySelector('[data-reel-block]') as HTMLElement;
    expect(block.style.transform).toBe('');
  });

  it('vídeo que PREENCHE o card: offset é clampado a 0 (não corta conteúdo)', () => {
    const { container } = render(
      <ReelCard reel={makeReel({ videoUrl: 'blob:v', videoWidth: 1080, videoHeight: 1920, contentOffsetY: 400 })} />,
    );
    const block = container.querySelector('[data-reel-block]') as HTMLElement;
    // room 0 -> offsetY 0 -> sem transform.
    expect(block.style.transform).toBe('');
  });
});

describe('ReelCard — alinhamento do perfil (fidelidade no export/html2canvas)', () => {
  it('a coluna nome+@handle é posicionada por offset ABSOLUTO (não flex vertical)', () => {
    const { container } = render(<ReelCard reel={makeReel()} />);
    const textcol = container.querySelector('[data-reel-textcol]') as HTMLElement;
    expect(textcol).toBeTruthy();
    expect(textcol.style.position).toBe('absolute');
    // top calculado (centraliza no avatar) — precisa estar setado.
    expect(textcol.style.top).not.toBe('');
  });

  it('a linha do nome tem HEIGHT explícito e o nome usa lineHeight = height (bate no html2canvas)', () => {
    const { container } = render(<ReelCard reel={makeReel()} />);
    const namerow = container.querySelector('[data-reel-namerow]') as HTMLElement;
    expect(namerow.style.height).not.toBe('');
    expect(namerow.style.alignItems).toBe('center');
    const nameSpan = namerow.querySelector('span') as HTMLElement;
    // lineHeight (px) bate com a height da linha => texto alinhado ao avatar.
    expect(nameSpan.style.lineHeight).toBe(namerow.style.height);
  });

  it('o avatar é um quadrado fixo via background-image (não <img> objectFit)', () => {
    const { container } = render(<ReelCard reel={makeReel({ avatarUrl: 'blob:av' })} />);
    const avatar = container.querySelector('[data-reel-avatar]') as HTMLElement;
    expect(avatar.style.width).toBe(avatar.style.height); // quadrado
    expect(avatar.style.backgroundImage).toContain('blob:av');
    // não deve existir <img> de avatar dentro do cabeçalho.
    expect(container.querySelector('[data-reel-header] img')).toBeNull();
  });
});

describe('ReelCard — estado vazio (novo reel) já nasce centrado', () => {
  it('sem vídeo, o bloco NÃO cola no topo: caixa de vídeo 0 e cabeçalho centrado', () => {
    const { container } = render(<ReelCard reel={makeReel({ videoUrl: undefined })} />);
    const card = container.querySelector('[data-reel-card]') as HTMLElement;
    const videoBlock = container.querySelector('[data-reel-video-block]') as HTMLElement;
    // hasVideo=false -> videoBox 0; o card centraliza o cabeçalho (justify center).
    expect(videoBlock.style.height).toBe('0px');
    expect(card.style.justifyContent).toBe('center');
  });

  it('com vídeo, a caixa de vídeo volta a ter altura (não é 0)', () => {
    const { container } = render(
      <ReelCard reel={makeReel({ videoUrl: 'blob:v', videoWidth: 1920, videoHeight: 1080 })} />,
    );
    const videoBlock = container.querySelector('[data-reel-video-block]') as HTMLElement;
    expect(videoBlock.style.height).not.toBe('0px');
  });
});

describe('ReelCard — placeholder de legenda (só no preview, nunca no export)', () => {
  it('sem legenda, o PREVIEW mostra o placeholder de texto', () => {
    const { container } = render(<ReelCard reel={makeReel({ caption: '' })} />);
    const ph = container.querySelector('[data-reel-caption-placeholder]');
    expect(ph).toBeTruthy();
    expect(ph?.textContent).toContain('Insira aqui o texto');
  });

  it('com legenda, mostra o texto real e não o placeholder', () => {
    const { container } = render(<ReelCard reel={makeReel({ caption: 'Minha legenda' })} />);
    expect(container.querySelector('[data-reel-caption-placeholder]')).toBeNull();
    expect(container.querySelector('[data-reel-header]')?.textContent).toContain('Minha legenda');
  });

  it('no EXPORT (hideVideo) SEM legenda, o placeholder NÃO é rasterizado (fora do MP4)', () => {
    const { container } = render(<ReelCard reel={makeReel({ caption: '' })} hideVideo />);
    expect(container.querySelector('[data-reel-caption-placeholder]')).toBeNull();
  });
});

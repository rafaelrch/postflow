// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Template03Slide, { TEMPLATE_03_DOTS_OFFSET_Y } from '@/components/slides/Template03Slide';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide } from '@/types';
import { TEMPLATE_03_HEIGHT, TEMPLATE_03_WIDTH, template03SpecNode } from '@/lib/templates/template-03';
import { template03ContentPositionFor, template03ContentAlignFor } from '@/lib/templates/template-03/overrides';
import { template03ProfileGeometry } from '@/lib/templates/template-03/profile';

function t03Slide(extra: Partial<Slide> = {}): Slide {
  return { ...DEFAULT_SLIDE, id: 's1', position: 0, templateModel: 1, templateSlots: {}, ...extra } as Slide;
}

function contentTop(html: string): number {
  const match = html.match(/data-block="conteudo"[^>]*style="[^"]*top:\s*(\d+(?:\.\d+)?)px/);
  if (!match) throw new Error('data-block="conteudo" com top não encontrado');
  return Number(match[1]);
}

function styleFor(html: string, marker: string): string {
  const match = html.match(new RegExp(`${marker}[^>]*style="([^"]*)`));
  if (!match) throw new Error(`style não encontrado: ${marker}`);
  return match[1];
}

function cssPx(style: string, property: string): number {
  const match = style.match(new RegExp(`${property}:\\s*(-?\\d+(?:\\.\\d+)?)px`));
  if (!match) return 0;
  return Number(match[1]);
}

function contentLeft(html: string): number {
  return cssPx(styleFor(html, 'data-block="conteudo"'), 'left');
}

function transformScale(style: string): number {
  return Number(style.match(/transform:scale\((\d+(?:\.\d+)?)\)/)?.[1] ?? 1);
}

function transformOriginX(style: string): number {
  return Number(style.match(/transform-origin:\s*(\d+(?:\.\d+)?)px/)?.[1] ?? 0);
}

function effectiveChildLeft(html: string, marker: string): number {
  const group = styleFor(html, 'data-profile-group');
  const visual = styleFor(html, 'data-profile-visual');
  const groupLeft = cssPx(group, 'left');
  const originX = transformOriginX(group);
  const scale = transformScale(group);
  const avatar = styleFor(html, /data-slot="s2\.avatar"/.test(html) ? 'data-slot="s2.avatar"' : 'data-slot="s1.avatar"');
  const visualLeft = cssPx(visual, 'left');
  const relativeLeft = marker === 'data-profile-handle-layout'
    ? cssPx(avatar, 'width') + cssPx(visual, 'gap')
    : 0;
  return groupLeft + originX + scale * (visualLeft + relativeLeft - originX);
}

function effectiveProfilePartX(html: string, left: number): number {
  const group = styleFor(html, 'data-profile-group');
  const visual = styleFor(html, 'data-profile-visual');
  const groupLeft = cssPx(group, 'left');
  const originX = transformOriginX(group);
  const scale = transformScale(group);
  return groupLeft + originX + scale * (cssPx(visual, 'left') + left - originX);
}

function effectiveVisualEdge(html: string, edge: 'left' | 'right'): number {
  const visual = styleFor(html, 'data-profile-visual');
  if (edge === 'right' && visual.includes('right: 0px')) return effectiveGroupRight(html);
  if (edge === 'left' && visual.includes('left: 0px')) {
    return cssPx(styleFor(html, 'data-profile-group'), 'left');
  }
  const geometry = template03ProfileGeometry(2, 358, { profileScale: 100 });
  const parts = [geometry.avatar, geometry.handle, geometry.badge];
  const values = parts.map((part) => effectiveProfilePartX(
    html,
    edge === 'right' ? part.left + part.width : part.left,
  ));
  return edge === 'right' ? Math.max(...values) : Math.min(...values);
}

/**
 * No layout de fluxo, o badge é o último filho real da barra. Em `direita`,
 * portanto, seu edge efetivo é o edge transformado do visual ancorado ao fim
 * do grupo — uma coordenada numérica, não uma asserção sobre a string CSS.
 */
function effectiveBadgeRight(html: string): number {
  const visual = styleFor(html, 'data-profile-visual');
  if (!visual.includes('right: 0px')) throw new Error('badge fora da âncora direita');
  return effectiveGroupRight(html);
}

function effectiveGroupRight(html: string): number {
  const group = styleFor(html, 'data-profile-group');
  const groupLeft = cssPx(group, 'left');
  const groupWidth = cssPx(group, 'width');
  const originX = transformOriginX(group);
  const scale = transformScale(group);
  return groupLeft + originX + scale * (groupWidth - originX);
}

function effectiveGroupCenter(html: string): number {
  const group = styleFor(html, 'data-profile-group');
  const groupLeft = cssPx(group, 'left');
  const groupWidth = cssPx(group, 'width');
  const originX = transformOriginX(group);
  const scale = transformScale(group);
  return groupLeft + originX + scale * (groupWidth / 2 - originX);
}

function profileCoordinates(html: string): { avatarLeft: number; avatarTop: number; handleLeft: number; handleTop: number } {
  const group = styleFor(html, 'data-profile-group');
  const visual = styleFor(html, 'data-profile-visual');
  const avatar = styleFor(html, /data-slot="s2\.avatar"/.test(html) ? 'data-slot="s2.avatar"' : 'data-slot="s1.avatar"');
  const handle = styleFor(html, 'data-profile-handle-layout');
  return {
    avatarLeft: cssPx(group, 'left') + cssPx(visual, 'left') + cssPx(avatar, 'left'),
    avatarTop: cssPx(group, 'top') + cssPx(visual, 'top') + cssPx(avatar, 'top'),
    handleLeft: cssPx(group, 'left') + cssPx(visual, 'left') + cssPx(handle, 'left'),
    handleTop: cssPx(group, 'top') + cssPx(visual, 'top') + cssPx(handle, 'top'),
  };
}

describe('T3 — posição do conteúdo (contentPosition)', () => {
  it('default (sem override) é "baixo", igual ao spec', () => {
    const slide = t03Slide();
    expect(template03ContentPositionFor(slide, 1)).toBe('baixo');
  });

  it('renderiza o bloco de conteúdo nas três posições verticais', () => {
    const baixo = render(
      <Template03Slide slide={t03Slide()} globalSettings={DEFAULT_GLOBAL_SETTINGS} slideIndex={0} totalSlides={4} forExport />
    ).container.innerHTML;
    const topo = render(
      <Template03Slide
        slide={t03Slide({ templateOverrides: { contentPosition: 'topo' } })}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={0}
        totalSlides={4}
        forExport
      />
    ).container.innerHTML;
    const centro = render(
      <Template03Slide
        slide={t03Slide({ templateOverrides: { contentPosition: 'centro' } })}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={0}
        totalSlides={4}
        forExport
      />
    ).container.innerHTML;

    const topBaixo = contentTop(baixo);
    const topTopo = contentTop(topo);
    const topCentro = contentTop(centro);

    // 'topo' sobe o bloco; 'baixo' é a posição do spec; 'centro' fica no meio.
    expect(topTopo).toBeLessThan(topBaixo);
    expect(Math.abs(topCentro - TEMPLATE_03_HEIGHT / 2)).toBeLessThan(400);
    // persistência: a chave gravada é lida de volta.
    expect(template03ContentPositionFor(t03Slide({ templateOverrides: { contentPosition: 'centro' } }), 1)).toBe('centro');
  });

  it('move avatar e handle junto com o bloco nas três âncoras verticais', () => {
    const renderPosition = (contentPosition: 'topo' | 'centro' | 'baixo') => render(
      <Template03Slide
        slide={t03Slide({ templateOverrides: { contentPosition } })}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={0}
        totalSlides={4}
        forExport
      />
    ).container.innerHTML;
    const base = renderPosition('baixo');
    const baseTop = contentTop(base);
    const baseProfile = profileCoordinates(base);
    for (const position of ['topo', 'centro', 'baixo'] as const) {
      const html = renderPosition(position);
      const delta = contentTop(html) - baseTop;
      const profile = profileCoordinates(html);
      expect(profile.avatarTop - baseProfile.avatarTop, position).toBe(delta);
      expect(profile.handleTop - baseProfile.handleTop, position).toBe(delta);
    }
  });
});

describe('T3 — alinhamento horizontal do conteúdo (contentAlign)', () => {
  it('default (sem override) é "esquerda", igual ao spec', () => {
    const slide = t03Slide();
    expect(template03ContentAlignFor(slide, 1)).toBe('esquerda');
  });

  it('renderiza o bloco com o text-align escolhido', () => {
    const esquerda = render(
      <Template03Slide
        slide={t03Slide({ templateOverrides: { contentAlign: 'esquerda' } })}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={0}
        totalSlides={4}
        forExport
      />
    ).container.innerHTML;
    const direita = render(
      <Template03Slide
        slide={t03Slide({ templateOverrides: { contentAlign: 'direita' } })}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={0}
        totalSlides={4}
        forExport
      />
    ).container.innerHTML;
    const centro = render(
      <Template03Slide
        slide={t03Slide({ templateOverrides: { contentAlign: 'centro' } })}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={0}
        totalSlides={4}
        forExport
      />
    ).container.innerHTML;

    expect(esquerda).toContain('text-align: left');
    expect(direita).toContain('text-align: right');
    expect(centro).toContain('text-align: center');
    // persistência
    expect(template03ContentAlignFor(t03Slide({ templateOverrides: { contentAlign: 'direita' } }), 1)).toBe('direita');
  });

  it('move a coluna do passo para as três âncoras reais, preservando a largura do spec', () => {
    const step = (contentAlign: 'esquerda' | 'centro' | 'direita') => render(
      <Template03Slide
        slide={t03Slide({ position: 1, templateModel: 2, templateOverrides: { contentAlign } })}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={1}
        totalSlides={4}
        forExport
      />
    ).container.innerHTML;
    const block = (html: string) => html.match(/data-block="conteudo"[^>]*style="([^"]*)/)?.[1] ?? '';
    const left = (html: string) => Number(block(html).match(/left:\s*(\d+(?:\.\d+)?)px/)?.[1]);
    const width = (html: string) => Number(block(html).match(/width:\s*(\d+(?:\.\d+)?)px/)?.[1]);

    const esquerda = left(step('esquerda'));
    const centro = left(step('centro'));
    const direita = left(step('direita'));
    const title = template03SpecNode('s2.title', 2)!;
    const expectedRight = TEMPLATE_03_WIDTH - title.box.x;

    expect(esquerda).toBe(title.box.x);
    expect(centro).toBe((TEMPLATE_03_WIDTH - width(step('centro'))) / 2);
    expect(centro).toBeGreaterThan(esquerda);
    expect(direita).toBe(expectedRight - width(step('direita')));
    expect(direita).toBeGreaterThan(centro);
    expect(direita + width(step('direita'))).toBe(expectedRight);
    expect(width(step('direita'))).toBe(width(step('esquerda')));
  });

  it('move avatar e handle junto com a coluna nas três âncoras horizontais', () => {
    const renderAlign = (contentAlign: 'esquerda' | 'centro' | 'direita') => render(
      <Template03Slide
        slide={t03Slide({ position: 1, templateModel: 2, templateOverrides: { contentAlign } })}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={1}
        totalSlides={4}
        forExport
      />
    ).container.innerHTML;
    const base = renderAlign('esquerda');
    const baseLeft = contentLeft(base);
    const baseProfile = profileCoordinates(base);
    for (const align of ['esquerda', 'centro', 'direita'] as const) {
      const html = renderAlign(align);
      const profile = profileCoordinates(html);
      expect(profile.avatarLeft - baseProfile.avatarLeft, align).toBeCloseTo(
        profile.handleLeft - baseProfile.handleLeft,
        8,
      );
      if (align !== 'esquerda') {
        expect(profile.avatarLeft, align).toBeGreaterThan(baseProfile.avatarLeft);
      }
    }
  });

  it('alinha o wrapper e as coordenadas efetivas da barra à coluna, inclusive com escala', () => {
    const renderAlign = (contentAlign: 'esquerda' | 'centro' | 'direita') => render(
      <Template03Slide
        slide={t03Slide({
          position: 1,
          templateModel: 2,
          templateOverrides: { contentAlign },
          templateSlotStyles: { 's2.avatar': { profileScale: 120 } },
        })}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={1}
        totalSlides={4}
        forExport
      />
    ).container.innerHTML;
    const geometry = template03ProfileGeometry(2, 358, { profileScale: 100 });
    for (const align of ['esquerda', 'centro', 'direita'] as const) {
      const html = renderAlign(align);
      const block = styleFor(html, 'data-block="conteudo"');
      const group = styleFor(html, 'data-profile-group');
      const blockLeft = cssPx(block, 'left');
      const blockWidth = cssPx(block, 'width');
      const blockCenter = blockLeft + blockWidth / 2;
      const groupLeft = cssPx(group, 'left');
      const groupWidth = cssPx(group, 'width');
      const scale = transformScale(group);
      const originX = transformOriginX(group);
      const groupCenter = groupLeft + originX + scale * (groupWidth / 2 - originX);
      const avatarLeft = effectiveChildLeft(html, /data-slot="s2\.avatar"/.test(html) ? 'data-slot="s2.avatar"' : 'data-slot="s1.avatar"');
      const handleLeft = effectiveChildLeft(html, 'data-profile-handle-layout');

      expect(groupLeft, `${align} wrapper left`).toBe(blockLeft);
      expect(groupWidth, `${align} wrapper width`).toBe(blockWidth);
      if (align === 'centro') {
        expect(groupCenter, `${align} wrapper center`).toBeCloseTo(blockCenter, 4);
      }
      if (align === 'direita') {
        expect(effectiveBadgeRight(html), `${align} badge right`).toBeCloseTo(blockLeft + blockWidth, 4);
      }
      if (align === 'esquerda') {
        expect(effectiveVisualEdge(html, 'left'), `${align} visual left`).toBeCloseTo(blockLeft, 4);
      }
      expect(handleLeft - avatarLeft, `${align} avatar/@ gap`).toBeCloseTo(
        scale * (geometry.handle.left - geometry.avatar.left),
        4,
      );
      if (align === 'direita') {
        expect(effectiveVisualEdge(html, 'right'), `${align} visual right`).toBeCloseTo(blockLeft + blockWidth, 4);
      }
    }
  });

  it('ancora direita a borda visual da barra no fim da coluna, sem mover centro/esquerda', () => {
    const renderAlign = (contentAlign: 'esquerda' | 'centro' | 'direita') => render(
      <Template03Slide
        slide={t03Slide({
          position: 1,
          templateModel: 2,
          templateOverrides: { contentAlign },
          templateSlotStyles: { 's2.avatar': { profileScale: 120 } },
        })}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={1}
        totalSlides={4}
        forExport
      />
    ).container.innerHTML;
    const rect = (html: string) => {
      const block = styleFor(html, 'data-block="conteudo"');
      const left = cssPx(block, 'left');
      const width = cssPx(block, 'width');
      return { left, right: left + width, center: left + width / 2 };
    };
    const esquerda = renderAlign('esquerda');
    const centro = renderAlign('centro');
    const direita = renderAlign('direita');

    expect(effectiveVisualEdge(esquerda, 'left')).toBeCloseTo(rect(esquerda).left, 4);
    expect(effectiveGroupCenter(centro)).toBeCloseTo(rect(centro).center, 4);
    expect(effectiveVisualEdge(direita, 'right')).toBeCloseTo(rect(direita).right, 4);
  });

  it('mantém título, corpo e barra de perfil na mesma borda interna, com badge dentro dela', () => {
    const rendered = render(
      <Template03Slide
        slide={t03Slide({
          position: 1,
          templateModel: 2,
          templateOverrides: { contentAlign: 'direita' },
        })}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={1}
        totalSlides={4}
        forExport
      />
    );
    const html = rendered.container.innerHTML;
    const title = template03SpecNode('s2.title', 2)!;
    const block = styleFor(html, 'data-block="conteudo"');
    const titleStyle = styleFor(html, 'data-slot="s2.title"');
    const bodyStyle = styleFor(html, 'data-slot="s2.body"');
    const group = styleFor(html, 'data-profile-group');
    const handleLayout = styleFor(html, 'data-profile-handle-layout');
    const blockLeft = cssPx(block, 'left');
    const blockWidth = cssPx(block, 'width');
    const contentRight = TEMPLATE_03_WIDTH - title.box.x;

    expect(blockLeft + blockWidth).toBe(contentRight);
    expect(effectiveBadgeRight(html)).toBe(contentRight);
    expect(titleStyle).toContain('text-align: right');
    expect(bodyStyle).toContain('text-align: right');
    expect(cssPx(group, 'left')).toBe(blockLeft);
    expect(cssPx(group, 'width')).toBe(blockWidth);
    expect(cssPx(group, 'left') + cssPx(group, 'width')).toBe(contentRight);
    expect(rendered.container.querySelector('[data-profile-visual]')?.lastElementChild)
      .toBe(rendered.container.querySelector('[data-profile-handle-layout]'));
    expect(rendered.container.querySelector('[data-profile-handle-layout]')?.lastElementChild)
      .toBe(rendered.container.querySelector('[data-badge-asset]'));
    expect(cssPx(handleLayout, 'gap')).toBeCloseTo(
      template03ProfileGeometry(2, 358).badge.left
        - template03ProfileGeometry(2, 358).handle.left
        - template03ProfileGeometry(2, 358).handle.width,
      4,
    );
    expect(Number(rendered.container.querySelector('[data-badge-asset]')?.getAttribute('width')))
      .toBeCloseTo(template03ProfileGeometry(2, 358).badge.width, 4);
    expect(html).toContain('data-slot="s2.title"');
    expect(html).toContain('data-slot="s2.body"');
  });

  it('direita usa a borda interna simétrica do frame, não o fim técnico do body do passo', () => {
    const html = render(
      <Template03Slide
        slide={t03Slide({
          position: 1,
          templateModel: 2,
          templateOverrides: { contentAlign: 'direita' },
          templateSlotStyles: { 's2.avatar': { profileScale: 120 } },
        })}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={1}
        totalSlides={4}
        forExport
      />
    ).container.innerHTML;
    const title = template03SpecNode('s2.title', 2)!;
    const visualRight = TEMPLATE_03_WIDTH - title.box.x;

    expect(effectiveVisualEdge(html, 'right')).toBeCloseTo(visualRight, 4);
  });

  it('desce os dots por um ajuste explícito sem tirá-los do canvas', () => {
    const html = render(
      <Template03Slide slide={t03Slide()} globalSettings={DEFAULT_GLOBAL_SETTINGS} slideIndex={0} totalSlides={4} forExport />
    ).container.innerHTML;
    const dotsStyle = html.match(/<svg[^>]*data-dots-total="4"[^>]*style="([^"]*)/)?.[1] ?? '';
    const top = Number(dotsStyle.match(/top:\s*(\d+(?:\.\d+)?)px/)?.[1]);

    expect(top).toBe(1184 + TEMPLATE_03_DOTS_OFFSET_Y);
    expect(top + 46).toBeLessThan(TEMPLATE_03_HEIGHT);
  });
});

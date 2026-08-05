import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Template02Slide from '@/components/slides/Template02Slide';
import SlidePreview from '@/components/editor/SlidePreview';
import { mapDbSlideToSlide, mapSlideToDbRow } from '@/lib/slide-mapper';
import {
  template02HeaderSlots,
  template02ModelAt,
  template02SlotsFromContent,
} from '@/lib/templates/template-02';
import { markTemplate02Override } from '@/lib/templates/template-02/overrides';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide } from '@/types';

/**
 * TEMPLATE 2 — o caminho inteiro fecha: wizard → banco → dashboard/editor.
 *
 * O que isto prova é que o carrossel gerado sobrevive à ida e volta do banco
 * DESENHANDO IGUAL. O ponto sensível é o `template_model`: se ele não for
 * gravado, o deck reabre derivando o modelo da posição, e basta o usuário ter
 * reordenado um slide para o desenho trocar sozinho.
 */

/** Um slide como o CreateWizard o monta para um deck gerado. */
function slideGerado(i: number): Slide {
  const model = template02ModelAt(i);
  return {
    ...DEFAULT_SLIDE,
    id: `s${i}`,
    position: i,
    templateModel: model,
    templateSlots: {
      ...template02SlotsFromContent(model, {
        title: `Título ${i}`,
        description: `Descrição do slide ${i}.`,
        extras: i === 0 ? { highlight: 'Título 0', cta: 'ARRASTA PRO LADO' } : undefined,
      }),
      ...template02HeaderSlots('Arke Studio', 'arkebranding'),
    },
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
  } as Slide;
}

function markup(slide: Slide, index: number): string {
  return renderToStaticMarkup(
    <Template02Slide
      slide={slide}
      globalSettings={DEFAULT_GLOBAL_SETTINGS}
      slideIndex={index}
      totalSlides={5}
    />
  );
}

describe('TEMPLATE 2 — ida e volta do banco', () => {
  it('o slide gerado desenha IGUAL depois de salvar e reabrir', () => {
    for (let i = 0; i < 5; i++) {
      const antes = slideGerado(i);
      const depois = mapDbSlideToSlide({
        ...mapSlideToDbRow(antes, 'c1', i),
        id: antes.id,
        position: i,
      });
      expect(depois.templateModel, `slide ${i}`).toBe(antes.templateModel);
      expect(markup(depois, i), `slide ${i}`).toBe(markup(antes, i));
    }
  });

  it('o `template_model` VAI para o banco — sem ele o modelo volta a sair da posição', () => {
    const capa = slideGerado(0);
    const row = mapSlideToDbRow(capa, 'c1', 0);
    expect(row.template_model).toBe(1);
    expect(row.template_slots).toBeTruthy();

    // A prova de que isso importa: a mesma capa na posição 4, SEM o modelo
    // gravado, viraria um slide de conteúdo.
    const semModelo = { ...capa, templateModel: undefined };
    expect(markup(semModelo, 4)).toContain('data-model="3"');
    expect(markup(capa, 4)).toContain('data-model="1"');
  });

  it('deck reordenado continua desenhando certo', () => {
    const deck = [0, 1, 2, 3, 4].map(slideGerado);
    // Usuário arrasta a capa para o fim.
    const reordenado = [...deck.slice(1), deck[0]];
    expect(markup(reordenado[4], 4)).toContain('data-model="1"');
    expect(markup(reordenado[0], 0)).toContain('data-model="2"');
  });

  it('as marcas de override sobrevivem à ida e volta', () => {
    const mexido = {
      ...slideGerado(1),
      backgroundColor: '#FF00FF',
      templateOverrides: markTemplate02Override(undefined, 'background'),
      templateSlotStyles: { 'content.title': { color: '#FF0000' } },
    } as Slide;
    const volta = mapDbSlideToSlide({ ...mapSlideToDbRow(mexido, 'c1', 1), id: 's1', position: 1 });
    expect(volta.templateOverrides).toEqual({ background: true });
    expect(volta.templateSlotStyles).toEqual({ 'content.title': { color: '#FF0000' } });
    expect(markup(volta, 1)).toBe(markup(mexido, 1));
  });

  it('o slide gerado NÃO tem marca de override nenhuma', () => {
    // A geração não escreve estilo — é o que mantém o deck idêntico ao spec.
    for (let i = 0; i < 5; i++) {
      expect(slideGerado(i).templateOverrides).toBeUndefined();
      expect(slideGerado(i).templateSlotStyles).toBeUndefined();
    }
  });
});

describe('TEMPLATE 2 — preview do editor e do dashboard', () => {
  it('o SlidePreview desenha o Template 2 quando o estilo é template02', () => {
    const html = renderToStaticMarkup(
      <SlidePreview
        slide={slideGerado(1)}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        style="template02"
        slideIndex={1}
        totalSlides={5}
      />
    );
    expect(html).toContain('t02-slide');
    expect(html).toContain('data-model="2"');
    expect(html).toContain('Título 1');
  });

  it('a capa aparece como miniatura, com o marcador desenhado', () => {
    // É o caminho do card do dashboard: o slide de capa vem do banco e é
    // renderizado com o mesmo componente.
    const capa = mapDbSlideToSlide({
      ...mapSlideToDbRow(slideGerado(0), 'c1', 0),
      id: 's0',
      position: 0,
    });
    const html = renderToStaticMarkup(
      <SlidePreview
        slide={capa}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        style="template02"
        slideIndex={0}
        totalSlides={5}
      />
    );
    expect(html).toContain('data-model="1"');
    expect(html).toContain('data-slot="cover.highlight"');
    expect(html).toContain('ARRASTA PRO LADO');
  });
});

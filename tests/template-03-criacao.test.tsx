import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import Template03Slide from '@/components/slides/Template03Slide';
import {
  TEMPLATE_03_DEFAULT_CORNERS,
  TEMPLATE_03_MODELS,
  TEMPLATE_03_MODEL_COVER,
  TEMPLATE_03_MODEL_STEP,
  TEMPLATE_03_PRIMARY_SLOTS,
  TEMPLATE_03_SPEC,
  Template03Slots,
  template03DefaultSlots,
  template03ModelAt,
  template03ModelOf,
  template03NewSlideSlots,
  template03Overflows,
  template03SlotsForModel,
  template03SlotsFromContent,
  template03TextSlotsForModel,
} from '@/lib/templates/template-03';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide } from '@/types';

/**
 * TEMPLATE 3 × CRIAÇÃO (fatia S4).
 *
 * Duas regras duras herdadas dos Templates 1 e 2, e a razão de cada uma:
 *
 * 1. **A geração não escreve estilo.** Foi o bug que apagou os degradês do T1: a
 *    paleta da marca do onboarding era gravada em todo slide, virava "escolha do
 *    usuário" por comparação de valor e pintava por cima do template.
 * 2. **Deck gerado não exibe copy do spec.** Todo slot de texto sai com o que a
 *    IA escreveu ou com string VAZIA — nunca com o texto do Figma. É a
 *    consequência direta de "chave ausente ⇒ texto de fábrica" (armadilha #8).
 */

/** O texto ilustrativo do Figma, lido do SPEC em vez de redigitado. */
const COPY_DO_SPEC: string[] = (() => {
  const out = new Set<string>();
  const sentinelasDeCriacao = new Set(Object.values(TEMPLATE_03_DEFAULT_CORNERS));
  for (const slide of TEMPLATE_03_SPEC.slides) {
    for (const node of slide.nodes) {
      const t = node.text?.characters;
      // O "....." dos dots não é copy: é o divisor, e o componente nem o lê.
      // Os cantos também têm texto no spec, mas o wizard injeta os marcadores
      // de criação (`TEMPLATE_03_DEFAULT_CORNERS`) deliberadamente.
      if (t && t.trim() && !/^\.+$/.test(t.trim()) && !sentinelasDeCriacao.has(t)) out.add(t);
    }
  }
  return [...out];
})();

const wizard = readFileSync('components/editor/CreateWizard.tsx', 'utf8');

function markup(model: number, slots: Template03Slots, position = 0): string {
  return renderToStaticMarkup(
    <Template03Slide
      slide={
        {
          ...DEFAULT_SLIDE,
          id: 's',
          position,
          templateModel: model,
          templateSlots: slots,
          backgroundImageUrl: '',
          gridImageUrl: '',
          contentImageUrl: '',
        } as Slide
      }
      globalSettings={DEFAULT_GLOBAL_SETTINGS}
      slideIndex={position}
      totalSlides={6}
    />
  );
}

/**
 * O que o wizard grava em cada slide de um deck gerado — a MESMA conta do
 * `editorSlides`, sem montar o componente inteiro do wizard.
 */
function slotsGerados(i: number, handle = '@rafael.dev'): Template03Slots {
  const model = template03ModelAt(i);
  return {
    ...template03SlotsFromContent(model, {
      title: `Ideia ${i} de verdade`,
      description: 'Descrição escrita pela IA para este slide.',
    }),
    ...TEMPLATE_03_DEFAULT_CORNERS,
    [`s${model}.handle`]: handle || TEMPLATE_03_DEFAULT_CORNERS['cantos.right'],
  };
}

// ── Armadilha #8 ────────────────────────────────────────────────

describe('TEMPLATE 3 — um deck gerado não deixa copy do Figma', () => {
  it('o spec realmente tem copy ilustrativa — senão o teste não prova nada', () => {
    expect(COPY_DO_SPEC).toContain('Lorem ipsum \ndolor sit amet.');
    expect(COPY_DO_SPEC).toContain('Passo 01 - \nContexto total');
    expect(COPY_DO_SPEC).toContain('@userinstagram');
  });

  it('nenhum texto de fábrica sobra num deck de 6 slides', () => {
    for (let i = 0; i < 6; i++) {
      const html = markup(template03ModelAt(i), slotsGerados(i), i);
      for (const copy of COPY_DO_SPEC) {
        // As quebras manuais viram texto puro no markup; comparo linha a linha.
        for (const linha of copy.split('\n')) {
          if (linha.trim().length < 4) continue;
          expect(html, `slide ${i} vazou "${linha}"`).not.toContain(linha.trim());
        }
      }
    }
  });

  /**
   * 🔴 A causa raiz: chave AUSENTE cai no texto do Figma. Por isso o wizard
   * escreve TODO slot de texto, mesmo em branco.
   */
  it('todo slot de texto do slide sai escrito, mesmo vazio', () => {
    for (const model of TEMPLATE_03_MODELS) {
      const slots = template03SlotsFromContent(model, { title: '', description: '' });
      for (const d of template03TextSlotsForModel(model)) {
        expect(Object.keys(slots), `${d.slot} tem de existir como chave`).toContain(d.slot);
        expect(slots[d.slot]).toBe('');
      }
    }
  });

  /**
   * O @ é de escopo `header` e NÃO passa por `template03SlotsFromContent` — se o
   * wizard não o escrevesse, a chave ficaria ausente e o slide sairia com
   * "@userinstagram" do Figma. Este é o slot que quase escapou.
   */
  it('o @ da barra de perfil é escrito pelo wizard, não herdado do Figma', () => {
    for (let i = 0; i < 3; i++) {
      const model = template03ModelAt(i);
      expect(slotsGerados(i)[`s${model}.handle`]).toBe('@rafael.dev');
      expect(markup(model, slotsGerados(i), i)).not.toContain('@userinstagram');
    }
    // Sem perfil no onboarding, cai no marcador — nunca no texto do Figma.
    const semPerfil = slotsGerados(0, '');
    expect(semPerfil['s1.handle']).toBe(TEMPLATE_03_DEFAULT_CORNERS['cantos.right']);
    expect(markup(TEMPLATE_03_MODEL_COVER, semPerfil)).not.toContain('@userinstagram');
  });

  it('o wizard escreve o handle — a linha existe de fato no CreateWizard', () => {
    expect(wizard).toContain('.handle`]:');
    expect(wizard).toContain('effectiveProfile.handle');
  });

  it('os cantos saem no marcador, não na copy do Figma', () => {
    const slots = slotsGerados(1);
    expect(slots['cantos.left']).toBe(TEMPLATE_03_DEFAULT_CORNERS['cantos.left']);
    expect(slots['cantos.right']).toBe(TEMPLATE_03_DEFAULT_CORNERS['cantos.right']);
  });

  it('o texto que a IA escreveu chega à tela', () => {
    const html = markup(TEMPLATE_03_MODEL_STEP, slotsGerados(2), 2);
    expect(html).toContain('Ideia 2 de verdade');
    expect(html).toContain('Descrição escrita pela IA para este slide.');
  });

  it('o conteúdo gerado cabe nos limites do spec', () => {
    for (let i = 0; i < 6; i++) {
      expect(template03Overflows(template03ModelAt(i), slotsGerados(i)), `slide ${i}`).toEqual([]);
    }
  });
});

// ── Modelo do deck gerado ───────────────────────────────────────

describe('TEMPLATE 3 — o modelo do deck gerado', () => {
  it('o primeiro slide nasce CAPA e todos os outros nascem CONTEÚDO', () => {
    expect(template03ModelAt(0)).toBe(TEMPLATE_03_MODEL_COVER);
    for (const i of [1, 2, 3, 4, 5, 9, 14]) {
      expect(template03ModelAt(i), `posição ${i}`).toBe(TEMPLATE_03_MODEL_STEP);
    }
  });

  it('o modelo é GRAVADO, não deixado para sair da posição', () => {
    // Reordenar não pode trocar o desenho: o slide leva o modelo consigo.
    const capaNaPosicao4 = { templateModel: TEMPLATE_03_MODEL_COVER };
    expect(template03ModelOf(capaNaPosicao4, 4)).toBe(TEMPLATE_03_MODEL_COVER);
  });

  it('todo modelo gravado cabe no CHECK do banco (1 a 6)', () => {
    // `slides.template_model` tem `check (template_model is null or between 1
    // and 6)`. Com 2 modelos o FlowLine passa folgado — mas o teste existe
    // porque um modelo fora da faixa derrubaria o INSERT no autosave, depois de
    // o usuário já ter editado.
    for (let i = 0; i < 20; i++) {
      const m = template03ModelAt(i);
      expect(m).toBeGreaterThanOrEqual(1);
      expect(m).toBeLessThanOrEqual(6);
    }
  });

  it('o par primário de cada modelo é título + corpo', () => {
    for (const model of TEMPLATE_03_MODELS) {
      expect(TEMPLATE_03_PRIMARY_SLOTS[model]).toEqual({
        title: `s${model}.title`,
        body: `s${model}.body`,
      });
    }
  });
});

// ── As duas listas do wizard ────────────────────────────────────

describe('TEMPLATE 3 — editorSlides e slidesPayload concordam', () => {
  /**
   * 🔴 O teste que o TEMPLATE 1 não tem (armadilha #4).
   *
   * O `slidesPayload` do T1 termina em `template_slots` e NÃO grava
   * `template_model`: deck dele reabre derivando o modelo da POSIÇÃO, e
   * reordenar um slide troca o desenho. É bug real e é outra task — aqui o que
   * importa é não repetir o defeito num template que está nascendo.
   */
  it('a linha do banco do T3 carrega template_model', () => {
    const bloco = wizard.slice(wizard.indexOf('if (isT03) {', wizard.indexOf('slidesPayload')));
    const corpo = bloco.slice(0, bloco.indexOf('};'));
    expect(corpo).toContain('template_slots: editor.templateSlots');
    expect(corpo).toContain('template_model: editor.templateModel');
  });

  it('as duas listas do T3 saem do MESMO objeto', () => {
    // O payload lê `editorSlides[i]`, em vez de remontar os slots à mão — é o
    // que impede as duas listas de divergirem com o tempo.
    const bloco = wizard.slice(wizard.indexOf('if (isT03) {', wizard.indexOf('slidesPayload')));
    expect(bloco.slice(0, 300)).toContain('const editor = editorSlides[i]');
  });

  it('o defeito do T1 continua lá, e não foi copiado — é achado, não escopo', () => {
    const t1 = wizard.slice(wizard.indexOf("if (style === 'template01') {", wizard.indexOf('slidesPayload')));
    const corpoT1 = t1.slice(0, t1.indexOf('};'));
    // Se um dia isto passar a conter `template_model`, o T1 foi consertado e
    // este teste deve morrer junto com a TASK 10.
    expect(corpoT1).toContain('template_model: editor.templateModel');
  });

  it('a geração NÃO escreve estilo nem override', () => {
    const bloco = wizard.slice(wizard.indexOf('if (isT03) {'));
    const corpo = bloco.slice(0, bloco.indexOf('return ({'));
    expect(corpo).toContain('backgroundColor: DEFAULT_SLIDE.backgroundColor');
    // 🔴 `templateOverrides` NÃO aparece: ele tem de nascer AUSENTE.
    expect(corpo).not.toContain('templateOverrides');
  });
});

// ── O card e o preview ──────────────────────────────────────────

describe('TEMPLATE 3 — o wizard', () => {
  it('o card do FlowLine está na lista de templates', () => {
    expect(wizard).toContain("value: 'template03'");
    expect(wizard).toContain("label: 'FlowLine'");
    expect(wizard).toContain("short: 'Deck aberto: capa e conteúdo independente'");
    expect(wizard).toContain(
      'Forma fixa do Figma, deck aberto: capa e slides de conteúdo independentes.'
    );
  });

  it('o preview 4:5 aponta para o arquivo que existe', () => {
    expect(wizard).toContain("'4:5': '/templates/preview-template03-4x5.webp'");
    const asset = readFileSync('public/templates/preview-template03-4x5.webp');
    // WebP de verdade, e dentro do teto de 120KB do gate do plano.
    expect(asset.subarray(0, 4).toString()).toBe('RIFF');
    expect(asset.subarray(8, 12).toString()).toBe('WEBP');
    expect(asset.byteLength).toBeLessThan(120 * 1024);
  });

  it('1:1 e 9:16 ficam null — caem na miniatura viva, como previsto', () => {
    const bloco = wizard.slice(wizard.indexOf('template03: {'));
    const corpo = bloco.slice(0, bloco.indexOf('},'));
    expect(corpo).toContain("'1:1': null");
    expect(corpo).toContain("'9:16': null");
  });

  it('o FlowLine é template de SPEC: pula o passo de identidade visual', () => {
    expect(wizard).toMatch(/const SKIP_VISUAL_STEP[\s\S]*?= \[[^\]]*'template03'\]/);
    expect(wizard).toMatch(/const FIXED_VISUAL_STYLES[\s\S]*?= \[[^\]]*'template03'\]/);
    expect(wizard).toMatch(/isSpecTemplate[\s\S]{0,200}'template03'/);
  });

  /**
   * DECK ABERTO: o slider continua, e `isFixedDeck` é só do Template 1 — o único
   * com número de slides travado.
   */
  it('o deck é ABERTO: o FlowLine não entra em isFixedDeck', () => {
    expect(wizard).toMatch(/const isFixedDeck = style === 'template01';/);
    const linha = wizard.slice(wizard.indexOf('const isFixedDeck'));
    expect(linha.slice(0, 80)).not.toContain('template03');
  });

  it('a capa de exemplo do card não leva slots — mostra o desenho do Figma', () => {
    const bloco = wizard.slice(wizard.indexOf('function previewSlide'));
    expect(bloco.slice(0, 400)).toContain("style === 'template03'");
    // Sem `templateSlots`, o slide cai no conteúdo original do spec, que é
    // literalmente a capa do template.
    const html = renderToStaticMarkup(
      <Template03Slide
        slide={{ ...DEFAULT_SLIDE, id: 'thumb', position: 0, templateModel: 1 } as Slide}
        globalSettings={DEFAULT_GLOBAL_SETTINGS}
        slideIndex={0}
        totalSlides={4}
      />
    );
    expect(html).toContain('dolor sit amet.');
  });

  it('os campos do passo de conteúdo saem do MODELO daquela posição', () => {
    // Deck aberto: a posição 9 pede os mesmos campos da posição 1.
    const um = template03TextSlotsForModel(template03ModelAt(1)).map((d) => d.slot);
    const nove = template03TextSlotsForModel(template03ModelAt(9)).map((d) => d.slot);
    expect(nove).toEqual(um);
    expect(um).toEqual(['s2.title', 's2.body']);
  });
});

// ── Adicionar slide num deck aberto ─────────────────────────────

describe('TEMPLATE 3 — adicionar slide continua funcionando', () => {
  it('o slide novo nasce com os slots do modelo e sem copy do Figma', () => {
    for (const model of TEMPLATE_03_MODELS) {
      const slots = template03NewSlideSlots(model);
      const fabrica = Object.values(template03DefaultSlots(model));
      for (const d of template03TextSlotsForModel(model)) {
        expect(slots[d.slot], d.slot).toBeTruthy();
        expect(fabrica).not.toContain(slots[d.slot]);
      }
      expect(template03Overflows(model, slots)).toEqual([]);
    }
  });

  it('um deck de 12 slides desenha todos, sem chave fora do jogo', () => {
    const permitidas = new Set(
      TEMPLATE_03_MODELS.flatMap((m) => template03SlotsForModel(m).map((d) => d.slot))
    );
    for (let i = 0; i < 12; i++) {
      const model = template03ModelAt(i);
      for (const chave of Object.keys(slotsGerados(i))) {
        expect(permitidas.has(chave), `slide ${i}: ${chave}`).toBe(true);
      }
      expect(markup(model, slotsGerados(i), i)).toContain('t03-slide');
    }
  });
});

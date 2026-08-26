import { describe, it, expect } from 'vitest';
import specJson from '@/lib/templates/template-03/spec.json';
import {
  TEMPLATE_03_DEFAULT_CORNERS,
  TEMPLATE_03_DESIGN_TWEAKS,
  TEMPLATE_03_HEIGHT,
  TEMPLATE_03_MODELS,
  TEMPLATE_03_MODEL_COVER,
  TEMPLATE_03_MODEL_STEP,
  TEMPLATE_03_PALETTE,
  TEMPLATE_03_SLOTS,
  TEMPLATE_03_SPEC,
  TEMPLATE_03_STEP_TITULO_Y,
  TEMPLATE_03_TITULO_Y_COVER,
  TEMPLATE_03_WIDTH,
  Template03Slots,
  isTemplate03Model,
  template03AvatarSlot,
  template03DefaultSlots,
  template03ImageSlot,
  template03Measure,
  template03ModelAt,
  template03ModelOf,
  template03NewSlideSlots,
  template03NextModel,
  template03NormalizeSlot,
  template03Overflows,
  template03SlotColor,
  template03SlotDefaults,
  template03SlotFontName,
  template03SlotLabel,
  template03SlotName,
  template03SlotsForModel,
  template03SlotsFromContent,
  template03StepIndex,
  template03TextSlotsForModel,
  template03TituloY,
} from '@/lib/templates/template-03';

/**
 * TEMPLATE 3 — "FlowLine", fatia S1 (fundação).
 *
 * O `spec.json` é a fonte da verdade da forma. Estes testes travam o contrato do
 * módulo: se alguém redigitar um limite, perder um slot, fazer o modelo voltar a
 * sair da posição ou — o pior — deixar a chave do slot escapar por SLIDE em vez
 * de por MODELO, o carrossel muda e ninguém percebe olhando o diff.
 *
 * Ainda NÃO cobre render, barra lateral, wizard nem banco: são as fatias S2–S6
 * de `docs/tarefas/template-03-flowline-plano.md` §2.
 */

/** Acesso cru ao JSON, para provar que o módulo LÊ o spec e não o redigita. */
const raw = specJson as unknown as {
  template: { id: string; figmaFileName: string };
  slides: {
    index: number;
    background: { css?: string; angleDeg?: number }[];
    backgroundLayers?: { type: string; slot?: string }[];
    nodes: {
      slot?: string;
      type: string;
      box: { y: number };
      text?: { characters: string };
      typography?: { fontSizePx: number; letterSpacingEm: number; fontFamily: string };
      fills?: { css?: string }[];
    }[];
  }[];
  slotIndex: Record<
    string,
    { role: string; editable: boolean; maxLines?: number; maxCharsPerLine?: number }
  >;
  designSystem: {
    canvas: { w: number; h: number };
    dynamicPattern: { tituloY: Record<string, number> };
    palette: Record<string, string>;
  };
};

describe('Template 3 — o spec é LIDO, não redigitado', () => {
  it('as dimensões saem do spec', () => {
    expect(TEMPLATE_03_WIDTH).toBe(raw.designSystem.canvas.w);
    expect(TEMPLATE_03_HEIGHT).toBe(raw.designSystem.canvas.h);
    // O valor certo é 1080x1350; se o spec mudar, é o spec que manda.
    expect([TEMPLATE_03_WIDTH, TEMPLATE_03_HEIGHT]).toEqual([1080, 1350]);
  });

  it('a paleta sai do spec', () => {
    expect(TEMPLATE_03_PALETTE).toEqual(raw.designSystem.palette);
  });

  /**
   * O teste que impede a cópia à mão: cada limite do descritor tem de ser o
   * MESMO OBJETO de valor que está no `slotIndex`. Redigitar 22 como 23 passa
   * despercebido numa revisão; aqui não.
   */
  it('os limites de cada slot vêm do slotIndex do spec, slot a slot', () => {
    const casos: [number, string, string][] = [
      [TEMPLATE_03_MODEL_COVER, 's1.title', 's1.title'],
      [TEMPLATE_03_MODEL_COVER, 's1.body', 's1.body'],
      [TEMPLATE_03_MODEL_COVER, 's1.handle', 's1.handle'],
      [TEMPLATE_03_MODEL_STEP, 's2.title', 's2.title'],
      [TEMPLATE_03_MODEL_STEP, 's2.body', 's2.body'],
      [TEMPLATE_03_MODEL_STEP, 's2.handle', 's2.handle'],
      [TEMPLATE_03_MODEL_COVER, 'cantos.left', 'cantos.left'],
      [TEMPLATE_03_MODEL_COVER, 'cantos.right', 'cantos.right'],
    ];
    for (const [model, slot, specKey] of casos) {
      const d = template03SlotsForModel(model).find((x) => x.slot === slot);
      expect(d, `${slot} deveria ter descritor no modelo ${model}`).toBeDefined();
      expect(d!.maxLines).toBe(raw.slotIndex[specKey].maxLines);
      expect(d!.maxCharsPerLine).toBe(raw.slotIndex[specKey].maxCharsPerLine);
    }
  });

  /**
   * Plano §1.6: o modelo "passo" adota os limites do `s2.*` — o mais apertado
   * dos três passos do Figma —, para o texto caber em qualquer altura do ciclo
   * de `tituloY`. Se alguém trocar o slide de referência do passo para o 3 ou o
   * 4, os limites afrouxam calados e o título estoura no passo mais baixo.
   */
  it('o passo usa os limites do s2 — os mais apertados dos três passos do spec', () => {
    const title = template03SlotsForModel(TEMPLATE_03_MODEL_STEP).find((d) => d.slot === 's2.title');
    const body = template03SlotsForModel(TEMPLATE_03_MODEL_STEP).find((d) => d.slot === 's2.body');
    const passos = ['s2', 's3', 's4'];
    const menorTitulo = Math.min(...passos.map((p) => raw.slotIndex[`${p}.title`].maxCharsPerLine!));
    const menorCorpo = Math.min(...passos.map((p) => raw.slotIndex[`${p}.body`].maxCharsPerLine!));
    expect(title!.maxCharsPerLine).toBe(menorTitulo);
    expect(body!.maxCharsPerLine).toBe(menorCorpo);
  });

  it('a tipografia de fábrica e a cor de cada slot saem do nó do spec', () => {
    const node = raw.slides[1].nodes.find((n) => n.slot === 's2.title')!;
    expect(template03SlotDefaults('s2.title', TEMPLATE_03_MODEL_STEP)).toEqual({
      fontSizePx: node.typography!.fontSizePx,
      letterSpacingEm: node.typography!.letterSpacingEm,
    });
    expect(template03SlotColor('s2.title', TEMPLATE_03_MODEL_STEP)).toBe(node.fills![0].css);
  });

  /**
   * O corpo é cinza na capa e branco no passo; os cantos são brancos na capa e
   * `#767682` no passo. A cor DEPENDE do modelo — o seletor tem de abrir com o
   * que está na tela daquele slide, não com um padrão único.
   */
  it('a cor de fábrica muda com o modelo', () => {
    expect(template03SlotColor('s1.body', TEMPLATE_03_MODEL_COVER)).toBe(
      TEMPLATE_03_PALETTE.cinza_corpo
    );
    expect(template03SlotColor('s2.body', TEMPLATE_03_MODEL_STEP)).toBe(TEMPLATE_03_PALETTE.branco);
    expect(template03SlotColor('cantos.left', TEMPLATE_03_MODEL_COVER)).toBe(
      TEMPLATE_03_PALETTE.branco
    );
    expect(template03SlotColor('cantos.left', TEMPLATE_03_MODEL_STEP)).toBe(
      TEMPLATE_03_PALETTE.cinza_cantos
    );
  });

  it('a face de cada slot sai do spec, com a serifada substituída', () => {
    expect(template03SlotFontName('s1.title', TEMPLATE_03_MODEL_COVER)).toBe('Inter Bold');
    expect(template03SlotFontName('s1.body', TEMPLATE_03_MODEL_COVER)).toBe(
      'Inter Display Regular'
    );
    expect(template03SlotFontName('s2.handle', TEMPLATE_03_MODEL_STEP)).toBe(
      'Inter Display Medium'
    );
  });

  /** O texto de fábrica é o do Figma, caractere a caractere. */
  it('o defaultValue de cada slot de texto é o `characters` do nó', () => {
    for (const model of TEMPLATE_03_MODELS) {
      for (const d of template03SlotsForModel(model)) {
        if (d.kind !== 'text') continue;
        const specSlot = d.slot.startsWith('cantos.')
          ? d.slot
          : `s${model}.${template03SlotName(d.slot)}`;
        const node = raw.slides
          .find((s) => s.index === model)!
          .nodes.find((n) => n.slot === specSlot)!;
        expect(d.defaultValue).toBe(node.text!.characters);
      }
    }
  });

  /**
   * O spec traz `template.id: "template-01"` — bug de cópia do extract. Ele
   * entrou VERBATIM e continua errado no arquivo; a defesa é o módulo nunca
   * lê-lo. Este teste é a prova de que a defesa existe e está declarada.
   */
  it('o `template.id` errado do spec está registrado e não é lido por ninguém', () => {
    expect(raw.template.id).toBe('template-01');
    expect(raw.template.figmaFileName).toBe('TEMPLATE 3');
    expect(TEMPLATE_03_DESIGN_TWEAKS.templateId.spec).toBe('template-01');
    expect(TEMPLATE_03_DESIGN_TWEAKS.templateId.aqui).toBe('template03');
    // As dimensões — a única coisa que `template.canvas` também traz — saem do
    // `designSystem`, justamente para não haver leitura desse bloco.
    expect(TEMPLATE_03_WIDTH).toBe(raw.designSystem.canvas.w);
  });

  /** Os desvios do gabarito estão declarados, com o valor original ao lado. */
  it('todo desvio tem o valor do spec e um motivo registrados', () => {
    for (const [nome, tweak] of Object.entries(TEMPLATE_03_DESIGN_TWEAKS)) {
      const t = tweak as Record<string, unknown>;
      expect(t.spec ?? t.documento, `${nome} sem o valor original`).toBeDefined();
      expect(typeof t.motivo, `${nome} sem motivo`).toBe('string');
      expect((t.motivo as string).length).toBeGreaterThan(20);
    }
  });

  /**
   * `REFERENCIA-SLOTS.md` do material lista `sN.divider`, que não existe. A
   * verdade é o spec. Se um dia o slot aparecer no `slotIndex`, este teste cai e
   * alguém revisa a decisão em vez de descobrir por um campo fantasma na barra.
   */
  it('`sN.divider` não existe no spec — quem existe é `sN.dots`', () => {
    expect(Object.keys(raw.slotIndex).some((k) => k.endsWith('.divider'))).toBe(false);
    expect(raw.slotIndex['s1.dots']).toBeDefined();
    expect(raw.slotIndex['s1.image']).toBeDefined();
  });
});

describe('Template 3 — os modelos saem do spec', () => {
  it('TEMPLATE_03_MODELS são os dois primeiros slides do spec, não um literal', () => {
    expect(TEMPLATE_03_MODELS).toEqual([raw.slides[0].index, raw.slides[1].index]);
    expect(TEMPLATE_03_MODEL_COVER).toBe(raw.slides[0].index);
    expect(TEMPLATE_03_MODEL_STEP).toBe(raw.slides[1].index);
  });

  /**
   * Os slides 3 e 4 do spec são conferência da forma do passo, não modelos. Se
   * virarem modelo, o deck ganha formas que não existem e o CHECK do banco
   * (`template_model between 1 and 6`) passa a receber números sem desenho.
   */
  it('os slides 3 e 4 do spec NÃO são modelos', () => {
    expect(raw.slides.map((s) => s.index)).toEqual([1, 2, 3, 4]);
    expect(TEMPLATE_03_MODELS).toHaveLength(2);
    expect(isTemplate03Model(3)).toBe(false);
    expect(isTemplate03Model(4)).toBe(false);
  });

  it('a forma do passo é UMA só: os slides 3 e 4 repetem os nós do slide 2', () => {
    const nomes = (i: number) =>
      raw.slides
        .find((s) => s.index === i)!
        .nodes.filter((n) => n.type !== 'GROUP')
        .map((n) => template03SlotName(n.slot ?? ''))
        .sort();
    expect(nomes(3)).toEqual(nomes(2));
    expect(nomes(4)).toEqual(nomes(2));
  });

  it('o modelo é dado do slide, não a posição', () => {
    // Passo gravado na posição 0: continua passo.
    expect(template03ModelOf({ templateModel: TEMPLATE_03_MODEL_STEP }, 0)).toBe(
      TEMPLATE_03_MODEL_STEP
    );
    // Capa gravada na posição 7: continua capa.
    expect(template03ModelOf({ templateModel: TEMPLATE_03_MODEL_COVER }, 7)).toBe(
      TEMPLATE_03_MODEL_COVER
    );
  });

  it('sem `templateModel` o modelo volta a sair da posição — compatibilidade', () => {
    expect(template03ModelOf(undefined, 0)).toBe(TEMPLATE_03_MODEL_COVER);
    expect(template03ModelOf({}, 0)).toBe(TEMPLATE_03_MODEL_COVER);
    expect(template03ModelOf({}, 1)).toBe(TEMPLATE_03_MODEL_STEP);
    expect(template03ModelOf({}, 30)).toBe(TEMPLATE_03_MODEL_STEP);
  });

  it('modelo inválido cai no fallback sem lançar', () => {
    expect(template03ModelOf({ templateModel: 9 }, 3)).toBe(TEMPLATE_03_MODEL_STEP);
    expect(template03ModelOf({ templateModel: 0 }, 0)).toBe(TEMPLATE_03_MODEL_COVER);
    expect(() => template03SlotsForModel(99)).not.toThrow();
    expect(template03ImageSlot(99)).toBe(`s${TEMPLATE_03_MODEL_COVER}.image`);
  });

  /** Deck ABERTO: a posição 0 é capa e TODA posição seguinte é passo. */
  it('template03ModelAt: capa na 0, passo em qualquer outra posição', () => {
    expect(template03ModelAt(0)).toBe(TEMPLATE_03_MODEL_COVER);
    for (const p of [1, 2, 3, 4, 5, 12, 40]) {
      expect(template03ModelAt(p)).toBe(TEMPLATE_03_MODEL_STEP);
    }
    expect(template03ModelAt(-3)).toBe(TEMPLATE_03_MODEL_COVER);
  });

  it('o próximo modelo é sempre o passo — a capa é única', () => {
    expect(template03NextModel(TEMPLATE_03_MODEL_COVER)).toBe(TEMPLATE_03_MODEL_STEP);
    expect(template03NextModel(TEMPLATE_03_MODEL_STEP)).toBe(TEMPLATE_03_MODEL_STEP);
  });
});

describe('Template 3 — o `tituloY` cicla', () => {
  it('as alturas saem de `designSystem.dynamicPattern`', () => {
    const { tituloY } = raw.designSystem.dynamicPattern;
    expect(TEMPLATE_03_TITULO_Y_COVER).toBe(tituloY.slide1);
    expect(TEMPLATE_03_STEP_TITULO_Y).toEqual([tituloY.slide2, tituloY.slide3, tituloY.slide4]);
  });

  it('os três primeiros passos seguem a tabela do spec', () => {
    expect(template03TituloY(0)).toBe(raw.designSystem.dynamicPattern.tituloY.slide2);
    expect(template03TituloY(1)).toBe(raw.designSystem.dynamicPattern.tituloY.slide3);
    expect(template03TituloY(2)).toBe(raw.designSystem.dynamicPattern.tituloY.slide4);
  });

  /**
   * O passo 4 volta ao topo do ciclo. Continuar somando levaria o título a 965 e
   * o bloco inteiro passaria dos 1350 do canvas — ver
   * `TEMPLATE_03_DESIGN_TWEAKS.tituloYCiclico`.
   */
  it('o quarto passo volta ao início e nenhum `y` estoura o canvas', () => {
    expect(template03TituloY(3)).toBe(template03TituloY(0));
    expect(template03TituloY(4)).toBe(template03TituloY(1));
    for (let i = 0; i < 40; i++) {
      expect(template03TituloY(i)).toBeLessThanOrEqual(Math.max(...TEMPLATE_03_STEP_TITULO_Y));
      expect(template03TituloY(i)).toBeLessThan(TEMPLATE_03_HEIGHT);
    }
  });

  it('o índice do passo conta a partir da posição 1 — a capa não é passo', () => {
    expect(template03StepIndex(1)).toBe(0);
    expect(template03StepIndex(2)).toBe(1);
    expect(template03StepIndex(0)).toBe(0);
  });
});

describe('Template 3 — a chave do slot é por MODELO, não por slide', () => {
  /**
   * 🔴 O teste mais importante da fatia. A chave é irrevogável depois do
   * primeiro deck salvo: se ela escapar por slide, o slide 9 de um deck aberto
   * grava `s9.title`, que não tem descritor, não tem barra lateral, não é
   * renderizado e fica órfão no jsonb do usuário para sempre.
   */
  it('todo passo grava `s2.*`, em QUALQUER posição', () => {
    for (const position of [1, 2, 3, 4, 5, 9, 17]) {
      const model = template03ModelAt(position);
      const slots = template03SlotsFromContent(model, {
        title: `Passo ${position}`,
        description: 'corpo',
      });
      expect(Object.keys(slots).sort()).toEqual(['s2.body', 's2.title']);
    }
  });

  it('a capa grava `s1.*`', () => {
    const slots = template03SlotsFromContent(TEMPLATE_03_MODEL_COVER, {
      title: 'Capa',
      description: 'apoio',
    });
    expect(Object.keys(slots).sort()).toEqual(['s1.body', 's1.title']);
  });

  it('template03NormalizeSlot traduz os slots de s3/s4 para o modelo do passo', () => {
    expect(template03NormalizeSlot('s3.title', TEMPLATE_03_MODEL_STEP)).toBe('s2.title');
    expect(template03NormalizeSlot('s4.body', TEMPLATE_03_MODEL_STEP)).toBe('s2.body');
    expect(template03NormalizeSlot('s3.handle', TEMPLATE_03_MODEL_STEP)).toBe('s2.handle');
    expect(template03NormalizeSlot('s4.image', TEMPLATE_03_MODEL_STEP)).toBe('s2.image');
    expect(template03NormalizeSlot('s1.title', TEMPLATE_03_MODEL_COVER)).toBe('s1.title');
  });

  it('os cantos são globais no spec e continuam globais — sem prefixo de modelo', () => {
    for (const model of TEMPLATE_03_MODELS) {
      expect(template03NormalizeSlot('cantos.left', model)).toBe('cantos.left');
      expect(template03NormalizeSlot('cantos.right', model)).toBe('cantos.right');
      const slots = template03SlotsForModel(model).map((d) => d.slot);
      expect(slots).toContain('cantos.left');
      expect(slots).toContain('cantos.right');
    }
    // E o spec já os traz repetidos com a MESMA chave em todos os slides.
    for (const slide of raw.slides) {
      expect(slide.nodes.some((n) => n.slot === 'cantos.left')).toBe(true);
    }
  });

  it('nenhuma chave gravada usa `s3.` ou `s4.`', () => {
    expect(TEMPLATE_03_SLOTS.some((s) => /^s[34]\./.test(s))).toBe(false);
    const gravadas = new Set<string>();
    for (const model of TEMPLATE_03_MODELS) {
      for (const d of template03SlotsForModel(model)) gravadas.add(d.slot);
      for (const k of Object.keys(template03NewSlideSlots(model))) gravadas.add(k);
      for (const k of Object.keys(template03DefaultSlots(model))) gravadas.add(k);
      gravadas.add(template03ImageSlot(model));
      gravadas.add(template03AvatarSlot(model));
    }
    for (const k of gravadas) {
      expect(/^s[34]\./.test(k), `${k} usa prefixo de slide, não de modelo`).toBe(false);
      expect(/^s[12]\.|^cantos\./.test(k), `${k} não é chave de modelo nem global`).toBe(true);
    }
  });

  /** O jogo de chaves é fechado: exatamente estes, e mais nenhum. */
  it('TEMPLATE_03_SLOTS é o conjunto fechado das chaves do template', () => {
    expect([...TEMPLATE_03_SLOTS].sort()).toEqual([
      'cantos.left',
      'cantos.right',
      's1.avatar',
      's1.body',
      's1.handle',
      's1.image',
      's1.title',
      's2.avatar',
      's2.body',
      's2.handle',
      's2.image',
      's2.title',
    ]);
  });
});

describe('Template 3 — todo slot tem descritor completo', () => {
  it('cada descritor traz kind, label e defaultValue', () => {
    for (const model of TEMPLATE_03_MODELS) {
      const ds = template03SlotsForModel(model);
      expect(ds.length).toBeGreaterThan(0);
      for (const d of ds) {
        expect(['text', 'image']).toContain(d.kind);
        expect(typeof d.label).toBe('string');
        expect(d.label.length).toBeGreaterThan(0);
        // O rótulo é interface: não pode ser a chave técnica vazando na tela.
        expect(d.label).not.toBe(d.slot);
        expect(typeof d.defaultValue).toBe('string');
        expect(['slide', 'header', 'global']).toContain(d.scope);
      }
    }
  });

  it('slot de imagem nasce com defaultValue vazio', () => {
    for (const model of TEMPLATE_03_MODELS) {
      for (const d of template03SlotsForModel(model)) {
        if (d.kind === 'image') expect(d.defaultValue).toBe('');
      }
    }
  });

  it('a imagem de fundo e o avatar são slots de imagem nos dois modelos', () => {
    for (const model of TEMPLATE_03_MODELS) {
      const ds = template03SlotsForModel(model);
      const img = ds.find((d) => d.slot === template03ImageSlot(model));
      const avatar = ds.find((d) => d.slot === template03AvatarSlot(model));
      expect(img?.kind).toBe('image');
      expect(avatar?.kind).toBe('image');
      // O fundo vem de `backgroundLayers`, não de um nó — e o spec o declara.
      const layers = raw.slides.find((s) => s.index === model)!.backgroundLayers ?? [];
      expect(layers.some((l) => l.type === 'IMAGE_SLOT' && l.slot === `s${model}.image`)).toBe(true);
    }
  });

  /**
   * Todo modelo do FlowLine tem imagem: não existe o caso "modelo sem imagem" do
   * Template 1, onde gerar por IA cobrava crédito e não pintava nada.
   */
  it('nenhum modelo fica sem slot de imagem', () => {
    for (const model of TEMPLATE_03_MODELS) {
      expect(TEMPLATE_03_SLOTS).toContain(template03ImageSlot(model));
    }
  });

  it('dots e badge NÃO são slots de conteúdo', () => {
    for (const model of TEMPLATE_03_MODELS) {
      const slots = template03SlotsForModel(model).map((d) => d.slot);
      expect(slots.some((s) => s.endsWith('.dots'))).toBe(false);
      expect(slots.some((s) => s.endsWith('.badge'))).toBe(false);
    }
    // Mas eles EXISTEM no spec — é decisão nossa deixá-los de fora, registrada.
    expect(raw.slotIndex['s1.dots']).toBeDefined();
    expect(raw.slotIndex['s1.badge']).toBeDefined();
    expect(TEMPLATE_03_DESIGN_TWEAKS.dotsCalculados.motivo).toContain('Deck aberto');
    expect(TEMPLATE_03_DESIGN_TWEAKS.badgeDesenhado.aqui).toContain(
      TEMPLATE_03_PALETTE.azul_badge
    );
  });

  /** A barra lateral segue a ordem VISUAL, não a ordem dos nós no Figma. */
  it('os descritores saem ordenados pelo `y` do spec', () => {
    for (const model of TEMPLATE_03_MODELS) {
      const ys = template03SlotsForModel(model).map((d) => d.y);
      expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    }
    // Na capa o título (y=702) vem depois do @ (y=636), como está na tela.
    const capa = template03SlotsForModel(TEMPLATE_03_MODEL_COVER).map((d) => d.slot);
    expect(capa.indexOf('s1.handle')).toBeLessThan(capa.indexOf('s1.title'));
    expect(capa.indexOf('s1.title')).toBeLessThan(capa.indexOf('s1.body'));
  });

  it('o rótulo é o mesmo vocabulário dos outros templates', () => {
    expect(template03SlotLabel('s1.title')).toBe('Título');
    expect(template03SlotLabel('s2.body')).toBe('Descrição');
    expect(template03SlotLabel('cantos.left')).toBe('Canto esquerdo');
  });
});

describe('Template 3 — conteúdo de fábrica e slide novo', () => {
  it('os slots de fábrica são o texto do Figma', () => {
    const capa = template03DefaultSlots(TEMPLATE_03_MODEL_COVER);
    expect(capa['s1.title']).toBe('Lorem ipsum \ndolor sit amet.');
    const passo = template03DefaultSlots(TEMPLATE_03_MODEL_STEP);
    expect(passo['s2.title']).toBe('Passo 01 - \nContexto total');
  });

  /**
   * Um deck GERADO não pode exibir copy ilustrativa do Figma: todo slot de texto
   * do slide sai preenchido, com o que a IA escreveu ou com vazio de verdade.
   */
  it('um slide gerado não deixa nenhum texto de fábrica do spec', () => {
    const fabrica = new Set(
      TEMPLATE_03_MODELS.flatMap((m) => Object.values(template03DefaultSlots(m)))
    );
    for (const model of TEMPLATE_03_MODELS) {
      const slots = template03SlotsFromContent(model, {
        title: 'Título de verdade',
        description: 'Descrição de verdade',
      });
      for (const d of template03TextSlotsForModel(model)) {
        expect(Object.keys(slots), `${d.slot} tem de ser escrito`).toContain(d.slot);
      }
      for (const v of Object.values(slots)) expect(fabrica.has(v)).toBe(false);
    }
  });

  it('slot presente e vazio é vazio de verdade, não o texto de fábrica', () => {
    const slots = template03SlotsFromContent(TEMPLATE_03_MODEL_STEP, {
      title: 'Só o título',
      description: '',
    });
    expect(slots['s2.body']).toBe('');
    expect(slots['s2.body']).not.toBe(template03DefaultSlots(TEMPLATE_03_MODEL_STEP)['s2.body']);
  });

  it('a imagem gerada cai no slot do MODELO', () => {
    const slots = template03SlotsFromContent(TEMPLATE_03_MODEL_STEP, {
      title: 't',
      description: 'd',
      imageUrl: 'https://exemplo/foto.jpg',
    });
    expect(slots['s2.image']).toBe('https://exemplo/foto.jpg');
  });

  it('um slide novo nasce com lorem dentro dos limites e cantos próprios', () => {
    for (const model of TEMPLATE_03_MODELS) {
      const slots = template03NewSlideSlots(model);
      expect(slots['cantos.left']).toBe(TEMPLATE_03_DEFAULT_CORNERS['cantos.left']);
      expect(slots['cantos.right']).toBe(TEMPLATE_03_DEFAULT_CORNERS['cantos.right']);
      // Nenhum texto do Figma sobra no CONTEÚDO do slide.
      //
      // Os cantos ficam de fora da regra de propósito: o texto de fábrica deles
      // no spec já é "LOREM IPSUM"/"@LOREM IPSUM" — marcador, não copy
      // ilustrativa de outra marca. É o mesmo tratamento do Template 1
      // (TEMPLATE_01_DEFAULT_CORNERS).
      const fabrica = Object.values(template03DefaultSlots(model));
      for (const d of template03TextSlotsForModel(model)) {
        expect(fabrica).not.toContain(slots[d.slot]);
      }
      // E o contador da barra lateral nasce no verde.
      expect(template03Overflows(model, slots)).toEqual([]);
    }
  });
});

describe('Template 3 — medição contra os limites do spec', () => {
  it('conta por linha escrita quando há quebra manual', () => {
    const limites = { maxLines: 3, maxCharsPerLine: 22 };
    expect(template03Measure('curto\ncurto', limites).over).toBe(false);
    expect(template03Measure('a\nb\nc\nd', limites).over).toBe(true);
    expect(template03Measure(`${'x'.repeat(23)}\nb`, limites).over).toBe(true);
  });

  it('linha única cai no orçamento total, para o texto do Figma não acusar estouro', () => {
    const limites = { maxLines: 3, maxCharsPerLine: 22 };
    const m = template03Measure('x'.repeat(60), limites);
    expect(m.charBudget).toBe(66);
    expect(m.over).toBe(false);
  });

  it('o conteúdo de fábrica nunca é acusado de estouro', () => {
    for (const model of TEMPLATE_03_MODELS) {
      expect(template03Overflows(model, template03DefaultSlots(model))).toEqual([]);
    }
  });

  it('texto acima do limite do spec é acusado, com o limite do spec junto', () => {
    const slots: Template03Slots = { 's2.title': `${'x'.repeat(40)}\n${'y'.repeat(40)}` };
    const [over] = template03Overflows(TEMPLATE_03_MODEL_STEP, slots);
    expect(over.slot).toBe('s2.title');
    expect(over.maxCharsPerLine).toBe(raw.slotIndex['s2.title'].maxCharsPerLine);
  });
});

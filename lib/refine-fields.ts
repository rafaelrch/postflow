import type { Slide, SlideStyle } from '@/types';
import type { RefineSlide } from '@/lib/refine-text';
import { template01ModelOf, template01SlotsForSlide } from '@/lib/templates/template-01';
import { template02ModelOf, template02TextSlotsForModel } from '@/lib/templates/template-02';
import {
  TEMPLATE_03_PRIMARY_SLOTS,
  template03ModelOf,
  template03TextSlotsForModel,
} from '@/lib/templates/template-03';

/**
 * O QUE O PAINEL DE REFINAR PODE OFERECER — parte pura, sem React.
 *
 * Duas perguntas moram aqui:
 *
 *  1. `refinableFields` — quais campos de TEXTO o slide ativo expõe, com o
 *     rótulo que o usuário já vê na barra lateral. É o que popula o seletor do
 *     escopo "este campo".
 *  2. `slidesPayload` — o array `slides` do corpo do POST.
 *
 * ⚠️ Este módulo NÃO reimplementa nenhuma regra do servidor. Contagem de
 * slides, chaves de slot imutáveis, escopo literal e teto de tamanho já são
 * garantidos em `lib/refine-text.ts` e foram provados lá. Aqui só se decide o
 * que É TEXTO neste slide — e mesmo isso sai da fonte que já existe: o
 * `kind: 'text' | 'image'` que cada template declara nos próprios descritores.
 * Reescrever esse julgamento aqui abriria uma segunda verdade sobre quais
 * slots são texto.
 */

export type RefinableField = {
  /** A chave que vai em `field` no POST: 'title' | 'description' | 'subtitle' | chave de slot. */
  key: string;
  /** O rótulo que o usuário já vê na barra lateral. */
  label: string;
  value: string;
};

/**
 * Campos de texto NÃO VAZIOS do slide ativo, na ordem em que aparecem na barra.
 *
 * Só valor GRAVADO entra — nunca o `defaultValue` do descritor. Dois motivos:
 * o payload manda exatamente o que está gravado (o servidor funde por chave
 * existente), e refinar o texto de fábrica do Figma escreveria no slide um
 * valor que o usuário nunca digitou. Campo vazio também fica de fora: o teto do
 * servidor é original + 20%, então 0 continua 0 — não há o que refinar.
 */
export function refinableFields(slide: Slide, style: SlideStyle, slideIndex: number): RefinableField[] {
  const slots = slide.templateSlots ?? {};

  if (style === 'template01') {
    // Modelo, nunca posição: deck com modelo repetido ou maior que 6 mostraria
    // os campos de outro slide. `cantos.*` vale para o deck inteiro, não é
    // texto deste slide.
    const model = template01ModelOf(slide, slideIndex);
    return template01SlotsForSlide(model)
      .filter((d) => d.kind === 'text' && !d.slot.startsWith('cantos.'))
      .map((d) => ({ key: d.slot, label: d.label, value: slots[d.slot] ?? '' }))
      .filter((f) => f.value.trim().length > 0);
  }

  if (style === 'template02') {
    const model = template02ModelOf(slide, slideIndex);
    return template02TextSlotsForModel(model)
      .map((d) => ({ key: d.slot, label: d.label, value: slots[d.slot] ?? '' }))
      .filter((f) => f.value.trim().length > 0);
  }

  if (style === 'template03') {
    const model = template03ModelOf(slide, slideIndex);
    return template03TextSlotsForModel(model)
      .map((d) => ({ key: d.slot, label: d.label, value: slots[d.slot] ?? '' }))
      .filter((f) => f.value.trim().length > 0);
  }

  return [
    { key: 'title', label: 'Título', value: slide.title ?? '' },
    { key: 'description', label: 'Descrição', value: slide.description ?? '' },
    { key: 'subtitle', label: 'Subtítulo', value: slide.subtitle ?? '' },
  ].filter((f) => f.value.trim().length > 0);
}

/**
 * O array `slides` do POST — só as chaves de TEXTO do contrato.
 *
 * `position` sai do ÍNDICE, não de `slide.position`: é por position que o
 * servidor confere a ordem da resposta e é pelo índice que o `updateSlide`
 * escreve de volta. Deixar as duas contas divergirem (deck reordenado com
 * `position` velha gravada) faria o merge devolver 502 position_mismatch num
 * carrossel perfeitamente válido.
 */
export function slidesPayload(slides: Slide[], style?: SlideStyle): RefineSlide[] {
  return slides.map((slide, i) => ({
    position: i,
    title:
      style === 'template03'
        ? slide.templateSlots?.[TEMPLATE_03_PRIMARY_SLOTS[template03ModelOf(slide, i)]?.title] ?? slide.title ?? ''
        : slide.title ?? '',
    // Campo VAZIO fica de fora: o teto do servidor é original + 20%, então 0
    // continua 0 e o campo entraria no prompt só como ruído ("NÃO ALTERE").
    ...(style === 'template03'
      ? (() => {
          const bodySlot = TEMPLATE_03_PRIMARY_SLOTS[template03ModelOf(slide, i)]?.body;
          const body = bodySlot ? slide.templateSlots?.[bodySlot] : slide.description;
          return body ? { description: body } : {};
        })()
      : slide.description ? { description: slide.description } : {}),
    ...(slide.subtitle ? { subtitle: slide.subtitle } : {}),
    ...(slide.templateSlots != null ? { templateSlots: { ...slide.templateSlots } } : {}),
  }));
}

/**
 * O patch para `updateSlide`: SÓ as chaves de texto que de fato mudaram.
 *
 * Nunca o slide inteiro. Devolver o objeto completo sobrescreveria imagem, cor,
 * fonte e layout com o que veio da rota — e a rota nem manda esses campos, então
 * o que chegaria é `undefined` apagando o estilo do usuário. Patch vazio =
 * nada a escrever, e o chamador nem chama.
 */
function template03ProposedSlots(original: Slide, proposto: RefineSlide, slideIndex: number): Record<string, string> {
  const model = template03ModelOf(original, slideIndex);
  const primary = TEMPLATE_03_PRIMARY_SLOTS[model];
  const originalSlots = original.templateSlots ?? {};
  const slots = { ...(proposto.templateSlots ?? {}) };

  // A resposta pode seguir o contrato genérico e mudar title/description, mas
  // no T3 esses campos são apenas aliases dos slots por modelo. Projete-os de
  // volta quando a IA não trouxe o slot correspondente alterado.
  if (
    primary &&
    typeof proposto.title === 'string' &&
    proposto.title !== original.title &&
    slots[primary.title] === originalSlots[primary.title]
  ) {
    slots[primary.title] = proposto.title;
  }
  if (
    primary &&
    typeof proposto.description === 'string' &&
    proposto.description !== (original.description ?? '') &&
    slots[primary.body] === originalSlots[primary.body]
  ) {
    slots[primary.body] = proposto.description;
  }
  return slots;
}

export function textPatch(original: Slide, proposto: RefineSlide, style?: SlideStyle, slideIndex = 0): Partial<Slide> {
  const patch: Partial<Slide> = {};

  if (style === 'template03' && original.templateSlots != null) {
    const model = template03ModelOf(original, slideIndex);
    const primary = TEMPLATE_03_PRIMARY_SLOTS[model];
    const proposedSlots = template03ProposedSlots(original, proposto, slideIndex);
    const changed = template03TextSlotsForModel(model).some(
      (d) => proposedSlots[d.slot] !== original.templateSlots?.[d.slot],
    );
    if (changed) {
      patch.templateSlots = { ...original.templateSlots, ...proposedSlots };
      if (primary && proposedSlots[primary.title] != null && proposedSlots[primary.title] !== original.title) {
        patch.title = proposedSlots[primary.title];
      }
      if (primary && proposedSlots[primary.body] != null && proposedSlots[primary.body] !== (original.description ?? '')) {
        patch.description = proposedSlots[primary.body];
      }
    }
    return patch;
  }

  if (proposto.title != null && proposto.title !== original.title) {
    patch.title = proposto.title;
  }
  if (proposto.description != null && proposto.description !== (original.description ?? '')) {
    patch.description = proposto.description;
  }
  if (proposto.subtitle != null && proposto.subtitle !== (original.subtitle ?? '')) {
    patch.subtitle = proposto.subtitle;
  }

  if (proposto.templateSlots != null && original.templateSlots != null) {
    const mudou = Object.keys(proposto.templateSlots).some(
      (k) => proposto.templateSlots![k] !== original.templateSlots![k],
    );
    // O mapa vai INTEIRO quando muda: `templateSlots` é um objeto só no slide,
    // e o servidor já garantiu que o conjunto de chaves é o mesmo que entrou.
    if (mudou) patch.templateSlots = { ...original.templateSlots, ...proposto.templateSlots };
  }

  return patch;
}

/** Uma diferença para o preview: o que está no slide hoje e o que a IA propõe. */
export type FieldDiff = { slideIndex: number; key: string; label: string; before: string; after: string };

/**
 * As mudanças propostas, campo a campo, para o usuário VER antes de aplicar.
 *
 * Este é o coração da fatia: refinar por cima sem mostrar o que mudou é como o
 * usuário perde um texto de que gostava. Nada aqui escreve no store.
 */
export function previewDiffs(
  slides: Slide[],
  propostos: RefineSlide[],
  style: SlideStyle,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  propostos.forEach((proposto, i) => {
    const original = slides[i];
    if (!original) return;
    // Os rótulos saem da MESMA função que popula o seletor de campo, para o
    // preview nomear o campo exatamente como a barra lateral o nomeia.
    const rotulos = new Map(refinableFields(original, style, i).map((f) => [f.key, f.label]));

    const registra = (key: string, before: string, after: string) => {
      if (after === before) return;
      diffs.push({ slideIndex: i, key, label: rotulos.get(key) ?? key, before, after });
    };

    if (style === 'template03') {
      const model = template03ModelOf(original, i);
      const slots = template03ProposedSlots(original, proposto, i);
      for (const d of template03TextSlotsForModel(model)) {
        registra(d.slot, original.templateSlots?.[d.slot] ?? '', slots[d.slot] ?? original.templateSlots?.[d.slot] ?? '');
      }
      return;
    }

    if (proposto.title != null) registra('title', original.title ?? '', proposto.title);
    if (proposto.description != null) registra('description', original.description ?? '', proposto.description);
    if (proposto.subtitle != null) registra('subtitle', original.subtitle ?? '', proposto.subtitle);

    for (const [chave, valor] of Object.entries(proposto.templateSlots ?? {})) {
      registra(chave, original.templateSlots?.[chave] ?? '', valor);
    }
  });

  return diffs;
}

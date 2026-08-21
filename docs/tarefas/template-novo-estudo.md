# Template novo — estudo prévio dos dois templates de spec

Autor: Engenheiro. Data: 21/08/2026. Árvore: `postflow--main`, branch
`feat/cretools-atualizacoes`, HEAD `de1f883`, árvore limpa.

**Nada foi alterado.** Este documento é o único arquivo escrito. Nenhum teste foi
executado, porque nenhum código mudou — a matriz da seção 7 é derivada da leitura
das 15 suítes, não de uma rodada.

**Por que ele existe:** a TASK 3 ("novo template de carrossel") está bloqueada
esperando do Rafael a forma, o nome de produto e a referência visual. O estudo de
como o Template 1 e o Template 2 funcionam não depende disso, e é o que faz a
implementação sair rápida e sem regressão quando o material chegar.

**Regra deste documento:** toda afirmação tem endereço no código. Onde não achei,
está escrito "não achei". Contradição entre comentário e código está registrada
com as duas versões e qual vale hoje.

Chamo o template novo de `template03` / "T3" ao longo do texto. É nome de
exemplo — o valor real de `SlideStyle` ainda não existe.

---

## 0. O mapa em uma frase

Os dois templates de spec existentes têm o **mesmo encanamento de editor** e
**motores de desenho completamente diferentes**. O que se reaproveita num
template novo é o encanamento (slots, modelo, overrides, painéis, persistência);
o que se escreve do zero é o componente que pinta. Isso não é acidente — está
escrito em `docs/template-02-integracao.md:52-55`.

---

## 1. RECEITA COMPLETA — a lista ordenada

O que segue é a ordem em que as peças precisam nascer. Segui a ordem real em que
o T2 foi feito (`docs/template-02-integracao.md:176-357`, fatias S1–S6), corrigida
pelo que o código mostra hoje.

### Passo 0 — o `SlideStyle` (o compilador vira a checklist)

`types/index.ts:1`:

```ts
export type SlideStyle = 'minimalist' | 'profile' | 'editorial' | 'template01' | 'template02';
```

Acrescentar `'template03'` aqui é o primeiro gesto, e é ele que transforma o
`tsc` na lista de tarefas. `docs/template-02-integracao.md:66-68` diz
explicitamente: *"É uma união crua; o `tsc` vai apontar todo lugar que precisa de
braço novo. Trate cada erro do `tsc` como um item da checklist — não silencie com
cast."*

**Os pontos que QUEBRAM sozinhos no `tsc`** (todos os `Record<SlideStyle, …>`, a
lista é completa — grep por `Record<SlideStyle` na árvore devolve exatamente
estes três):

| arquivo:linha | o que é | o que decidir |
|---|---|---|
| `components/editor/sidebar/panels.ts:137` | `TEMPLATE_SIDEBAR_CONFIG` | quais painéis o T3 tem, na ordem |
| `components/editor/CreateWizard.tsx:316` | `TEMPLATE_PREVIEW` | tem preview `.webp` ou `null` |
| `lib/refine-text.ts:393` | `STYLE_LABELS` | como o T3 se descreve para a IA de refino |

O comentário em `CreateWizard.tsx:311-313` diz isso com todas as letras:
*"`Record<SlideStyle, …>` de propósito: quando a TASK 3 acrescentar um estilo, o
TypeScript quebra AQUI e obriga alguém a decidir se aquele template tem preview
ou não."* O projeto já previu esta task.

⚠️ **`lib/refine-text.ts:52` NÃO quebra no `tsc` e precisa de edição manual:**

```ts
const STYLES = ['minimalist', 'profile', 'editorial', 'template01', 'template02'] as const satisfies readonly SlideStyle[];
```

`satisfies readonly SlideStyle[]` aceita um array INCOMPLETO — ele só proíbe
valor inválido, não exige exaustividade. Esquecer aqui não dá erro de
compilação. É a única lista de estilos da árvore com essa característica.

### Passo 1 — o spec

`lib/templates/template-03/spec.json`, cópia **verbatim** do que o Rafael
entregar. Gate declarado em `docs/template-02-integracao.md:373`: o `spec.json` e
a skill de origem ficam **intocados**.

Os dois specs existentes não têm o mesmo formato — ver seção 2.

### Passo 2 — o módulo do template (`lib/templates/template-03/index.ts`)

O contrato mínimo, lido do que os dois já expõem e do que o resto da árvore
consome:

| símbolo | T1 | T2 | quem consome |
|---|---|---|---|
| `TEMPLATE_0X_SPEC` | `index.ts:147` | `index.ts:159` | tudo |
| `_WIDTH` / `_HEIGHT` | `index.ts:407-408` | `index.ts:161-162` | picker, testes |
| `_MODELS: number[]` | `index.ts:1156` | `index.ts:408` | picker |
| `isTemplate0XModel` | `index.ts:1158` | `index.ts:423` | `template0XModelOf` |
| `template0XModelOf(slide, position)` | `index.ts:1174` | `index.ts:439` | barra, refino, imagem, render |
| `template0XSlotsForModel/Slide` | `index.ts:645` | `index.ts:692` | barra, wizard, refino |
| `template0XSlotLabel` | `index.ts:478` | `index.ts:636` | barra |
| `template0XSlotDefaults` | `index.ts:326` | `index.ts:735` | barra (tipografia de fábrica) |
| `template0XSlotFontName` | `index.ts:341` | `index.ts:745` | barra |
| `template0XSlotColor(slot, model)` | `index.ts:1189` | `index.ts:766` | barra (seletor de cor) |
| `template0XImageSlot(model)` | `index.ts:594` | `index.ts:776` | imagem, geração |
| `template0XDefaultSlots` | `index.ts:629` | `index.ts:781` | estado inicial |
| `template0XNewSlideSlots(model)` | `index.ts:1288` | `index.ts:1183` | picker |
| `template0XSlotsFromContent` | `index.ts:712` | `index.ts:837` | wizard |
| `template0XMeasure` / `_Overflows` | `index.ts:1100` / `1128` | `index.ts:1021` / `1046` | barra (contador), auditoria |
| `TEMPLATE_0X_DESIGN_TWEAKS` | `index.ts:164` | `index.ts:184` | registro de desvio do spec |

### Passo 3 — o componente que desenha

`components/slides/Template03Slide.tsx`. É um **porte do renderizador de
referência** que vier junto do spec, não uma adaptação de um dos dois que
existem: `docs/template-02-integracao.md:45-50` proíbe explicitamente reusar
`template01Nodes`, `template01Tops`, `template01FormatShift` no T2, e explica que
o `Template02Slide` é porte do `generate.py` assim como o `Template01Slide` é
porte do `render.py`.

### Passo 4 — imagem com uma verdade só

`lib/templates/template-03/image.ts`, no molde de
`lib/templates/template-02/image.ts` (não o do T1 — ver seção 4, armadilha #1):

- `template03SetImage(slide, model, url)` — escreve no slot e **zera** os
  genéricos (`template-02/image.ts:27-39`);
- `template03ClearImage(slide, model)` (`template-02/image.ts:42-49`);
- `template03SlideImageUrl(slide, model)` — leitura **só do slot**
  (`template-02/image.ts:59-64`).

### Passo 5 — overrides

`lib/templates/template-03/overrides.ts`. A disciplina está no cabeçalho de
`lib/templates/template-01/overrides.ts:1-17`: **o que caracteriza um override é
a MARCA em `slide.templateOverrides`**, gravada só pelos handlers da barra
lateral, nunca a comparação do valor com o padrão.

### Passo 6 — a barra lateral

1. `components/editor/Template03Slots.tsx` (molde: `Template02Slots.tsx`);
2. o braço no `components/editor/EditorSidebar.tsx` — importa o `Slots`
   (`EditorSidebar.tsx:14-15`) e os helpers do módulo (`:47-73`);
3. a entrada em `TEMPLATE_SIDEBAR_CONFIG` (`panels.ts:137`);
4. se algum painel do T3 depender do modelo, um campo `template03Model` em
   `PanelContext` (`panels.ts:51-71`) — ver a advertência de `panels.ts:59-62`.

O painel `restaurarTemplate` tem de ser **sempre o último do grupo**:
`panels.ts:153-154` e `:170-171`, *"é o que desfaz tudo o que está acima"*.

### Passo 7 — render em todos os lugares que desenham um slide

Quatro despachos por estilo, todos ternários encadeados, todos precisam de braço:

| arquivo:linha | contexto |
|---|---|
| `components/editor/SlidePreview.tsx:72-80` | o slide no editor |
| `components/editor/HiddenSlides.tsx:48-56` | a árvore oculta da **exportação** |
| `app/(app)/dashboard/DashboardClient.tsx:85-93` | a miniatura do dashboard |
| `components/editor/SlideCanvas.tsx:81-82` | o rótulo de produto na faixa |

⚠️ Nenhum destes é `Record<SlideStyle, …>` — são ternários. **O `tsc` não
quebra** se você esquecer um: o slide cai no `else` final e sai renderizado como
`MinimalistSlide` (`SlidePreview.tsx:105+`). Esquecer o `HiddenSlides` é o pior
caso: o editor mostra certo e o **PNG exportado sai errado**.

### Passo 8 — criação (wizard)

Em `components/editor/CreateWizard.tsx`:

| linha | o que |
|---|---|
| `:105-143` | `templateFieldsForSlide` — o braço que devolve os campos por slot |
| `:144-146` | `isSpecTemplate` — inclui o T3 |
| `:194` | `SKIP_VISUAL_STEP` — wizard de 3 passos em vez de 4 |
| `:228-252` | `TEMPLATES` — o card (valor, nome de produto, `short`, `detail`) |
| `:254` | `FIXED_VISUAL_STYLES` |
| `:280-283` | `previewSlide` — a capa de exemplo |
| `:316` | `TEMPLATE_PREVIEW` + o asset em `public/templates/` |
| `:1044-1130` | `editorSlides` — o slide em memória |
| `:1194-1256` | `slidesPayload` — a linha do banco |

⚠️ **`editorSlides` e `slidesPayload` são duas listas escritas à mão, uma por
estilo.** O próprio código registra o preço disso em `:1263-1267`: *"Antes as
duas listas eram escritas à mão, uma ao lado da outra, e divergir era só questão
de tempo."* Ver seção 4, armadilha #4 — a divergência está viva no T1 hoje.

### Passo 9 — geração de imagem por IA

`hooks/useGenerateCarouselImages.tsx`, três braços:

- `:186-199` — qual slot recebe a imagem;
- `:290-295` — `ImageSurface` (`'light' | 'dark'`, `types/index.ts:41`): o T2
  devolve `dark` na capa e `light` nos internos por causa do fundo creme;
- `:318-323` — o patch (`template0XSetImage`).

E `ImageShape` (`types/index.ts:28`): `full-bleed` | `inset-block` |
`inset-landscape`. Se o T3 tiver um bloco de imagem com proporção diferente
dessas três, é aqui que se decide se cabe numa existente ou se nasce uma quarta —
e a quarta arrasta `lib/image-prompt.ts:71` (`COMPOSITION`),
`lib/openai.ts:226` (`imageSizeForShape`) e `app/api/generate-image/route.ts:54`.

### Passo 10 — refino de texto por IA

- `lib/refine-fields.ts:45-62` — braço que lista os campos refináveis por slot;
- `lib/refine-text.ts:52` — a lista `STYLES` (**não quebra no `tsc`**);
- `lib/refine-text.ts:393-399` — `STYLE_LABELS`.

### Passo 11 — o prompt de geração

`app/api/generate-carousel/route.ts:246-247`. Se o T3 tiver limites de texto
próprios, precisa de um `template03Addendum()`.

⚠️ **O addendum mora no módulo do template, não no route.**
`docs/template-02-integracao.md:235-238`: *"o `route.ts` do App Router não aceita
export solto sem risco de quebrar o build — e exportar era o que faltava para
testá-lo."*

### Passo 12 — exportação

`lib/export-images.ts:69-81`. O braço de spec-template varre
`Object.values(slide.templateSlots)` procurando URL. O comentário de `:70-72`
explica: *"Ler os slots em vez de reconstruir a varredura do spec evita ficar
fora de sincronia com o template quando ele ganhar um slot de imagem novo."* Se o
T3 guardar toda imagem em slot, este braço serve **sem alteração** — basta
incluir `'template03'` na condição de `:69`.

### Passo 13 — popup de modelo

`components/editor/TemplateModelPicker.tsx` já é genérico (props em `:25-43`). O
T2 o usa direto, inline, em `SlideCanvas.tsx:506-531`; o T1 tem um wrapper,
`Template01ModelPicker.tsx`, que também o compõe (`:54`). Para o T3, o caminho
barato é o do T2: usar direto, ~25 linhas de JSX.

### Passo 14 — banco

Ver seção 6.

### Passo 15 — testes

Ver seção 7.

---

### O que o T2 precisou que o T1 não precisou

| item | por quê |
|---|---|
| **Migration só de CHECK** (`20260805230441_allow_template02_style.sql`) | as colunas `template_slots`/`template_model`/`template_overrides`/`template_slot_styles` já existiam e **não são específicas do T1** (`docs/template-02-integracao.md:57-62`) |
| **Deck de tamanho aberto** | o T1 é fechado em 6 (`CreateWizard.tsx:834-835`, `isFixedDeck` é **só do T1**); o T2 mantém o slider e abre em 5 (`:1446`) |
| **Alternância de modelo** | `template02ModelAt` (`index.ts:455`) e `template02NextModel` (`index.ts:465`); o T1 é 1 modelo por posição |
| **Modelo "sugerido" no picker** | `SlideCanvas.tsx:111-113` calcula, `TemplateModelPicker.tsx:29` recebe. O T1 não passa `suggested` (`Template01ModelPicker.tsx:54-73`) |
| **`SPEC_ELEMENT_ID`** (`index.ts:670-677`) | o slot `cover.cta` casa com o elemento `cover.ctaText` do spec. Achado fora do plano, S1 |
| **`template02HighlightParts`** e afins (`index.ts:886-1001`) | o marcador lime da capa — não tem paralelo no T1 |
| **`TEMPLATE_02_GABARITO_DIVERGENCES`** (`index.ts:304`) | lista de desvios do gabarito com motivo e data |
| **`template_model` gravado no payload do banco** | `CreateWizard.tsx:1255`. O T1 **não grava** — ver armadilha #4 |
| **`ImageSurface` `light`** | fundo creme `#EEE5D9` (`types/index.ts:33-37`) |

### O que o T1 precisou que o T2 não precisou

| item | por quê |
|---|---|
| **Três migrations além do CHECK** | `20260731_template01.sql` (coluna `template_slots` + CHECK), `20260803_template01_overrides.sql`, `20260804_template01_model.sql`, `20260804_template01_slot_styles.sql`. O T1 **criou** o encanamento que o T2 herdou |
| **Motor de reflow por âncora** | `template01Tops` (`index.ts:999`), `template01FormatShift` (`index.ts:944`), `TEMPLATE_01_FLOW_GROUPS` (`index.ts:774`), `TEMPLATE_01_ALIGN_GROUPS` (`index.ts:370`). `docs/template-02-integracao.md:48-50`: *"o motor de reflow por âncora do T1 **não existe aqui** (…) Não invente âncora"* |
| **Fallback de leitura nos campos genéricos** | `template01SlideImageUrl` (`index.ts:619-626`) e `Template01Slide.tsx:381-393`. Dívida de deck salvo antes da regra do slot; o T2 nasceu sem ela (`template-02/image.ts:20-23`) |
| **Overrides por PAPEL** (`title`/`body`/`corner`) | `template-01/overrides.ts:70-78` — camada de baixo preservada porque decks antigos gravaram assim |
| **`TEMPLATE_01_EXTRA_SLOTS`** (`index.ts:679`) | slots secundários que a IA precisa preencher para não sobrar copy do Figma |
| **Componente wrapper do picker** | `Template01ModelPicker.tsx` |
| **Página de laboratório** | `app/t01-lab/page.tsx` — o T2 não tem equivalente |
| **Deck fixo no wizard** | `CreateWizard.tsx:834-835, 1019-1020, 1561-1563` |

---

## 2. O QUE É SPEC E O QUE É COMPONENTE

### Os dois specs não têm o mesmo formato — e isso é a decisão de arquitetura mais importante aqui

**T1 — dump de nós do Figma.** Chaves de topo: `$schema`, `template`, `slides`,
`slotIndex`, `fontSubstitutions`, `designSystem`, `correctionsApplied`. `slides` é
um array de 6, cada um com `nodes[]` carregando `box` (x/y/w/h/right/bottom),
`fills`, `typography`, `text.characters`, `constraints`. 66 KB. É uma fotografia
geométrica: **a forma está literalmente nos números do JSON**.

**T2 — tokens + layouts.** Chaves de topo: `$schema`, `id`, `name`, `source`,
`canvas`, `tokens`, `effects`, `chrome`, `layouts`, `regrasDeLayout`,
`regrasDeGeracao`, `inconsistenciasDetectadas`, `riscosDeImplementacao`,
`camposEditaveis`, `version`. 18 KB, 3 layouts. É uma **descrição de regras**, e
quem descreve o desenho de verdade é o `generate.py` da skill
(`docs/template-02-integracao.md:41-43`).

Consequência direta, medida no tamanho dos arquivos:

| | spec.json | index.ts | overrides.ts | Slide.tsx |
|---|---|---|---|---|
| T1 | 66 KB | 50 KB | 10.6 KB | 23 KB |
| T2 | 18 KB | 49 KB | 6.3 KB | 18.9 KB |

O spec do T2 é 3,6× menor e o `index.ts` é do mesmo tamanho — porque **o que o
spec não diz, o código diz**.

### Onde mora a FORMA

- **T1:** no `spec.json`. `TEMPLATE_01_EDITABLE_SLOTS` (`index.ts:487-538`) é
  **gerado por varredura** dos nós: percorre `slide.nodes`, pega os que têm
  `node.slot` e são `TEXT` ou `RECTANGLE`, e o `kind` sai do tipo do nó
  (`:527` — `node.type === 'TEXT' ? 'text' : 'image'`). Um slot novo no Figma
  aparece na barra lateral **sem código novo**.
- **T2:** numa tabela **escrita à mão** — `SLOT_DEFS` (`index.ts:621-631`, tipo em `:603`), 9
  linhas literais com slot, modelos, kind, label, scope, order, multiline, style.
  Um slot novo exige editar essa tabela.

### Onde mora o COMPORTAMENTO

Nos dois casos, no `TemplateXXSlide.tsx` e no `overrides.ts`. O
`TEMPLATE_0X_DESIGN_TWEAKS` (`template-01/index.ts:164`,
`template-02/index.ts:184`) é a camada declarada de desvio: **o `spec.json` fica
intocado e o desvio fica registrado ao lado do valor original**
(`docs/template-02-integracao.md:132-133`).

### Quanto código novo um template novo deveria precisar, de verdade?

Resposta honesta, medida:

**O que sai de graça (zero linha nova):**
- persistência — `lib/slide-mapper.ts:61-66` e `:117-120` já leem e escrevem
  `template_slots`, `template_model`, `template_overrides`,
  `template_slot_styles` **para qualquer estilo**;
- as quatro colunas do banco;
- o popup de modelo (`TemplateModelPicker.tsx`, genérico desde a S3);
- o registry de painéis e os componentes de `components/editor/sidebar/`;
- a exportação PNG — `docs/template-02-integracao.md:253-254`: *"O caminho de
  exportação não tem braço por estilo: ele captura o que o `HiddenSlides`
  renderizou"*;
- a carga do carrossel — `lib/carousel-load.ts` é genérico de ponta a ponta,
  **não tem uma linha sobre templates** (li o arquivo inteiro, 86 linhas).

**O que é inevitavelmente novo:**
- o `Template03Slide.tsx` — porte do renderizador de referência (~19–23 KB pelos
  dois precedentes);
- o `index.ts` do módulo (~49 KB nos dois casos);
- o `overrides.ts` (~6–11 KB);
- o `Template03Slots.tsx`.

**O que é "cola" repetitiva e mecânica** — ~14 pontos de edição, listados na
seção 1: 3 quebram no `tsc`, 4 são ternários de render que **não quebram**, e o
resto são braços em `if (style === …)`.

**Estimativa:** ~4 arquivos novos de peso + ~14 pontos de edição. O T2 levou 6
fatias (S1–S6) e o número de testes foi de 671 → 863
(`docs/template-02-integracao.md:370-371`).

---

## 3. OS SLOTS

### O que é um slot

`Slide.templateSlots?: Record<string, string>` — `types/index.ts:341`. O
comentário de `:337-340`: *"a forma é fixa no spec, então o slide não carrega
tipografia/posição, apenas o texto e as URLs de imagem."*

**Texto e URL de imagem moram no MESMO mapa**, os dois como `string`.

### Como um slot sabe se é texto ou imagem

Não sabe — quem sabe é o **descritor**, e ele não vem do slide:

- **T1:** `Template01SlotDescriptor.kind` (`index.ts:429`), derivado do tipo do
  nó do Figma em `index.ts:527`. Slots de imagem que não são nó (o fundo dos
  slides 1 e 2) entram por `backgroundLayers` com `kind: 'image'` fixo
  (`index.ts:520-534`);
- **T2:** `SlotDef.kind`, escrito à mão em `index.ts:621-631`.

Consumidores filtram por `kind`: `Template01Slots.tsx:33-35`,
`template02TextSlotsForModel` (`index.ts:713-715`),
`CreateWizard.tsx:107-108`, `refine-fields.ts:51`, `export-images.ts:73`.

### Como é PREENCHIDO

Quatro caminhos, todos escrevendo no mesmo mapa:

1. **Deck gerado (wizard):** `CreateWizard.tsx:1063-1071` (T1) e `:1101-1110`
   (T2) — `sl.slots` (manual/JSON) ou `template0XSlotsFromContent(...)`, mais os
   defaults de cabeçalho/cantos;
2. **Slide novo pelo picker:** `TemplateModelPicker.tsx:63-66` —
   `{ templateSlots: slotsForModel(model), templateModel: model }`;
3. **Edição na barra:** `Template01Slots.tsx:37-38` e `Template02Slots.tsx:47-48`
   — `updateActiveSlide({ templateSlots: { ...slots, [slot]: value } })`;
4. **Imagem (upload ou IA):** `template-02/image.ts:27-39` e
   `template-01/image.ts:25-39`.

### Como é LIDO — e a semântica exata do vazio

**T1** (`Template01Slide.tsx:518`):
```ts
const value = slots[slot] ?? slots[node.id] ?? fallback;
```
**T2** (`Template02Slide.tsx:529-531`):
```ts
if (slots[slot] != null) return slots[slot];
return template02SlotsForModel(model).find((d) => d.slot === slot)?.defaultValue ?? '';
```

Os dois usam `??` / `!= null`, e **isso é a regra inteira**:

| estado do slot | o que aparece |
|---|---|
| chave **ausente** | o texto de fábrica do spec (a copy do Figma) |
| chave presente com `''` | **vazio de verdade** — o bloco some |
| chave presente com texto | o texto |

**Chave ausente ≠ chave vazia.** É por isso que o wizard escreve
**todo** slot de texto, mesmo em branco: `CreateWizard.tsx:154-161`
(`slotsFromFields`), com o comentário em `:148-152`: *"um deck criado aqui não
pode exibir a copy ilustrativa do Figma."*

A barra lateral segue a mesma regra: `Template01Slots.tsx:45`
(`slots[d.slot] ?? d.defaultValue`).

### Slot de IMAGEM vazio

- **T2:** `Template02Slide.tsx:551` — `const image = slots['cover.image'] || ''`,
  e `CoverBackground` recebe `url={image || undefined}`. Sem imagem, sem camada.
  Note o `||` (e não `??`): para imagem, `''` e ausente são a mesma coisa.
- **T1:** `Template01Slide.tsx:381-393` — slot vazio cai nos campos genéricos via
  `template01FallbackImage` (`index.ts:606-608`). É a dívida descrita na
  armadilha #1.

### Como é SALVO e RELIDO

**Escrita:** `lib/slide-mapper.ts:117` —
```ts
...(slide.templateSlots ? { template_slots: slide.templateSlots } : {}),
```
Spread condicional, e o motivo está em `:114-116`: *"Escrever a chave apenas
quando há conteúdo mantém o autosave dos outros estilos funcionando mesmo antes
da migração do template rodar (a coluna não existe → o insert falharia)."*

**Leitura:** `lib/slide-mapper.ts:61` — `(sl.template_slots as …) || undefined`.

Coluna: `slides.template_slots jsonb` (`supabase/schema.sql:188`).

**O mapper é agnóstico de estilo** — é ele que faz o encanamento sair de graça
para o T3.

### Slot que SUMIU do spec

Nenhum dos dois módulos limpa o mapa. O valor **fica órfão no jsonb para
sempre**: não aparece na barra (os descritores vêm do spec/`SLOT_DEFS`), não é
renderizado (o render itera os nós/layout, não as chaves do mapa), não é apagado.

Efeito colateral que **é** visível: `lib/export-images.ts:73` itera
`Object.values(slide.templateSlots ?? {})` e pré-carrega **toda** URL que
encontrar — inclusive a de um slot órfão. Custo de rede, não erro visual.

⚠️ **Corolário para o T3: a CHAVE do slot é irrevogável.** Está escrito em dois
lugares: `Template01SlotDescriptor.label` (`index.ts:427`) — *"É só interface — a
CHAVE do slot nunca muda"* — e `docs/template-02-integracao.md:88-89`: *"não
invente nomes novos, porque a chave é o que fica gravado no banco de todo
carrossel salvo."* Renomear um slot depois do primeiro deck salvo apaga o
conteúdo do usuário na tela.

### O que NÃO é slot

`Slide.templateModel` (`types/index.ts:352`) é estrutura, não conteúdo. O
raciocínio está em `20260804_template01_model.sql:13-16`: *"aquele objeto é
conteúdo POR SLOT. Enfiar um número de modelo ali criaria uma chave que não é
slot dentro do mapa de slots, e o render itera esse mapa."*

Mesma regra para a cor do marcador do T2 (`types/index.ts:280-283`): foi para
`TemplateSlotStyle.background`, não para um slot, porque *"criaria um segundo
lugar para a mesma ideia e ainda misturaria estilo com conteúdo"*
(`docs/template-02-integracao.md:337-341`).

---

## 4. AS ARMADILHAS JÁ PAGAS

### #1 — Duas verdades para a imagem

**Onde:** `lib/templates/template-01/image.ts:4-22` e
`lib/templates/template-02/image.ts:4-23`.

Existiam duas fontes: o slot (`templateSlots[imageSlot]`) e os campos genéricos
(`backgroundImageUrl`/`gridImageUrl`/`contentImageUrl`), com o render caindo nos
genéricos só quando o slot está vazio. **Cada caminho escrevia num lado** — o
upload manual no slot, a IA nos genéricos. Sintomas:

> *"com upload manual no slot, gerar por IA terminava com 'pronto!' e nada mudava
> na tela — o slot continuava vencendo; remover pelo painel de upload limpava só
> o slot, e a imagem genérica reaparecia como fallback, como se tivesse voltado
> sozinha."*

**Regra:** quem escreve, escreve no **slot** e **zera os genéricos**.

**Para o T3:** copiar o molde do **T2**, não o do T1. `template-02/image.ts:20-23`
diz a diferença: *"aqui a LEITURA também é só o slot. O T1 precisa do fallback na
leitura porque tem deck salvo de antes da regra; o T2 nasceu com uma verdade só e
não deve ganhar uma segunda."* Um template que não existe ainda **não tem deck
antigo** — não pode nascer com a dívida do T1.

### #2 — Modelo por POSIÇÃO em vez de modelo gravado no slide

**Onde:** `20260804_template01_model.sql:7-11`, `types/index.ts:344-357`,
`panels.ts:59-62`, `Template01ModelPicker.tsx:16-19`.

O deck do T1 era fechado em 6, então posição e modelo eram a mesma coisa. Quando
o usuário pôde repetir modelo e passar de 6:

> *"o slide 7 caía no clamp e saía com o modelo 6 inteiro, seta e textos de
> fábrica do Figma junto."*

**Regra:** o modelo é dado do slide (`Slide.templateModel`), resolvido por
`template0XModelOf(slide, position)`. `panels.ts:59-62` é categórico:

> *"🔴 Condição de template usa ISTO, nunca `activeSlideIndex + 1`: modelo não é
> posição. Deck com modelo repetido, slides reordenados ou mais de 6 slides
> quebram na hora se a condição olhar a posição."*

Os consumidores já seguem: `Template01Slots.tsx:31`, `Template02Slots.tsx:44`,
`refine-fields.ts:49` e `:57`, `useGenerateCarouselImages.tsx:187` e `:196`.

**Para o T3:** nunca derivar o modelo da posição fora do fallback de
compatibilidade dentro do próprio `template03ModelOf`.

### #3 — Override por COMPARAÇÃO de valor em vez de marca explícita

**Onde:** `lib/templates/template-01/overrides.ts:9-16` e
`types/index.ts:359-366`.

A versão anterior comparava `backgroundColor !== DEFAULT_SLIDE.backgroundColor`:

> *"quebrou no primeiro uso real: a geração gravava a cor da MARCA do usuário em
> todo slide, ela diferia de `#111111`, virava 'escolha do usuário' e pintava
> chapado por cima dos degradês do Figma. **Valor não é intenção; só o gesto é.**"*

**Regra:** override = marca em `slide.templateOverrides`, escrita **só** pelos
handlers da barra lateral. `types/index.ts:365-366` e `:369-370`: **"GERAÇÃO
NUNCA escreve aqui."** O wizard cumpre em `CreateWizard.tsx:1050-1055`.

### #4 — As duas listas do wizard divergindo (⚠️ VIVA HOJE)

**Onde:** `CreateWizard.tsx:1044-1130` (`editorSlides`) e `:1194-1256`
(`slidesPayload`).

`docs/template-02-integracao.md:240-242` e `:364-366` registram a pendência:

> *"O `slidesPayload` do TEMPLATE 1 não grava `template_model`. Deck do T1 gerado
> hoje reabre derivando o modelo da POSIÇÃO — reordenar um slide troca o desenho
> dele. É bug real, e a correção é uma linha."*

**VERIFIQUEI CONTRA O CÓDIGO DE HOJE (HEAD `de1f883`): continua verdade.**

- `CreateWizard.tsx:1062` — o `editorSlides` do T1 grava `templateModel: i + 1`;
- `CreateWizard.tsx:1224` — o `slidesPayload` do T1 termina em
  `template_slots: editor.templateSlots`, **sem `template_model`**;
- `CreateWizard.tsx:1255-1256` — o do T2 tem as duas linhas, com o comentário
  `:1227-1229` explicando por quê.

O comentário de `:1263-1267` já tinha nomeado a família do defeito: *"as duas
listas eram escritas à mão, uma ao lado da outra, e divergir era só questão de
tempo."*

**Para o T3: escreva os dois braços no mesmo commit e prove com teste que a linha
do banco carrega `template_model`.** Não é escopo desta task consertar o T1 — mas
quem for mexer no `slidesPayload` vai ver as duas versões lado a lado.

### #5 — A pilha de fonte com `'IvyOra Text'`

**Onde:** `docs/template-02-integracao.md:124-127`.

> *"⚠️ **Nunca escreva `'IvyOra Text'` nessa pilha.** O app declara um
> `@font-face` com esse nome que resolve só por `local()`; quando não acha nada,
> o Chrome trata a família como definida-e-vazia e pula direto para a `serif`
> genérica (Georgia) em vez de cair no `T01Serif`. Medido: 334px contra 305px.
> **Já queimamos uma sessão nisso.**"*

A pilha correta é `"'ivyora-text', 'T01Serif', serif"`
(`docs/template-02-integracao.md:121`). Confirmado na exportação: as faces
`'IvyOra Text'` saem no CSS com **zero** `data:` URI
(`docs/template-02-integracao.md:267-269`).

**Para o T3:** reusar as faces já embutidas (`T01Inter`, `T01InterDisplay`,
`T01Serif`, `ivyora-text` via Typekit). `docs/template-02-integracao.md:130`:
*"Não acrescente `@font-face` novo."*

### #6 — Altura travada na linha e bloco ancorado pelo topo

**Onde:** `docs/template-02-integracao.md:298-314`.

Cada linha era um `div` com `height` travado no `lineHeight`; quando o texto não
cabia, a segunda linha visual caía **por cima** da seguinte (medido a 110px:
`scrollHeight` 247 num div de 120). E o bloco crescia contra a pílula de CTA.

Correções: altura **natural** (uma linha que quebra **empurra**) e ancoragem pela
**base**. Nos internos, `justify-content: safe center` — *"centralizado enquanto
couber, alinhado ao topo quando não couber, e no-op quando cabe"*.

**Para o T3:** nenhum bloco de texto com `height` fixo derivado do `lineHeight`.

### #7 — Margem que ESCALA na adaptação de formato

**Onde:** `docs/template-02-integracao.md:138-149`.

Os três formatos compartilham largura 1080; só a altura muda. *"No 4:5 a razão é
1.0 e **toda conta aqui tem de ser no-op** — se algo mudar 1px no 4:5, a regra
está errada."* E: *"Margem que escala vira margem gigante no 9:16"* — daí as
distâncias **absolutas** ao rodapé.

Travado por `tests/template-01-formato.test.tsx:88` (*"o 4:5 é no-op"*) e
`:198` (*"margem é absoluta e não escala"*).

### #8 — Copy ilustrativa do Figma sobrando num deck gerado

**Onde:** `template-01/index.ts:672-678`, `CreateWizard.tsx:148-152`,
`tests/template-01.test.tsx:145`, `tests/template-02-criacao.test.tsx:118`.

> *"o texto de fábrica do Figma ('*Barcelona FC cria fonte inspirada na
> arquiterua catalã') é ilustrativo e não pode sobrar num carrossel gerado."*

É a consequência direta da semântica de chave-ausente da seção 3. Por isso
`TEMPLATE_01_EXTRA_SLOTS` existe: para a IA escrever também os slots secundários.

### #9 — Rótulo de painel que mente

**Onde:** `panels.ts:118-128` e `:87-89`.

O rótulo antigo *"Tema do slide"* dizia o contrário do que o controle faz (ele
escreve `globalSettings.theme`, do carrossel inteiro). E o `label?` opcional em
`SidebarGroupConfig` nasceu porque o grupo global do T2 é **conteúdo**, não
estilo: *"Rótulo que mente foi exatamente o que a refatoração da barra do T1 veio
acabar."*

### #10 — O painel de imagem escondido dentro de "Fundo do slide"

**Onde:** `panels.ts:186-189`.

> *"Antes a capa não tinha 'Imagem' e a geração por IA dela morava escondida
> dentro de 'Fundo do slide': **ninguém achava.**"*

### #11 — Cobrar geração de imagem em slide que não tem imagem

**Onde:** `useGenerateCarouselImages.tsx:186-194`.

> *"`template01ImageSlot` devolve `undefined` e `template01SetImage` devolve
> `{}` — gerar ali cobrava e não pintava nada."*

O modelo 6 do T1 não tem imagem nenhuma, e por isso o painel some
(`panels.ts:144-146`). **Para o T3:** se algum modelo não tiver imagem, os dois
lados (painel e geração) precisam saber.

### #12 — Divergência entre nome de slot e id de elemento no spec

**Onde:** `template-02/index.ts:670-677`, `docs/template-02-integracao.md:198-200`.

O slot `cover.cta` nascia **vazio** porque no spec o texto é o elemento
`cover.ctaText`. Existe o mapa `SPEC_ELEMENT_ID` para esse tipo de divergência.

### #13 — Preview de template montado por concatenação

**Onde:** `CreateWizard.tsx:305-310`.

> *"Mapa EXPLÍCITO, e não caminho montado por concatenação — string montada
> esconde o preview trocado entre dois templates, que é o erro que ninguém
> percebe olhando o diff."*

### Contradições encontradas entre documento e código

**(a) O `Template01ModelPicker` foi ou não migrado para o picker genérico?**

- `docs/template-02-integracao.md:244-246` (S3): *"**Picker generalizado, T1 NÃO
  migrado.** (…) o `Template01ModelPicker` continua como está porque migrá-lo
  quebraria o gate de 'Template 1 com diff vazio'. A troca é de ~10 linhas.
  Dívida declarada, não esquecimento."*
- `docs/template-02-integracao.md:355` (S6): *"`Template01ModelPicker` passou a
  compor o picker genérico; não há mais dois fluxos de confirmação."*

**Vale hoje o S6.** `Template01ModelPicker.tsx:11` importa `TemplateModelPicker` e
`:54` o compõe. O arquivo inteiro tem 75 linhas e não desenha nada sozinho. A
dívida do S3 foi paga; o texto do S3 ficou no documento sem correção.

**(b) A pendência #2 (`template_model` do T1) foi ou não resolvida?**

`docs/template-02-integracao.md:364-366` lista como pendência aberta. **Vale
hoje o documento: o bug continua vivo** — `CreateWizard.tsx:1224` não grava
`template_model`. Ver armadilha #4.

**(c) "Nenhuma migração nova" para o T2.**

`docs/template-02-integracao.md:57-62` diz que o T2 não precisaria de migration.
Isso está **parcialmente errado, e o próprio documento se corrige**: o S6
(`:356-357`) registra a `allow_template02_style`. A frase de `:57` vale para
**colunas** (nenhuma nova); o **CHECK CONSTRAINT** precisou mudar. O documento
pede para não aceitar a frase de cara (`:61-62`) — e a ressalva estava certa.

---

## 5. COMPATIBILIDADE

### Por que nenhum deck antigo pode quebrar

A base pagante é pequena, mas cada carrossel salvo é trabalho de um usuário, e o
render é reconstruído a cada abertura a partir de `slides` + `carousels`. Um
default novo que mude a leitura muda **retroativamente** o que a pessoa vê.

O princípio está escrito em `template-01/overrides.ts:70-78`: os overrides por
papel continuam existindo como camada de baixo porque *"decks salvos antes desta
rodada gravaram override por papel, e apagá-los mudaria retroativamente o
carrossel de quem já editou."*

### O mecanismo: ausência é significativa

`20260804_template01_model.sql:18-20`:

> *"🔴 Compatibilidade: NULL em todo deck já salvo, de propósito. O código lê a
> ausência e volta a derivar o modelo da posição (`template01ModelOf`), então
> carrossel antigo reabre idêntico sem nenhum backfill."*

E `slide-mapper.ts:62-63`: *"Deck salvo antes da coluna existir vem sem isto — e
tem de continuar vindo: é a ausência que faz o modelo voltar a sair da posição."*

Isso se repete em `types/index.ts:355-357` (`templateModel`),
`slide-mapper.ts:136-137` (formato ausente ⇒ `'4:5'`) e
`template01ModelOf`/`template02ModelOf`.

**Regra geral: campo novo nasce opcional, e a AUSÊNCIA reproduz o comportamento
velho.** Nunca backfill.

### Onde um estilo novo PODE quebrar um antigo

**1. O CHECK de `slides.template_model` — `between 1 and 6`.**

`supabase/schema.sql:204` e `20260804_template01_model.sql:27-28`:
```sql
check (template_model is null or template_model between 1 and 6)
```

O T2 passou por sorte: tem 3 modelos. **Se o T3 tiver 7 ou mais modelos, todo
INSERT de slide falha** — e falha no autosave, depois de o usuário já ter
editado. É o defeito exato que a migration do T2 conserta para `style`
(`20260805230441:3-5`: *"as constraints ainda terminavam em `template01`, fazendo
o INSERT falhar antes de salvar os slides"*), esperando para acontecer de novo
num campo diferente. **É o achado mais acionável deste estudo.**

**2. O CHECK de `style` em DUAS tabelas.** `carousels_style_check` e
`templates_style_check` (`schema.sql:127` e `:277`). Esquecer `templates` deixa
o carrossel salvar e a gravação como template falhar.

**3. Os TRÊS lugares que repetem a lista de estilos.** `supabase/schema.sql`, a
migration nova, **e `lib/database-schema.ts`** (`:127`, `:144`, `:273`) — que é o
schema de instalação usado pelo setup. `tests/template-02-database.test.ts:18-23`
existe justamente para travar os três alinhados.

**4. Os quatro ternários de render que o `tsc` não protege** (passo 7). Um estilo
esquecido cai no `MinimalistSlide`. No `HiddenSlides` isso significa PNG errado
com editor certo.

**5. `lib/refine-text.ts:52`** — `satisfies` não exige exaustividade.

**6. Defaults compartilhados.** `DEFAULT_SLIDE`, `DEFAULT_GLOBAL_SETTINGS`,
`DEFAULT_IMAGE_POSITION` (`types/index.ts`) são lidos por todos os estilos.
Mexer num deles para acomodar o T3 muda os quatro existentes. `slide-mapper.ts`
tem defaults literais embutidos (`:30` — `{ x: 50, y: 50, zoom: 175 }`; `:41` —
`'#111111'`; `:45` — `{ title: 70, description: 36 }`) que valem para **todo**
deck relido.

**7. Colunas novas.** Se o T3 precisar de uma, `slide-mapper.ts:117-120` já usa
spread condicional — o padrão a seguir, para o autosave dos outros estilos não
quebrar antes de a migration rodar.

**8. `panels.ts:137` é `Record<SlideStyle, …>` obrigatório.** `minimalist` tem
config própria e não um `default` implícito, *"porque continua existindo em
carrossel salvo"* (`panels.ts:134-136`). O T3 não pode reaproveitar a config de
outro estilo por descuido.

---

## 6. A MIGRATION

### O que já existe e NÃO precisa ser recriado

`slides.template_slots`, `slides.template_model`, `slides.template_overrides`,
`slides.template_slot_styles` (`supabase/schema.sql:188-194`). Elas **não são do
Template 1** — `lib/slide-mapper.ts` as escreve para qualquer estilo. Confirmado
lendo o mapper (`:117-120`) e o schema, como
`docs/template-02-integracao.md:61-62` manda fazer.

O `templateOverrides` global e o `templateCornerStyle` serializam dentro de
`carousels.global_settings` (jsonb), **sem coluna nova** —
`slide-mapper.ts:138-139` e `types/index.ts:395-400`.

### O SQL que um estilo novo exige

Formato seguido: `supabase/migrations/20260805230441_allow_template02_style.sql`.

⚠️ **Isto é EXEMPLO, com o nome fictício `template03`.** Nenhum arquivo foi criado
em `supabase/migrations/` — o nome real do estilo não existe ainda, e **migration
em produção é do Rafael**.

Nome do arquivo, no padrão datado do diretório:
`supabase/migrations/AAAAMMDDHHMMSS_allow_template03_style.sql`

```sql
-- TEMPLATE 3: libera o novo estilo nas duas tabelas que armazenam carrosséis.
--
-- A aplicação persiste `style = 'template03'`, mas as constraints ainda
-- terminam em `template02`, o que faz o INSERT falhar antes de salvar os
-- slides. A nova lista é um superset da anterior e preserva todos os valores
-- existentes.
--
-- Idempotente: pode rodar mais de uma vez.

alter table public.carousels drop constraint if exists carousels_style_check;
alter table public.carousels add constraint carousels_style_check
  check (style in ('minimalist', 'profile', 'editorial', 'template01', 'template02', 'template03'));

alter table public.templates drop constraint if exists templates_style_check;
alter table public.templates add constraint templates_style_check
  check (style in ('minimalist', 'profile', 'editorial', 'template01', 'template02', 'template03'));
```

### E — SÓ SE o T3 tiver mais de 6 modelos — o CHECK do modelo

Ver seção 5, item 1. Se e somente se `TEMPLATE_03_MODELS.length > 6`:

```sql
-- O teto de `template_model` foi escrito quando o único template de spec tinha
-- 6 modelos (ver 20260804_template01_model.sql). O Template 3 tem N, e com o
-- teto antigo todo slide de modelo > 6 falha no INSERT — no autosave, depois de
-- o usuário já ter editado.
--
-- O CHECK continua existindo (em vez de ser removido) porque ele é o que impede
-- um número de modelo inválido de chegar ao render, onde viraria clamp
-- silencioso para o primeiro modelo.

alter table public.slides drop constraint if exists slides_template_model_check;
alter table public.slides add constraint slides_template_model_check
  check (template_model is null or template_model between 1 and <N>);
```

`<N>` = o maior número de modelos entre os templates de spec. **Alargar o teto
não invalida nenhuma linha existente** (todo valor atual é NULL ou 1–6).

### Os DOIS schemas de instalação têm de andar junto

`supabase/schema.sql:127`, `:144`, `:277` **e** `lib/database-schema.ts:127`,
`:144`, `:273`. `tests/template-02-database.test.ts:18-23` trava os dois
alinhados com a migration, e o teste equivalente do T3 tem de existir.

### O que NÃO fazer

- **Nenhum backfill.** A ausência é o mecanismo de compatibilidade (seção 5).
- **Não mexer** em RLS, `consume_credits`, webhook de pagamento,
  `delete-carousel`, proxy anti-SSRF.
- **Não rodar a migration.** Migration em produção é do Rafael.

---

## 7. A MATRIZ DE TESTES

### O que existe hoje

**15 arquivos** casando com `tests/template-0{1,2}*` — o número do enunciado bate
exatamente. Mais 2 suítes transversais que também travam comportamento de
template (`templates-margem.test.tsx`, `wizard-template-preview.test.tsx`), e ao
menos 8 suítes que citam os templates de passagem (`batch-targets`,
`cantos-tamanho`, `dashboard-renderiza`, `estudio-pele`, `export-blindagem`,
`ia-gerar-todos-slides`, `image-shape`, `image-surface`, `sidebar-identidade`,
`carousel-duplicate`).

| suíte | o que trava hoje |
|---|---|
| `template-01.test.tsx` (53 KB, 12 blocos) | spec, conteúdo, **nenhum texto ilustrativo do Figma num deck gerado**, render, reflow, faixa dupla do slide 5, overrides do editor, **geração não produz override**, **cada controle da barra tem efeito no render**, desvios deliberados do Figma, alinhamento por coluna, estilo por slot |
| `template-01-formato.test.tsx` | **4:5 é no-op**, horizontal intocável, proporção da banda, **margem absoluta não escala**, centro compartilhado no slide 5, palco segue o formato |
| `template-01-fundo.test.tsx` | sem marca ⇒ fundo do spec; com marca ⇒ cor escolhida manda; **restaurar volta ao spec**; o painel na barra |
| `template-01-imagem.test.tsx` | painel de imagem |
| `template-01-modelo.test.tsx` | **modelo é dado do slide**, render por modelo, slide novo com lorem, imagem preenche sem deformar, cabeçalho por slide, **persistência do modelo** |
| `template-01-slot-styles-persistencia.test.ts` | ida e volta de `templateSlotStyles` |
| `template-02.test.tsx` (27 KB, 11 blocos) | spec, fontes, **modelo é dado, não posição**, slots, slide novo, medição, capa, internos, cabeçalho, formato, integração no editor |
| `template-02-editor.test.tsx` | **imagem tem uma verdade só**, estilo por slot, fundo, ajuste de imagem, cabeçalho é do slide, painéis, restaurar |
| `template-02-barra.test.tsx` | painéis na tela, conteúdo, cantos, imagem, estilo e restauração |
| `template-02-criacao.test.tsx` | modelo do deck gerado, **a geração não deixa copy do spec**, contrato da IA cabe no desenho, adicionar slide, addendum |
| `template-02-canvas.test.tsx` | popup de modelo do T2 **e** *"o popup do T1 continua o de sempre"* |
| `template-02-persistencia.test.tsx` | **ida e volta do banco**, preview do editor e do dashboard |
| `template-02-wizard.test.tsx` | o T2 no wizard |
| `template-02-database.test.ts` | **o CHECK da migration e os dois schemas de instalação alinhados** |
| `template-02-ajustes-rafael.test.tsx` | cabeçalho por slide; degradê; headline não sobrepõe nem invade o CTA; **limites medidos na caixa real**; marcador com vários termos; cor do marcador |
| `templates-margem.test.tsx` | a margem empurra o bloco nos **dois** templates + o slider na barra |
| `wizard-template-preview.test.tsx` | os previews aparecem, peso/estabilidade do carregamento, **fallback para miniatura viva**, seleção e acessibilidade |

### A matriz que o T3 vai precisar

Derivada por transposição direta. Marquei **[C]** o que é regra de
compatibilidade e **[N]** o que é específico da forma nova.

**A. Spec e contrato** — arquivo sugerido `tests/template-03.test.tsx`
1. o `spec.json` é lido, não redigitado: limites vêm do spec (molde:
   `template-02-criacao.test.tsx:288`, "os limites são LIDOS")
2. `TEMPLATE_03_MODELS` sai do spec, não de um literal
3. todo slot de `SLOT_DEFS`/varredura tem descritor com `kind`, `label` e
   `defaultValue`
4. **[N]** os desvios do gabarito estão declarados em
   `TEMPLATE_03_DESIGN_TWEAKS` com o valor original ao lado

**B. Modelo é dado, não posição** — molde: `template-02.test.tsx:151`
5. **[C]** slide **sem** `templateModel` deriva da posição pela sequência do spec
6. slide **com** `templateModel` ignora a posição
7. **[C]** reordenar slides **não** troca o desenho de nenhum deles
8. `template03ModelOf` com modelo inválido cai no fallback sem lançar

**C. Slots**
9. **[C]** slot **ausente** ⇒ texto de fábrica do spec
10. **[C]** slot presente e **vazio** ⇒ vazio de verdade (não o texto de fábrica)
11. ida e volta pelo `slide-mapper` preserva `templateSlots` byte a byte
12. **[C]** slot órfão (chave que não existe mais no spec) não quebra o render
13. **deck gerado não contém nenhuma copy ilustrativa do spec** — molde:
    `template-01.test.tsx:145` e `template-02-criacao.test.tsx:118`

**D. Imagem — uma verdade só** — molde: `template-02-editor.test.tsx:106`
14. `template03SetImage` escreve no slot **e zera** os três genéricos
15. `template03ClearImage` limpa os dois lados
16. a leitura é **só** o slot — genérico preenchido **não** aparece
17. gerar por IA depois de upload manual **muda** a tela
18. **[N]** modelo sem imagem (se houver): o painel some e a geração não cobra —
    molde: `useGenerateCarouselImages.tsx:186-194` e `panels.ts:144-146`

**E. Overrides**
19. **a geração não produz override** — molde: `template-01.test.tsx:631`
20. `templateOverrides` nasce **ausente** num deck gerado
21. a paleta da marca **não** pinta por cima do fundo do spec
22. **restaurar** devolve ao spec — molde: `template-01-fundo.test.tsx:184`
23. cada controle da barra tem efeito no render — molde:
    `template-01.test.tsx:716`

**F. Formato (4:5 · 1:1 · 9:16)** — molde: `template-01-formato.test.tsx`
24. **o 4:5 é no-op** (nenhuma conta muda 1px)
25. margens são absolutas e **não escalam** no 9:16
26. **[N]** o que o T3 ancora ao rodapé continua à mesma distância absoluta
27. a margem empurra o bloco para dentro — molde: `templates-margem.test.tsx`

**G. Barra lateral**
28. os painéis do T3 aparecem na ordem de `TEMPLATE_SIDEBAR_CONFIG`
29. `restaurarTemplate` é o **último** do grupo
30. o contador de limite fala a língua do limite do slot (linhas × caracteres, ou
    total) — molde: `template-02-barra.test.tsx:106`
31. o seletor de cor abre com a cor **do spec**, não com um padrão do editor
32. o painel usa o **modelo**, nunca `activeSlideIndex + 1` — molde:
    `panels.ts:59-62`

**H. Criação**
33. o card aparece no wizard com o nome de produto certo
34. o wizard pula o passo de identidade visual (se o T3 for de spec)
35. **`editorSlides` e `slidesPayload` concordam** — em especial que a linha do
    banco carrega `template_model`. ⚠️ **É o teste que o T1 não tem** (armadilha
    #4)
36. o picker de modelo cria o slide com `templateModel` e os slots do modelo —
    molde: `template-02-canvas.test.tsx:65`
37. **[C]** *"o popup dos outros templates continua o de sempre"* — molde:
    `template-02-canvas.test.tsx:140`

**I. Persistência** — molde: `template-02-persistencia.test.tsx`
38. ida e volta do banco preserva slots, modelo, overrides e slot styles
39. **[C]** deck **sem** `template_model` no banco reabre idêntico
40. o preview do dashboard desenha o T3, não o `MinimalistSlide`

**J. Banco** — molde: `template-02-database.test.ts` (o molde mais barato e mais
valioso: lê os arquivos SQL como texto, sem banco)
41. a migration nova derruba e recria os **dois** CHECKs
42. `supabase/schema.sql` **e** `lib/database-schema.ts` batem com a migration
43. **[N] SÓ SE > 6 modelos:** o CHECK de `template_model` cobre o maior modelo
    do T3 — **este é o teste que ninguém escreveu ainda, e o que pega a armadilha
    da seção 5**

**K. Exportação** — molde: `docs/template-02-integracao.md:250-269`,
`tests/export-blindagem.test.tsx`
44. `slideImageUrls` devolve as URLs dos slots do T3
45. `HiddenSlides` renderiza o `Template03Slide` (não o fallback minimalista)
46. **[N]** se o T3 usar face nova: ela sai embutida como `data:` URI e **nenhuma
    URL remota sobra**

**L. Refino de texto**
47. `refinableFields` devolve os slots de texto do **modelo** do slide
48. `'template03'` está em `STYLES` (`refine-text.ts:52`) — ⚠️ o `tsc` **não**
    protege isto, então o teste é a única rede

**M. Regressão dos estilos existentes** — **[C]**
49. os 4 estilos anteriores continuam com os mesmos painéis
50. um deck `template01` e um `template02` renderizam idênticos antes e depois

### Gate (o mesmo que o T2 usou — `docs/template-02-integracao.md:368-374`)

- `npm test -- --run` verde, e o número de testes **sobe**;
- `npx tsc --noEmit` limpo;
- `spec.json` e `.claude/skills/` intocados;
- relatório separando o que foi **verificado de fato** do que foi **presumido**.

⚠️ Ao rodar a suíte, excluir `.claude/worktrees` — sem `--exclude` aparecem
centenas de falhas fantasma vindas das árvores de trabalho paralelas.

---

## Resumo do que eu não achei

- **Não achei** nenhuma abstração "registre um template aqui" que centralize os
  ~14 pontos de edição. O acoplamento é por `if (style === …)` e por três
  `Record<SlideStyle, …>`. Um registry de estilos (à la `panels.ts`, mas para
  render, wizard e imagem) reduziria os quatro ternários não protegidos a um mapa
  exaustivo — **mas isso é refatoração de código existente e está fora do
  bloqueador desta task; não toquei.**
- **Não achei** teste que trave o CHECK `template_model between 1 and 6` contra o
  número de modelos de nenhum template. É o furo da seção 5, item 1.
- **Não achei** onde `carousels.style` é validado no cliente antes do INSERT —
  a validação parece ser só o CHECK do banco. Se for o caso, o erro de estilo não
  liberado chega ao usuário como falha de salvamento, que é o sintoma descrito em
  `20260805230441:3-5`.
- **Não achei** o renderizador de referência do T3 (obviamente — ele vem com o
  material do Rafael). Os dois anteriores são `render.py` (T1) e `generate.py`
  (T2), em `.claude/skills/`.

## O que falta do Rafael para a TASK 3 destravar

1. o **spec** (e o renderizador de referência, se houver);
2. o **nome de produto** do card do wizard (`CreateWizard.tsx:228-252` — os
   atuais são "Profile", "Atelier", "Manifesto", "Radar");
3. o **preview** `.webp` 540×675 para `public/templates/`
   (`CreateWizard.tsx:316, 328`) — ou a decisão de entrar como `null` e usar a
   miniatura viva;
4. **quantos modelos** o T3 tem — decide se a migration precisa do segundo bloco
   (seção 6);
5. **deck fechado ou aberto** — decide se entra em `isFixedDeck`
   (`CreateWizard.tsx:834`).

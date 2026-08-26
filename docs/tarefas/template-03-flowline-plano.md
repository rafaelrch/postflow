# TASK 3 — Template 3 "FlowLine" — plano técnico e brief do Builder

Tech Lead, 24/08/2026. Árvore `postflow--main`, branch `feat/cretools-atualizacoes`.
Base obrigatória de leitura: `docs/tarefas/template-novo-estudo.md` (a receita
completa, os 14 pontos de edição, as 13 armadilhas já pagas e a matriz de testes).
Este documento NÃO substitui aquele — ele fecha as decisões que faltavam.

Material do Rafael: `/Users/rafaelrocha/Downloads/creatools-flowline/`
(`template-flowline.spec.json`, `SKILL.md`, `REFERENCIA-SLOTS.md`, `render.py`,
`extract_spec.py`, `fonts/`, `reference/slide{1..4}.png`, `exemplos/`).

---

## 0. GATE DE MATERIAL — fechado

| item pedido | estado |
|---|---|
| spec / Figma | ✅ `template-flowline.spec.json` (78 KB) + `flowline-figma-file.json` |
| modelos, slots, fontes, dimensões, assets | ✅ 44 slots em `slotIndex`; 1080x1350; 6 fontes |
| nome do produto | ✅ **FlowLine** (`SKILL.md`) |
| referência visual | ✅ `reference/slide{1..4}.png` + `exemplos/deck-final.html` |
| quantidade de modelos | ✅ **2** — ver §1 |
| deck fechado ou aberto | ✅ **ABERTO** — ordem do Rafael, 24/08: "não tem uma quantidade específica de slides, ele pode ter quantos slides o usuário quiser" |
| preview .webp 4:5 540x675 ≤120KB | ✅ **derivado por mim** de `reference/slide1.png`: 540x675, 12.276 bytes. Está no scratchpad, o Builder copia para `public/templates/preview-template03-4x5.webp`. Rafael pode trocar depois se quiser outra capa — trocar o arquivo não mexe em código |

Nada falta. A implementação está liberada.

### Achados do gate (conferidos na fonte, não presumidos)

1. **As 6 fontes são byte-idênticas às que o app já serve.** `md5` de
   `fonts/*.woff2` bate com `public/fonts/template-01/*.woff2` nos seis arquivos.
   ⇒ **zero `@font-face` novo**, e a armadilha #5 do estudo (`'IvyOra Text'` na
   pilha) continua valendo: a pilha serifada é `'ivyora-text', 'T01Serif', serif`.
2. **`template.id` do spec diz `"template-01"`** — bug de cópia do
   `extract_spec.py`. O `spec.json` entra VERBATIM (gate do estudo) e o módulo
   **não pode ler `template.id`**; registrar em `TEMPLATE_03_DESIGN_TWEAKS`.
3. **`REFERENCIA-SLOTS.md` está desatualizado**: lista `sN.divider`, que **não
   existe** no `slotIndex`. O que existe é `sN.dots` e `sN.image`. **A verdade é
   o `spec.json`**, não o markdown.
4. **O CHECK do banco (`template_model between 1 and 6`) NÃO precisa de
   migration**: o FlowLine tem 2 modelos. A bomba do estudo (§5.1) não explode
   nesta task.
5. O spec já traz `backgroundLayers` com `type: "IMAGE_SLOT"` e `slot: "sN.image"`
   por slide, exatamente na forma que o T1 consome — o slot de imagem sai de graça.

---

## 1. DECISÕES FECHADAS

### 1.1 Estilo e nome
- `SlideStyle` ganha `'template03'`. Nome de produto no wizard: **FlowLine**.
- Card: `short` = "Deck aberto: capa + conteúdo independente";
  `detail` = "Forma fixa do Figma, deck aberto: capa e slides de conteúdo
  independentes."

### 1.2 Dois modelos, não quatro
`TEMPLATE_03_MODELS = [1, 2]`:
- **modelo 1 — capa**: título 113px, corpo de apoio, barra de perfil, cantos, dots;
- **modelo 2 — conteúdo**: título 92px, corpo, mesma barra.

Os slides 3 e 4 do spec têm o MESMO scrim (`180deg, transparent 10.2963% → #000`)
e a mesma estrutura de nós do slide 2; só o `tituloY` muda. Modelo é a FORMA, e a
forma dos conteúdos é uma só. `template03ModelAt(position)` ⇒ posição 1 = 1, demais = 2.

⚠️ Armadilha #2 do estudo: **modelo é dado do slide**
(`template03ModelOf(slide, position)`), nunca `activeSlideIndex + 1`.

### 1.3 O padrão dinâmico — o `tituloY` CICLA
`designSystem.dynamicPattern.tituloY`: capa 702; conteúdos 358 → 536 → 750.
Deltas 178 e 214, não lineares, e o spec só diz "repetir o layout de conteúdo com o
título em nova posição Y".

**Decisão: os conteúdos ciclam a tabela [358, 536, 750]** — conteúdo 4 volta a 358,
conteúdo 5 vai a 536, e assim por diante. Motivo: continuar somando estoura o canvas
(750 + ~215 = 965, e um título de 3 linhas a 92px ocupa ~277px + corpo ⇒ passa de
1350); travar no 750 mata a "sensação de avanço" que é a ideia do template.
Ciclar preserva o ritmo em grupos de três e **nunca estoura**.

O gradiente acompanha o modelo, não a posição: capa usa o scrim do slide 1 do
spec; todo passo usa o scrim do slide 3 (`180deg`), que é o dos passos 2 e 3 —
o `358.75deg` do slide 2 é do MESMO passo em outra direção e fica registrado em
`TEMPLATE_03_DESIGN_TWEAKS` como desvio deliberado (um deck aberto com scrim
alternando por paridade pisca; um só sentido é o que o Rafael vê hoje na
referência).

Isto é decisão de produto reversível em uma constante — está em TODO-RAFAEL para
ele confirmar ou pedir outra.

### 1.4 Dots calculados, nunca copiados
O `SKILL.md` documenta o bug de autoria do arquivo Figma (slides 3 e 4 acendem o
2º ponto). Os slots `sN.dots` do spec são **ignorados como texto**: o componente
desenha "ponto N aceso de M total" a partir de `position` e do tamanho do deck.
Isso é o que faz o deck aberto funcionar. Teste obrigatório: deck de 7 slides
acende o 7º ponto no último slide.

### 1.5 Imagem — uma verdade só
`lib/templates/template-03/image.ts` no molde do **T2**, nunca do T1
(armadilha #1): escrita no slot **e zera os genéricos**; leitura **só do slot**.
Template novo não tem deck antigo — não pode nascer com a dívida de fallback.
- `template03ImageSlot(model)` ⇒ `s{model}.image`… **atenção**: a chave do slot no
  spec é por SLIDE (`s1..s4`), não por modelo. Ver §1.6.
- `ImageShape` = `full-bleed` (1080x1350, texto por cima). Nenhuma quarta forma.
- `ImageSurface` = `dark` nos dois modelos (o scrim termina em preto puro e todo
  o texto é branco/cinza claro).

### 1.6 🔴 A NORMALIZAÇÃO DAS CHAVES — o ponto mais delicado da task
O spec indexa slots por número de SLIDE (`s1.title`, `s2.title`, `s3.title`, …).
Num deck ABERTO isso não serve: o slide 9 não tem `s9.title` no spec.

**Regra: a chave gravada no banco é por MODELO, não por slide.**
- modelo 1 (capa) ⇒ `s1.*` (`s1.title`, `s1.body`, `s1.handle`, `s1.image`, …);
- modelo 2 (conteúdo) ⇒ `s2.*` para TODOS os slides de conteúdo, qualquer que seja a posição;
- os cantos são globais no próprio spec (`cantos.left` / `cantos.right`) e
  continuam globais.

Os nós dos slides 3 e 4 do spec entram só como CONFERÊNCIA da forma do conteúdo
(mesma caixa, mesma tipografia) — os slots `s3.*`/`s4.*` **não viram chave nova**.
Escrever isso no cabeçalho do módulo: a chave do slot é irrevogável depois do
primeiro deck salvo (estudo §3).

O `slotIndex` do spec traz `maxLines`/`maxCharsPerLine` por slide; para o modelo
"conteúdo" adotar os limites do **`s2.*`** (3 linhas / 22 caracteres no título,
2 linhas / 93 no corpo) — o mais apertado dos três layouts de conteúdo, para o texto caber em
qualquer altura do ciclo. Limites **lidos do spec**, nunca redigitados.

### 1.7 Formatos
`SlideFormat` é do carrossel e o wizard pergunta no passo 1 — o FlowLine tem de
responder aos três. Largura 1080 é comum; só a altura muda.
- **4:5 é no-op** (armadilha #7 — se mudar 1px no 4:5, a regra está errada);
- cantos e dots: distância **absoluta** às bordas, não escalada;
- o bloco título+corpo: `tituloY` **proporcional à altura** (`y * h / 1350`),
  porque a descida progressiva é uma proporção do canvas, não uma margem.
Teste espelhando `tests/template-01-formato.test.tsx`.

### 1.8 Cabeçalho (avatar + handle + badge)
- `sN.handle` é texto editável, pré-preenchido com o handle do perfil, **por
  slide** (é o que os testes "cabeçalho é do slide" do T2 travam);
- `sN.avatar` é slot de **imagem**, pré-preenchido com a foto de perfil do
  onboarding quando existir; sem foto, a elipse sólida `#DA4F4F` do spec;
- o badge verificado é SVG desenhado pelo componente (`#3897F0`), não asset —
  não é editável e não é slot de conteúdo.

### 1.9 Banco
Só a migration de `style`, no molde de `20260805230441_allow_template02_style.sql`:
`carousels_style_check` **e** `templates_style_check`, idempotente, superset.
Junto e obrigatoriamente alinhados: `supabase/schema.sql` e `lib/database-schema.ts`
(os TRÊS lugares — estudo §5.3), travados por `tests/template-03-database.test.ts`.
**Nenhum backfill. Não executar a migration** — produção é do Rafael.

---

## 2. FATIAS — ordem de execução

Cada fatia termina com `npx tsc --noEmit` limpo e os testes dela verdes, e é
reportada ao Tech Lead antes da seguinte.

**S1 — fundação.** `spec.json` verbatim em `lib/templates/template-03/`;
`'template03'` no `SlideStyle`; consertar os 3 `Record<SlideStyle, …>` que o
`tsc` quebra (`panels.ts:137`, `CreateWizard.tsx:316`, `refine-text.ts:393`) e o
`STYLE_SET` de `refine-text.ts` (que **não** quebra); `index.ts` do módulo com
todos os símbolos da tabela do estudo §1 passo 2, mais `template03ModelAt`,
`template03NextModel`, `template03TituloY(stepIndex)` e `TEMPLATE_03_DESIGN_TWEAKS`.
Testes: spec lido e não redigitado, modelos, descritores, normalização de chave (§1.6).

**S2 — o desenho.** `components/slides/Template03Slide.tsx`, porte do `render.py`
do material (não adaptação do T1 nem do T2 — o estudo §1 passo 3 proíbe).
Cobrir: scrim de FAIXA (os stops já vêm reprojetados em `cssStopsPercent` —
conferir que o degradê não estica), dots calculados, avatar/badge, tipografia
travada (lh 100.5% título / 109.14% corpo; ls -0.06 / -0.03 / -0.05 / +0.17 em),
`tituloY` cíclico, e **nenhum bloco com `height` fixo derivado do `lineHeight`**
(armadilha #6). Formatos 1:1 e 9:16. Testes de render, overflow e formato.

**S3 — editor.** `Template03Slots.tsx` (molde `Template02Slots.tsx`), braço em
`EditorSidebar.tsx`, entrada em `TEMPLATE_SIDEBAR_CONFIG` com `restaurarTemplate`
SEMPRE por último; `overrides.ts` (override é MARCA, nunca comparação de valor —
armadilha #3); `image.ts`; os **quatro** despachos de render que o `tsc` NÃO
protege — `SlidePreview.tsx`, `HiddenSlides.tsx`, `DashboardClient.tsx`,
`SlideCanvas.tsx` (esquecer o `HiddenSlides` = editor certo e PNG errado);
popup de modelo inline, no caminho barato do T2.

**S4 — criação.** `CreateWizard.tsx`: `templateFieldsForSlide`, `isSpecTemplate`,
`SKIP_VISUAL_STEP`, card em `TEMPLATES`, `FIXED_VISUAL_STYLES`, `previewSlide`,
`TEMPLATE_PREVIEW` + o `.webp`, `editorSlides` **e** `slidesPayload` no mesmo
commit — e a linha do banco tem de carregar `template_model` (armadilha #4, viva
hoje no T1; não é escopo consertar o T1). Deck aberto: slider, sem `isFixedDeck`.
Teste: deck gerado não deixa NENHUMA copy ilustrativa do Figma (armadilha #8).

**S5 — IA e exportação.** `useGenerateCarouselImages` (slot, `imageShape`
full-bleed, `imageSurface` dark, patch por `template03SetImage`);
`refine-fields.ts`; `template03Addendum()` **no módulo do template**, consumido
por `app/api/generate-carousel/route.ts`; `'template03'` na condição de
`lib/export-images.ts:69`.

**S6 — banco, ponta a ponta e fechamento.** Migration + os dois schemas +
`tests/template-03-database.test.ts`; persistência ida-e-volta;
`npm test`, `npx tsc --noEmit`, `npm run build`, `git diff --check`;
e a validação no navegador do fluxo **criar → editar → salvar → reabrir →
exportar**, com o PNG exportado conferido contra `reference/`.

---

## 3. LIMITES

- Não tocar em `/admin`, `components/auth/AuthForm.tsx`, marketing protegido,
  `shooting-stars-grid`, nem no dedupe do webhook do Stripe.
- Nada de refatoração ampla: a TASK 10 (unificar `slidesPayload`) é outra task e
  depende de autorização do Rafael.
- Não alterar `template-01/*`, `template-02/*` nem os testes deles. Se um teste
  existente quebrar, isso é achado — reportar, não "consertar" o teste.
- `spec.json` e o material do Rafael entram intocados; desvio vai em
  `TEMPLATE_03_DESIGN_TWEAKS`.
- Nenhum commit, push, merge ou deploy. Nenhuma migration executada.
- Nenhum segredo em nota, log ou código.

---

## 4. CORREÇÕES AO PLANO (Tech Lead, 25/08) — estas mandam sobre o texto acima

Três pontos do plano original não sobreviveram ao contato com o código. Ficam
aqui com o motivo, em vez de o texto errado ser apagado.

### 4.1 §1.7 estava incompleta: o proporcional puro COLIDE no 1:1

A regra "tituloY proporcional à altura" foi escrita por mim e não fecha no 1:1.
A aritmética: no 1:1 a altura cai 270px, os dots sobem os mesmos 270 (são
absolutos ao rodapé, como o plano manda) e o bloco sobe só `270 × tituloY / 1350`.
O bloco desce sobre os dots.

Medido pelo Builder no portal, com as fontes do app e o conteúdo de exemplo do
próprio material — não é o pior caso dos limites:

| | base do bloco | topo dos dots | folga |
|---|---|---|---|
| capa | 952,69 | 914 | **-38,69px** |
| passo mais fundo | 1006,02 | 914 | **-92,02px** |

4:5 e 9:16 sobram com margem. Só o 1:1 colide.

**DECISÃO: opção (B) — teto.** O bloco continua proporcional, MAS a base nunca
passa do topo dos dots menos o vão do spec. No 4:5 o teto **nunca engata** (a
régua contra o gabarito continua intacta, e o teste de no-op prova isso); no 1:1
a colisão acaba. Custo aceito: no 1:1 os três passos do ciclo ficam mais perto
uns dos outros e a sensação de avanço encolhe **naquele formato**.

Motivo de não ser (A): texto por cima dos dots não é escolha de produto, é
defeito. Um teto que só engata onde a conta não cabe conserta o único formato
quebrado sem tocar no que já está certo.

### 4.2 §1.8 estava errada: o handle e os cantos são do DECK, não do slide

O plano dizia "por slide" e citava os testes do T2 como prova. O Builder foi ler
`tests/template-02-editor.test.tsx:350` e ele **não diz isso** — afirma que os
slots globais aparecem em todos os modelos, que o painel de conteúdo não repete
o cabeçalho, e que o painel do cabeçalho fica no grupo do slide. E o código do
T2 grava o cabeçalho no deck inteiro (`setT02HeaderText` → `setDeckSlotText`).

**Vale o código: o @ e os cantos são a assinatura do carrossel e valem para o
deck inteiro**, como no T1 e no T2. É o mesmo argumento que o Rafael deu para o
canto do T1: editar num slide só produz um deck com assinaturas diferentes por
página, e ninguém percebe até exportar. Cor e visibilidade continuam por slide.

Eu citei um teste de memória em vez de abrir o arquivo. O Builder abriu.

### 4.3 Dois painéis com o mesmo rótulo "Cantos"

`cantos` e `cabecalho` são ambos rotulados "Cantos" no `PANEL_REGISTRY`. Nunca
incomodou porque o T1 usa só o primeiro e o T2 só o segundo — o T3 usa os dois
no mesmo grupo. Resolvido com o `label` como função do ctx, mecanismo que já
existia: no `template03` o `cabecalho` vira **"Barra de perfil"**; em todo outro
estilo o rótulo de sempre continua byte a byte. Aprovado.

### 4.4 Escopo entre fatias

Mexer num arquivo criado numa fatia ANTERIOR da mesma task é escopo, não desvio
— foi o caso do `Template03Slide.tsx` na S3, sem o qual "restaurar volta ao spec"
seria promessa vazia. O que continua proibido é o template dos outros.

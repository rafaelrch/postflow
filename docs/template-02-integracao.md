# Template 2 — integração

Autor do plano: Tech Lead. Fonte: `.claude/skills/creatools-template-2/` (entregue pelo Rafael em
05/08/2026). Implementação: Builder, S1–S4, 05/08/2026.

**Estado: entregue e não commitado**, na branch `feat/template-02`. Da seção "Fatias" em diante este
documento deixou de ser plano e passou a ser o REGISTRO do que foi feito, com as decisões que
mudaram no caminho. Se você chegou aqui para mexer no Template 2, leia "Fidelidade", "Fatias" e
"Pendências" antes de tocar em qualquer coisa.

## Onde trabalhar

Worktree `.claude/worktrees/template-02`, branch `feat/template-02` (nasce de `feat/template-01`).
**Nunca** commitar em outra branch, nunca `git merge`, nunca `git push` — isso é do Rafael.

## Read-only (é a régua, não o material)

- `lib/templates/template-02/spec.json` — cópia verbatim do spec da skill
- `.claude/skills/creatools-template-2/**`
- `lib/templates/template-01/**`, `components/slides/Template01Slide.tsx` — Template 1 está entregue e
  não faz parte deste escopo. Se algo do T1 precisar mudar, **pare e avise**, não mexa.

Arquivos protegidos do projeto (diff tem de sair VAZIO):
`components/auth/AuthForm.tsx`, `lib/subscription.ts`, `app/(auth)/definir-senha/page.tsx`,
`lib/paid-signup-callback.ts`.

## O que o Rafael pediu, nas palavras dele

> todos os textos são editáveis. O usuário consegue inserir ou gerar a imagem de acordo com os
> templates. No template 2 e no template 3, que são esses padrões com fundo bege, a imagem na
> lateral é que o usuário consegue colocar nesse shape. Se o usuário quiser adicionar mais slides,
> ele vai alternar entre o modelo do slide 2 e o modelo do slide 3. Os textos serifados continuam
> sendo o IvyOra, mas o usuário pode alterar para qual ele quiser.

"template 2 e template 3" na fala dele = os MODELOS 2 e 3 (`content-left` / `content-right`).

## Arquitetura

### O spec do T2 não tem o formato do T1

O `spec.json` do Template 1 é um dump de nós do Figma (`slides[].nodes[]` com box, tipografia,
fills). O do Template 2 é uma descrição de tokens + layouts, e quem descreve o desenho de verdade
é o renderizador de referência `scripts/generate.py`. Então:

- **não** tente reusar `template01Nodes`, `template01Tops`, `template01FormatShift` etc.
- o `Template02Slide.tsx` é um **porte do `generate.py` para React**, do mesmo jeito que o
  `Template01Slide.tsx` é um porte do `render.py` do T1.
- o motor de reflow por âncora do T1 **não existe aqui**: o T2 centra o grupo título+corpo com
  flexbox (`justify-content: center` num container de `top:147 height:1089`). Isso já resolve
  crescimento de texto sozinho. Não invente âncora.

O que **é** para reusar do T1 é o encanamento de EDITOR, não o de desenho:
`Slide.templateSlots`, `Slide.templateModel`, `Slide.templateOverrides`,
`Slide.templateSlotStyles`, o registry `components/editor/sidebar/panels.ts`, e os componentes
de `components/editor/sidebar/`.

### Banco: nenhuma migração nova

As colunas `template_slots`, `template_model`, `template_overrides`, `template_slot_styles` já
existem e **não são específicas do Template 1** — `lib/slide-mapper.ts` as escreve para qualquer
estilo. **Confirme lendo o mapper e o `supabase/schema.sql`**, não aceite esta frase de cara. Se
descobrir que precisa de coluna nova, **pare e avise** — migração é decisão do Rafael.

### Estilo

`types/index.ts`: `SlideStyle` ganha `'template02'`. É uma união crua; o `tsc` vai apontar todo
lugar que precisa de braço novo (`Record<SlideStyle, …>` em `panels.ts`, `SlideCanvas`, etc.).
Trate cada erro do `tsc` como um item da checklist — não silencie com cast.

### Modelos

3 modelos, e o modelo é dado do slide (`Slide.templateModel`), **nunca a posição**:

| modelo | layout id | descrição |
|---|---|---|
| 1 | `cover` | capa preta, imagem de fundo + scrim, headline caixa-alta + marcador lime + pílula de CTA |
| 2 | `content-left` | fundo creme, texto à esquerda (x=85), imagem à direita (x=615) |
| 3 | `content-right` | espelho: imagem à esquerda (x=85), texto à direita (x=586) |

`template02ModelOf(slide, position)` — igual ao `template01ModelOf`: se `slide.templateModel` for
válido, vale ele. Senão (deck antigo / recém-gerado sem o campo) deriva da posição:
posição 0 → 1, e daí alterna 2, 3, 2, 3… É a `sequenciaPadrao` do spec.

Ao contrário do T1, o T2 **não tem número fixo de slides**. O deck padrão é 5.

### Slots

Chaves de `Slide.templateSlots`. São as mesmas do spec — não invente nomes novos, porque a chave
é o que fica gravado no banco de todo carrossel salvo.

| slot | modelo | tipo | rótulo na barra lateral |
|---|---|---|---|
| `cover.headline` | 1 | texto multilinha (`\n` = quebra manual) | Título |
| `cover.highlight` | 1 | texto curto | Destaque |
| `cover.cta` | 1 | texto | Chamada |
| `cover.image` | 1 | imagem (fundo full-bleed) | Imagem de fundo |
| `content.title` | 2, 3 | texto | Título |
| `content.body` | 2, 3 | texto, parágrafos separados por `\n\n` | Descrição |
| `content.image` | 2, 3 | imagem (bloco 380×1089) | Imagem |
| `header.category` | todos | texto, GLOBAL do deck | Categoria |
| `header.handle` | todos | texto, GLOBAL do deck | @ do perfil |

`content.*` repete entre os slides de conteúdo, e isso está certo: `templateSlots` é por slide,
então não há colisão. Só `header.*` é global — trate igual aos `cantos.*` do T1 (edita uma vez,
propaga para o deck; o spec permite override por slide, mas **não** implemente isso agora, é
escopo extra).

Limites de texto: leia de `regrasDeGeracao.limitesDeTexto` no spec. Não redigite os números.

### Fontes — desvio deliberado do spec

O spec troca a IvyOra Text por **Newsreader** e o motivo está escrito lá:
*"IvyOra Text é fonte comercial (Ivy Foundry). Precisa de licença de webfont"*.

**Esse motivo não vale mais.** O Rafael tem a licença e o projeto web do Adobe Fonts já está
carregado (`<link href="https://use.typekit.net/edr7www.css">` em `app/layout.tsx`), servindo a
família `ivyora-text`. Ele pediu explicitamente que o serifado do T2 seja IvyOra.

Então o `slideTitle` usa a mesma pilha do Template 1:

```ts
"'ivyora-text', 'T01Serif', serif"
```

⚠️ **Nunca escreva `'IvyOra Text'` nessa pilha.** O app declara um `@font-face` com esse nome que
resolve só por `local()`; quando não acha nada, o Chrome trata a família como definida-e-vazia e
pula direto para a `serif` genérica (Georgia) em vez de cair no `T01Serif`. Medido: 334px contra
305px. Já queimamos uma sessão nisso — o comentário está no topo do `Template01Slide.tsx`.

`display`/`body`/`ui` usam as faces já embutidas: `'T01Inter'` e `'T01InterDisplay'`
(ver `app/globals.css`). Não acrescente `@font-face` novo.

Registre o desvio num `TEMPLATE_02_DESIGN_TWEAKS` com o valor original do spec anotado ao lado,
no mesmo espírito do `TEMPLATE_01_DESIGN_TWEAKS`. O `spec.json` fica intocado.

O usuário pode trocar a fonte de qualquer bloco pelo painel "Estilo do texto" — isso sai de graça
do `templateSlotStyles`.

### Adaptação de formato (4:5 · 1:1 · 9:16)

Os três formatos compartilham largura 1080; só a altura muda (`lib/formats.ts`). No 4:5 a razão é
1.0 e **toda conta aqui tem de ser no-op** — se algo mudar 1px no 4:5, a regra está errada.

- **Cabeçalho** — `y=44` absoluto, em todo formato.
- **Capa** — a imagem e o scrim são full-bleed (acompanham a altura). A headline e a pílula de CTA
  são ancoradas ao **rodapé**, com distância ABSOLUTA: a headline fica a `1350 − 755 = 595`px da
  base e a pílula a `1350 − 1127 = 223`px. Margem que escala vira margem gigante no 9:16.
- **Conteúdo** — o bloco de imagem mantém as margens absolutas do spec: `top=147`, e a base a
  `1350 − 1236 = 114`px do rodapé. Ou seja `height = fmt.height − 147 − 114`. A coluna de texto usa
  o MESMO container e continua centrada nele — o centro vertical acompanha sozinho.

### Fidelidade — MEDIDA, não estimada

O gabarito é o `generate.py`. A conferência foi feita duas vezes (S1 e, depois da refatoração do
render na S2, de novo): o `generate.py` rodado com o `examples/exemplo-carrossel.json` e o render
do app no mesmo Chromium 1080x1350, comparando as caixas medidas no DOM.

**Resultado: 0.00px em toda a geometria do spec** — bloco de imagem (615/85, 147, 380×1089), coluna
de texto (85/586, 147, 409×1089), container da headline (0, 755, 1080×334.13), pílula de CTA
(top 1127, h 68.45), scrim e canvas. O Orquestrador repetiu a medição no app de verdade (dev na
porta 3100) e chegou aos mesmos números, mais o 9:16 com o centro do texto e o centro do bloco de
imagem batendo em 976.5 — desvio 0.00.

Critério final: **0px contra o gabarito EXCETO três divergências deliberadas**, listadas em
`TEMPLATE_02_GABARITO_DIVERGENCES` (`lib/templates/template-02/index.ts`) com motivo e data:

| o quê | gabarito | aqui | por quê |
|---|---|---|---|
| serifada | Newsreader | `'ivyora-text','T01Serif',serif` | O spec trocou por licença; o motivo caducou e o Rafael pediu IvyOra. |
| margem do cabeçalho | 85 (`grid.marginX`) | 71 (`grid.headerMarginX`) | O spec diz 71 em três lugares e recomenda normalizar 71/71. O `generate.py` colapsou a margem do cabeçalho na do conteúdo. |
| `body`/`ui` | `Inter` | `T01InterDisplay` | O spec pede o corte Display; o `generate.py` só carrega `Inter` do Google Fonts, que não o serve. O corpo quebra em MENOS linhas, então os limites do spec continuam valendo com folga. |

Essa lista existe para quem rodar o `generate.py` no futuro achar a explicação num lugar só, em vez
de recomeçar a investigação.

## Fatias — TODAS ENTREGUES

Estado: S1 a S4 entregues na branch `feat/template-02`, **sem commit**. Gate de cada fatia
verificado pelo Builder e reconferido pelo Orquestrador.

| fatia | o que entregou | testes |
|---|---|---|
| S1 | fundação + render | 671 → 722 |
| S2 | barra lateral | 722 → 769 |
| S3 | criação | 769 → 813 |
| S4 | exportação + fechamento | 813 → 813 |

### S1 — fundação + render

- `lib/templates/template-02/index.ts` — spec tipado + helpers.
- `components/slides/Template02Slide.tsx` — porte do `generate.py`.
- `'template02'` em `SlideStyle`, ligado em `SlidePreview`, `HiddenSlides`, `DashboardClient` e o
  rótulo no `SlideCanvas`.
- `tests/template-02.test.tsx`.

**Achado que não estava no plano:** o slot `cover.cta` nascia VAZIO porque no spec o texto é o
elemento `cover.ctaText` (`cover.ctaPill` é só o retângulo). Existe o mapa `SPEC_ELEMENT_ID` para
esse tipo de divergência entre nome de slot e id de elemento.

**Imagem por `background-image`, não `<img>`** — é o caminho que a exportação já sabe capturar e o
que os controles de posição/zoom modulam. Visualmente idêntico ao `object-fit: cover`.

### S2 — editor (barra lateral)

- `components/editor/Template02Slots.tsx` — texto do modelo ativo, com contador na língua do limite
  que prende cada slot (a headline conta LINHAS e caracteres da maior linha; o resto conta o total)
  e aviso quando o destaque não está em nenhuma linha da headline.
- `lib/templates/template-02/image.ts` — escrita canônica no slot; `useGenerateCarouselImages`
  ganhou o braço `template02`.
- `lib/templates/template-02/overrides.ts` — a camada de override, com a mesma disciplina do T1.
- Painéis no registry + o painel `cabecalho` (global).

**Diferença deliberada em relação ao T1:** aqui a LEITURA da imagem também é só o slot. O T1 precisa
do fallback nos campos genéricos por dívida de deck salvo; o T2 nasceu com uma verdade só.

**`SidebarGroupConfig` ganhou `label`/`hint` opcionais.** O grupo global do T2 é CONTEÚDO (a
categoria e o @ do deck), e o `headerFor` forçava "ESTILO GLOBAL" em todo escopo global. Agora a
config declara o rótulo quando o padrão mentiria; o T1 não passa nada e continua idêntico.

**Fora do painel de estilo do T2, de propósito:** entrelinha e alinhamento. A composição é flexbox
centrado em colunas fixas do spec — deslocar bloco desfaz a regra estruturante. Há uma frase no
painel explicando, para ninguém "completar" o painel depois.

### S3 — criação

- Card no `CreateWizard` (os quatro passaram a grid 2×2). `isFixedDeck` continua **só do T1**: o T2
  mantém o slider de quantidade e abre em 5.
- Os DOIS ramos do wizard (`editorSlides` e `slidesPayload`): estilo nos valores de `DEFAULT_SLIDE`,
  `templateOverrides` ausente, `templateModel` gravado, cabeçalho de `template02HeaderSlots`.
- `template02Addendum()` + `template02SlotsFromContent`.
- `components/editor/TemplateModelPicker.tsx` — picker genérico, com o modelo que continua a
  alternância marcado como sugerido.

**O addendum NÃO ficou no route.** Mora em `lib/templates/template-02/index.ts` e o route importa.
Dois motivos: é conhecimento do template, e o `route.ts` do App Router não aceita export solto sem
risco de quebrar o build — e exportar era o que faltava para testá-lo. Há teste provando que os
limites são LIDOS de `regrasDeGeracao.limitesDeTexto` em vez de redigitados.

**O payload do T2 grava `template_model` no banco; o do T1 não grava.** Sem isso o deck reabriria
derivando o modelo da posição, e como o T2 é aberto e reordenável, bastava arrastar um slide para o
desenho trocar. ⚠️ **O T1 tem esse defeito hoje** — ver "Pendências".

**Picker generalizado, T1 NÃO migrado.** O `TemplateModelPicker` é genérico e o T2 usa; o
`Template01ModelPicker` continua como está porque migrá-lo quebraria o gate de "Template 1 com diff
vazio". A troca é de ~10 linhas. Dívida declarada, não esquecimento.

**Sem chamada, a pílula do CTA some** em vez de sair como cápsula branca vazia.

### S4 — fechamento

**Exportação em PNG verificada com evidência**, não por analogia. O caminho de exportação
(`useExport` → `html-to-image` → `lib/fontEmbed.ts`) não tem braço por estilo: ele captura o que o
`HiddenSlides` renderizou, que já é o `Template02Slide`. O que precisava de prova era o embutimento
das fontes. Medido em Chromium com o módulo `fontEmbed` REAL compilado e a folha do Typekit
carregada como em `app/layout.tsx`:

- 23 blocos `@font-face` no CSS de embutir, 3.3 MB;
- **`ivyora-text` embutida como `data:` URI** (1.2 MB de fonte), mais `T01Inter`, `T01InterDisplay`
  e `T01Serif`;
- **nenhuma URL remota sobra** no CSS gerado;
- o PNG exportado COM as fontes embutidas difere do exportado sem — ou seja, o embutimento é o que
  carrega a fonte para dentro do PNG;
- os PNGs foram inspecionados: a serifada sai IvyOra, o marcador lime sai com texto preto numa linha
  só e a pílula sai centrada.

As faces `'IvyOra Text'` (as que resolvem só por `local()`) aparecem no CSS com ZERO `data:` URI —
que é exatamente por que essa família nunca pode entrar numa pilha de fonte. Ver o aviso em
`TEMPLATE_02_DESIGN_TWEAKS.serif`.

## Pendências (não são desta entrega)

1. **O Typekit serve `ivyora-text` só nos pesos 400 e 700.** O spec pede 500 no título interno, e o
   Chrome resolve pelo mais próximo. Pendência antiga do Rafael no projeto web do Adobe Fonts, já
   registrada para o Template 1; a URL do kit não muda.
2. **O `slidesPayload` do TEMPLATE 1 não grava `template_model`.** Deck do T1 gerado hoje reabre
   derivando o modelo da POSIÇÃO — reordenar um slide troca o desenho dele. É bug real, e a correção
   é uma linha, mas o T1 está congelado esperando revisão: não foi mexido.
3. **Migrar o `Template01ModelPicker` para o `TemplateModelPicker`.** ~10 linhas; quebra o gate de
   diff vazio do T1, então é decisão do Orquestrador.

## Gate de cada fatia

- `npx vitest run` — verde, e o número de testes **sobe** (baseline inicial: 671 em 53 arquivos;
  final: 813 em 60)
- `npx tsc --noEmit` — limpo
- `git diff --stat` dos 4 arquivos protegidos — vazio
- `git diff --stat` do TEMPLATE 1 inteiro — vazio
- `lib/templates/template-02/spec.json` e `.claude/skills/` — intocados
- Relatório do que foi **verificado de fato**, separado do que foi **presumido**

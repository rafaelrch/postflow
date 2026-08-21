# Prompt de imagem por IA — estado atual (21/08/2026)

Documento de CONTEXTO, escrito para ser colado inteiro em outra IA (Claude ou ChatGPT)
com o pedido de melhorar o prompt. Descreve o produto, o que o prompt faz hoje, o que
ele NÃO pode fazer, e onde ele ainda é fraco.

Código de referência no repo:
- `lib/image-prompt.ts` — o prompt (módulo puro, sem cliente da OpenAI)
- `lib/openai.ts:210` — `imageSizeForShape`, e o obituário do sufixo antigo
- `app/api/generate-image/route.ts` — a rota que chama a OpenAI
- `hooks/useGenerateCarouselImages.tsx` — o cliente, que decide destino/superfície/série

---

## 1. O que o produto é

Creatools gera **carrosséis para redes sociais**. O usuário escreve (ou a IA gera) o
texto dos slides, escolhe um template, e pode pedir que a IA gere a **imagem** de um
slide ou de todos de uma vez.

A imagem gerada **não é a peça final**. Ela entra num slide que já tem tipografia,
cor de fundo e layout definidos pelo template — o texto é desenhado POR CIMA ou AO
LADO da foto, depois. Isso muda tudo: a foto tem que ser boa **e** tem que deixar
espaço e contraste para o texto do slide sobreviver em cima dela.

São 4 templates, com superfícies diferentes:

| Template (nome de produto) | id no código | superfície onde a imagem cai |
|---|---|---|
| Profile  | `profile`    | card BRANCO (#FFFFFF) — sempre claro |
| Atelier  | `editorial`  | segue o tema do deck (claro ou escuro) |
| Manifesto| `template01` | alterna por modelo de slide: claro (#FFFFFF) ou escuro (#050416) |
| Radar    | `template02` | capa escura (foto de fundo), internos sobre papel creme (#EEE5D9) |

## 2. Restrições técnicas que o prompt não pode ignorar

- Modelo: **`gpt-image-2`** (OpenAI), via `images.generate`, ou `images.edit` quando o
  usuário fornece uma imagem de referência (image-to-image). `quality` padrão: `medium`.
- **Só existem 3 tamanhos** no SDK instalado (openai@6.33.0): `1024x1024`,
  `1536x1024` (paisagem) e `1024x1536` (retrato). Não há nada mais estreito que 2:3.
- Não existe campo de "negative prompt" — as exclusões têm que estar no texto.
- Cada imagem **consome crédito real** do usuário. Testar variação de prompt custa dinheiro.
- Os 3 formatos de destino (`shape`) e o que cai em cada um:
  - `full-bleed` — fundo do slide inteiro (1080x1350). Pedimos retrato 1024x1536. **O texto do slide vai por cima.**
  - `inset-block` — bloco vertical estreito dentro do slide (~380x1089). Retrato 1024x1536. Sem texto por cima.
  - `inset-landscape` — caixa de mídia DEITADA do Profile (864x510). Paisagem 1536x1024. Sem texto por cima.

## 3. O que a rota recebe e monta

Entradas que chegam do cliente (todas opcionais menos o título):

- `title` — a headline do slide, **em português**, escrita como copy (não como descrição de cena).
- `description` — subtítulo/corpo do slide, também em português.
- `isCover` / `isFinal` — posição do slide no carrossel (capa, meio, fechamento).
- `shape` — formato do destino (acima). Padrão `full-bleed`.
- `surface` — `dark` ou `light`, derivado do template e do modelo de slide. Padrão `dark`.
- `userPrompt` — direção livre digitada pelo usuário no painel de IA.
- `brand` — contexto de marca do onboarding. **Só paleta (hex) e tom** chegam ao prompt de
  imagem, de propósito: o resto (nicho, público, dores) é briefing de COPY e, mandado a um
  modelo de imagem, dilui o assunto e ainda empurra o modelo a desenhar aquelas palavras
  dentro da foto.
- `deckTitle` + `seriesSize` — do DECK, não do slide: o mesmo valor vai nas N chamadas do
  lote. É a única âncora de coerência entre as imagens de um mesmo carrossel (cada slide é
  uma chamada independente à OpenAI; não há estado guardado entre elas).

O prompt é montado em **6 camadas nomeadas**, nesta ordem, e camada vazia não aparece:

`ROLE` → `SUBJECT` → `ART DIRECTION` → `COMPOSITION` → `EXCLUDE` → `OUTPUT`

Regra de ouro do módulo: **mesma entrada, mesma string** (há teste de determinismo).

---

## 4. O PROMPT ATUAL, renderizado

### Exemplo A — capa, `full-bleed`, slide escuro, com marca e lote de 6

```
ROLE: You are an editorial photography art director producing a single image for one slide of a social media carousel.
SUBJECT: Cover slide — a cinematic establishing shot that opens the carousel for: Como escolher o piso certo — Guia rapido para quem vai reformar.
ART DIRECTION: Grade the image toward the brand palette (#0F1A2B, #C9A227) — as the colour of light, materials and surfaces in the scene, never as graphic overlays or colour blocks. The mood should read as: sofisticado e direto. Low-key, moody atmosphere with deep shadows and controlled highlights; the image sits on a DARK slide, so keep the overall value range low and let the darkest areas fall to near-black. This image belongs to a cohesive set of 6 images for the carousel "Guia de Pisos". Keep lighting, colour grade, lens character, material palette and subject treatment consistent across the whole set — only the subject matter changes from image to image.
COMPOSITION: Vertical portrait orientation. Full-bleed background composition that survives being cropped at the edges: keep the subject away from the borders. Leave a calm, low-detail, low-contrast area across the lower half where headline text will be laid on top.
EXCLUDE: No text, letters, numbers, words, captions, titles, subtitles, logos, wordmarks, watermarks, signatures, UI elements, borders or frames of any kind. No collage or split-screen. Nothing that looks like a screenshot.
OUTPUT: A single photograph. Editorial, cinematic, professional photography with natural materials and believable light; shallow depth of field; realistic textures; no illustration, no 3D render, no stock-photo staging.
```

### Exemplo B — mínimo (só o título, tudo no padrão)

```
ROLE: You are an editorial photography art director producing a single image for one slide of a social media carousel.
SUBJECT: Middle slide — an illustrative editorial shot supporting: Piso vinilico.
ART DIRECTION: Low-key, moody atmosphere with deep shadows and controlled highlights; the image sits on a DARK slide, so keep the overall value range low and let the darkest areas fall to near-black.
COMPOSITION: Vertical portrait orientation. Full-bleed background composition that survives being cropped at the edges: keep the subject away from the borders. Leave a calm, low-detail, low-contrast area across the lower half where headline text will be laid on top.
EXCLUDE: No text, letters, numbers, words, captions, titles, subtitles, logos, wordmarks, watermarks, signatures, UI elements, borders or frames of any kind. No collage or split-screen. Nothing that looks like a screenshot.
OUTPUT: A single photograph. Editorial, cinematic, professional photography with natural materials and believable light; shallow depth of field; realistic textures; no illustration, no 3D render, no stock-photo staging.
```

### As peças fixas, uma a uma

**ROLE** (sempre igual):
> You are an editorial photography art director producing a single image for one slide of a social media carousel.

**SUBJECT** — prefixo por posição do slide + `título — descrição`:
- capa: `Cover slide — a cinematic establishing shot that opens the carousel for: <assunto>.`
- fechamento: `Closing slide — a minimalist, evocative shot that closes the carousel for: <assunto>.`
- meio: `Middle slide — an illustrative editorial shot supporting: <assunto>.`

**ART DIRECTION** — empilha nesta ordem: marca → atmosfera → série → direção livre do usuário
(a do usuário vem por último de propósito, para ser a última palavra da camada).

- marca (só se houver paleta/tom):
  > Grade the image toward the brand palette (<hex, hex>) — as the colour of light, materials and surfaces in the scene, never as graphic overlays or colour blocks. The mood should read as: <tom>.
- atmosfera `dark`:
  > Low-key, moody atmosphere with deep shadows and controlled highlights; the image sits on a DARK slide, so keep the overall value range low and let the darkest areas fall to near-black.
- atmosfera `light`:
  > High-key, bright and airy atmosphere with soft diffused light and open shadows; the image sits on a LIGHT slide, so keep the overall value range high and avoid heavy blacks that would fight the pale surface.
- série (só quando o lote tem mais de 1 imagem):
  > This image belongs to a cohesive set of <N> images for the carousel "<título>". Keep lighting, colour grade, lens character, material palette and subject treatment consistent across the whole set — only the subject matter changes from image to image.
- direção livre: `Additional art direction: <texto do usuário>.`

**COMPOSITION** — o ÚNICO lugar que fala de orientação (isso é uma correção recente: antes um
sufixo fixo dizia "vertical composition" em TODO prompt, contradizendo o `inset-landscape` na
mesma frase):
- `full-bleed`: > Vertical portrait orientation. Full-bleed background composition that survives being cropped at the edges: keep the subject away from the borders. Leave a calm, low-detail, low-contrast area across the lower half where headline text will be laid on top.
- `inset-block`: > Vertical portrait orientation. Single centered subject in a tight composition that still reads when cropped to a narrow portrait strip: keep everything essential in the central column, nothing important near the left or right edges. No text is laid over this image, so it may fill the frame.
- `inset-landscape`: > Wide horizontal landscape orientation. Single centered subject that survives being cropped at the top and bottom: keep everything essential in the middle band, with generous headroom and floor that can be trimmed away, and nothing important near the upper or lower edges. No text is laid over this image, so it may fill the frame.

**EXCLUDE** (sempre igual):
> No text, letters, numbers, words, captions, titles, subtitles, logos, wordmarks, watermarks, signatures, UI elements, borders or frames of any kind. No collage or split-screen. Nothing that looks like a screenshot.

**OUTPUT** (sempre igual, sem uma palavra de orientação):
> A single photograph. Editorial, cinematic, professional photography with natural materials and believable light; shallow depth of field; realistic textures; no illustration, no 3D render, no stock-photo staging.

---

## 5. O que JÁ foi consertado (não desfazer)

Três defeitos provados na fonte e corrigidos no commit `54e571c`:

1. **Contradição de orientação.** Um sufixo fixo terminava em "vertical composition" e era
   colado em todo prompt, inclusive no `inset-landscape`, que pede horizontal. O prompt dizia
   as duas coisas na mesma frase. Hoje a orientação sai de UM lugar só: `COMPOSITION`.
2. **Atmosfera imposta.** "dark atmosphere" era fixo para os 4 templates — inclusive para o
   card branco do Profile e o creme do Radar. Foto escura em slide claro briga com o slide.
   Hoje a atmosfera vem da `surface` do destino.
3. **A marca não chegava na imagem.** Paleta e tom agora entram como direção de arte.

Também deliberado, e não é esquecimento: **só paleta e tom** da marca entram; o resto do
briefing de marca fica fora.

## 6. Onde ele ainda é fraco (o que eu quero que você ataque)

1. **O SUBJECT é headline, não cena.** `"Como escolher o piso certo"` é copy em português
   entregue crua a um modelo de imagem que espera descrição visual. O modelo ou ilustra a
   frase ao pé da letra, ou entrega banco de imagens genérico — e headline em PT no meio de
   prompt em EN é convite para ele DESENHAR aquelas palavras dentro da foto, exatamente o que
   a camada EXCLUDE tenta impedir. Falta uma instrução de interpretar o tema como cena, e de
   tratar o português como significado, nunca como coisa a renderizar.
2. **O espaço negativo é um chute único.** `full-bleed` fixa "lower half" como a área calma
   onde o texto entra — para os 4 templates. Mas onde a headline cai muda por template. É a
   mesma classe de bug que a atmosfera tinha: valor fixo onde o destino é que manda.
3. **Paleta em hex puro.** `#0F1A2B` diz pouco a um modelo de imagem; o nome aproximado
   ("deep navy", "warm gold") ancora muito melhor.
4. **A série trava consistência e nada garante variedade.** O prompt manda manter luz, grade
   e tratamento iguais nos N quadros, mas nada pede que enquadramento e distância mudem entre
   eles. Risco: 6 fotos coerentes e quase idênticas.
5. **"Mais chamativa".** O `OUTPUT` de hoje pede foto editorial, cinematográfica, sem
   encenação de banco de imagens. É um acabamento sóbrio. Se o objetivo é parar o dedo de quem
   rola o feed, falta pedir explicitamente o que dá impacto — ponto focal claro, contraste
   forte, cor decidida, escala/ângulo incomum — **sem** cair em foto de banco de imagens nem
   estourar o contraste a ponto de o texto por cima virar ilegível. Esse é o equilíbrio difícil.

## 7. O pedido

Melhore este prompt para gerar imagens **melhores e mais chamativas**, respeitando:

- as 6 camadas nomeadas e a montagem determinística (mesma entrada → mesma string);
- orientação declarada em UM lugar só (`COMPOSITION`), nunca no texto fixo;
- atmosfera derivada da superfície do destino, nunca fixa;
- a foto tem que aguentar texto por cima no `full-bleed` (espaço negativo e contraste);
- nada de texto, letra, logo ou marca dentro da imagem;
- sem campo de negative prompt, sem tamanho fora dos 3 permitidos.

Entregue: (a) o texto novo de cada camada, marcando o que mudou e por quê; (b) o que precisa
virar entrada nova vinda do cliente (como `surface` e `series` já são), com o padrão a adotar
quando ela não vier — nenhuma mudança pode quebrar a chamada que não manda o campo novo.

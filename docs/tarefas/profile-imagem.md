# BUG — Profile: imagem não respeita o slot, sliders mortos, shape errado

Repo: postflow--main. Working tree suja. NÃO commite, NÃO faça push.
Achado auditando os 5 estilos no portal com o Rafael.

## Diagnóstico (confirmado, não é palpite)

`components/slides/ProfileSlide.tsx`:
- `CONTENT_WIDTH = 864` (l.24), `MEDIA_HEIGHT = 510` (l.27) — a caixa de mídia
  é HORIZONTAL, ~1.69:1.
- l.298-313, a imagem sai como `<img>` com
  `width:'auto', height:'auto', maxHeight: MEDIA_HEIGHT, maxWidth:'100%'`.
  Ou seja: proporção NATURAL, só limitada em altura. Uma imagem de IA 1024x1536
  vira uma tira de 340x510 dentro de uma caixa de 864 de largura.
- É o ÚNICO dos cinco estilos que **não usa `getImageLayerStyle`** (grep: 0
  ocorrências). Ele nem lê `slide.imagePosition`. Por isso os sliders X, Y e
  zoom da barra não fazem absolutamente nada no Profile — e nunca fizeram.
- E como o ramo `profile` do EditorSidebar passa `target: 'background'`,
  `imageShape` devolve `full-bleed`, então o prompt pede composição de fundo
  sangrado para um destino que é uma caixa embutida horizontal.

## O que entregar

1. **A imagem passa a preencher o slot.** O container da mídia vira uma caixa
   fixa de `CONTENT_WIDTH x MEDIA_HEIGHT` com `overflow:hidden` e o mesmo
   `borderRadius: 34` de hoje, e a imagem preenche por `cover`.
   Use `getImageLayerStyle` — a MESMA função dos outros quatro estilos. Não
   escreva uma segunda maneira de posicionar imagem; foi exatamente isso que
   deixou o Profile de fora do conserto anterior.
   Atenção: o `<img crossOrigin="anonymous">` de hoje existe por causa da
   exportação. Se você trocar por camada com `background-image`, confirme que a
   exportação continua saindo com a imagem (é o caminho que acabamos de
   blindar em `hooks/useExport.ts`) — teste os dois, PNG solo e ZIP.

2. **Os sliders passam a funcionar** como consequência do item 1. Confirme que
   X, Y e zoom movem a imagem dentro da caixa e que ela nunca descobre o fundo,
   igual aos outros estilos.

3. **Shape novo: paisagem.** Hoje `ImageShape` só tem `full-bleed` e
   `inset-block`, os dois retrato. Acrescente um valor para destino
   HORIZONTAL (ex.: `inset-landscape`) em `types/index.ts`:
   - `imageDestination`/`imageShape` devolvem ele para o Profile.
   - `imageSizeForShape` devolve **`1536x1024`** para ele. Este é o PRIMEIRO
     caso em que o tamanho realmente muda — até agora os dois shapes caíam no
     mesmo retrato porque a OpenAI não tem nada mais estreito. Atualize o
     comentário da função, que hoje diz que os dois caem no mesmo tamanho.
   - `FRAMING_DIRECTION` ganha a direção de enquadramento horizontal: assunto
     centrado numa composição larga, que aguenta corte em cima e embaixo.
   - Confira se o ramo `profile` do EditorSidebar deve continuar mandando
     `target: 'background'`. O destino não é fundo do slide, é uma caixa de
     mídia. Se `'background'` só existe ali por herança, corrija — mas NÃO mude
     onde a imagem é GRAVADA (`gridImageUrl`/`backgroundImageUrl`), que é o que
     o ProfileSlide lê. Só o shape/direção.

4. Varra de novo os 5 estilos e confirme que nenhum outro renderiza imagem por
   fora do `getImageLayerStyle`. Diga no relatório o que achou.

## Verificação
- `npx tsc --noEmit` limpo.
- `npx vitest run --exclude "**/.claude/worktrees/**"`: baseline
  `2 failed | 1672 passed`. Não pode subir.
- Testes: ProfileSlide usando getImageLayerStyle; a caixa com as dimensões
  fixas; imageShape do Profile sendo o paisagem; imageSizeForShape devolvendo
  1536x1024 só nele; e as três direções de enquadramento sendo textos distintos.

## Ao terminar
maestri ask "Orquestrador" "<o que fez, se a exportacao do Profile continua com imagem, o que a varredura do item 4 achou, saida do tsc e do vitest>"

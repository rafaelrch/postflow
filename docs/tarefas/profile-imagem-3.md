# Profile: os sliders VOLTAM — inteira no zoom 100, ajustável acima disso

Repo: postflow--main. NÃO commite, NÃO faça push.

## O que aconteceu

Na rodada anterior eu mandei REMOVER os sliders do Perfil, com o argumento de
que sem corte não há enquadramento para ajustar. O Rafael respondeu:

  "nao remova os sliders, pq se o usuario adicionar uma imagem manualmente e que
   precisa ser ajustada, ele vai precisar dos sliders pra colocar a imagem na
   posicao exata que ele acha melhor"

As duas exigências dele — imagem INTEIRA e sliders FUNCIONANDO — são
incompatíveis no modelo atual (proporção livre não tem o que ajustar). O
modelo abaixo atende as duas, e é a decisão. Não volte a discutir isso.

## O modelo

A mídia volta a ser uma caixa FIXA de `CONTENT_WIDTH x MEDIA_HEIGHT` (864x510),
`overflow:hidden`, `borderRadius: 34`, com o fundo `C.mediaBg` que já existe
hoje aparecendo em volta quando a imagem não preenche. Dentro dela, uma camada
posicionada por `getImageLayerStyle` — a MESMA função dos outros estilos.

A diferença que resolve tudo:
- **zoom 100 = `contain`**: a imagem aparece INTEIRA, na proporção original,
  sem corte nenhum. É exatamente a decisão antiga do Rafael, preservada como
  PADRÃO. `getImageLayerStyle` já aceita `objectFit: 'contain'`, ninguém tinha
  ligado isso no Perfil.
- **zoom acima de 100**: a imagem cresce e passa a preencher/cortar, e aí X e Y
  ganham curso e servem para escolher o enquadramento.

Ou seja, o usuário nunca é surpreendido por um corte que não pediu, e quem quer
ajustar tem como.

## O que entregar

1. `ProfileSlide.tsx`: a caixa fixa + camada por `getImageLayerStyle`, com o
   `contain` no zoom 100 e o crescimento acima disso. Nada de terceira maneira
   de posicionar imagem — se `getImageLayerStyle` não expressar isso hoje,
   estenda ELA (o `objectFit` já está na assinatura) e mantenha o
   comportamento dos outros quatro estilos idêntico ao de agora. Se mexer nela,
   os testes de `image-layer-style` têm que continuar passando sem alteração.
2. `EditorSidebar.tsx`: Posição X, Posição Y e Zoom VOLTAM ao ramo `profile`.
   Tire o comentário que eu mandei escrever dizendo que eles não voltam, e
   escreva no lugar por que eles existem: no zoom 100 a imagem está inteira e os
   eixos não têm curso — isso é correto, não bug; eles passam a servir quando o
   usuário dá zoom. Piso do zoom continua `MIN_IMAGE_ZOOM`.
3. MANTENHA tudo do formato de geração: `inset-landscape`,
   `imageSizeForShape = 1536x1024`, a direção horizontal, a rota. É o que faz a
   imagem de IA já nascer deitada e preencher a largura sem zoom.
4. **Bloco 8 de `tests/perfil-destaques-imagem.test.tsx`**: reescreva contando o
   ciclo COMPLETO e o desfecho — caixa fixa no começo; inteira a pedido do
   Rafael; caixa fixa de novo por engano; inteira de novo por decisão dele; e
   agora caixa fixa com `contain` no zoom 100, que preserva "inteira" como
   padrão E devolve o ajuste. A asserção que trava a regra é: **no zoom 100 a
   imagem não é cortada**. Deixe explícito que essa é a linha que não pode cair.
5. O teste que você criou afirmando que o painel do Perfil NÃO tem sliders está
   invertido agora — corrija para afirmar que TEM os três.
6. Exportação: com a camada de background no Perfil, confirme de novo que
   `applyEmbeddedImages` cobre esse caso e ajuste
   `tests/perfil-export-imagem.test.tsx`. Cuidado: você acabou de anotar que o
   Perfil era o único usuário do ramo `HTMLImageElement`. Se ele deixar de usar,
   veja se aquele ramo fica órfão e diga no relatório — não apague sem avisar.

## Verificação
- `npx tsc --noEmit` limpo.
- `npx vitest run --exclude "**/.claude/worktrees/**"`: baseline
  `2 failed | 1678 passed`. Não pode subir.
- Teste do zoom 100 no Perfil não cortando, e do zoom > 100 dando curso a X e Y.

## Ao terminar
maestri ask "Orquestrador" "<o que fez, se getImageLayerStyle mudou e como, se o ramo HTMLImageElement ficou orfao, se a exportacao do Perfil continua com imagem, saida do tsc e do vitest>"

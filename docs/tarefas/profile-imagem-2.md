# Profile: volta a imagem INTEIRA, mantém a IA deitada, tira os sliders

Repo: postflow--main. NÃO commite, NÃO faça push.

## Por que isto existe

Você inverteu o bloco 8 de `tests/perfil-destaques-imagem.test.tsx`, e o
comentário que estava lá dizia:

  "A imagem importada estava sendo CORTADA. A causa: a mídia era uma caixa de
   altura fixa (510px) com background-size: cover... O Rafael confirmou que é
   para entrar INTEIRA, na proporção original e sem crop."

Ou seja: a caixa fixa com `cover` JÁ FOI o estado, o Rafael reclamou do corte, e
foi mudada a pedido dele. Sua entrega desfez essa decisão sem que ninguém
percebesse — foi o comentário do teste que salvou.

Levei as duas opções ao Rafael. **Decisão dele: imagem INTEIRA.** O que resolve
a reclamação nova (imagem de IA em retrato virando tira estreita) não é cortar:
é a IA passar a gerar DEITADA, que é a outra metade da sua entrega e essa fica.

## O que entregar

1. **Reverta o `ProfileSlide.tsx`** para o comportamento anterior: a mídia volta
   a ser o `<img>` de proporção livre, com `width:auto`, `height:auto`,
   `maxHeight: MEDIA_HEIGHT`, `maxWidth:'100%'`, `borderRadius: 34`,
   `crossOrigin="anonymous"` — como estava antes desta rodada. Nada de caixa
   fixa, nada de `getImageLayerStyle` aqui.
   Use o `git diff` para voltar exatamente ao que era; não reescreva de memória.

2. **MANTENHA tudo o que é sobre o formato da geração** — é o conserto de
   verdade e o Rafael aprovou:
   - `ImageShape` com `inset-landscape` em `types/index.ts`
   - `imageSizeForShape('inset-landscape') = '1536x1024'`
   - a direção de enquadramento horizontal em `FRAMING_DIRECTION`
   - `imageShape` devolvendo `inset-landscape` para o Perfil
   - a rota aceitando o shape novo

3. **REMOVA os sliders Posição X, Posição Y e Zoom do ramo `profile`** do
   `EditorSidebar`. Sem corte não existe enquadramento para ajustar: eles
   escrevem em `slide.imagePosition`, que o `ProfileSlide` não lê, e deixá-los
   na tela é mentir para o usuário — foi a reclamação do Rafael.
   Deixe um comentário curto dizendo por que o Perfil não tem esses controles,
   para ninguém "consertar" recolocando.
   Confira se `imagePosition` do Perfil passa a ficar sem nenhum escritor; se
   ficar, NÃO apague o campo do tipo (deck salvo tem valor lá).

4. **Restaure o bloco 8 do teste** para a asserção original (imagem inteira, sem
   crop) e reescreva o aviso interno contando o ciclo completo: já foi caixa
   fixa, virou inteira a pedido do Rafael, voltou a ser caixa fixa por engano
   nesta rodada, e voltou a ser inteira por decisão dele em 20/08 — a tira
   estreita foi resolvida gerando DEITADO, não cortando. Assim ninguém fecha o
   círculo uma terceira vez.
   Mantenha o mock com spread do módulo real que você fez; aquilo foi melhoria.

5. **Exportação**: com o `<img>` de volta, confirme que `applyEmbeddedImages`
   continua substituindo a URL em `<img>` (você disse que ele trata os dois
   casos) e que o teste `tests/perfil-export-imagem.test.tsx` continua válido —
   ajuste-o para o `<img>` se ele estiver preso à camada de background.

## Verificação
- `npx tsc --noEmit` limpo.
- `npx vitest run --exclude "**/.claude/worktrees/**"`: baseline
  `2 failed | 1672 passed` (antes da sua entrega do Perfil). Não pode subir.
- Um teste garantindo que o painel Imagem do Perfil NÃO tem os três sliders.

## Ao terminar
maestri ask "Orquestrador" "<o que reverteu, o que manteve, se a exportacao do Perfil continua com imagem, saida do tsc e do vitest>"

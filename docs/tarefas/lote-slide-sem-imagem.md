# BUG NOSSO — o lote gera (e cobra) para slide que não tem onde pôr imagem

Repo: postflow--main. Working tree suja (6 rodadas + blindagem do export).
NÃO commite, NÃO faça push.

## O bug, confirmado na tela

Carrossel **Manifesto** (template01) de 6 slides. O slide 6 é o modelo 6, que
não tem imagem nenhuma no desenho — `panels.ts` já não mostra o painel "Imagem"
nele (`when: (c) => c.template01Model != null && c.template01Model !== 6`), e
conferi no portal: o slide 6 realmente não tem o painel.

Mas `batchTargets` inclui esse slide. Então "Deste em diante" a partir do slide
1 dispara 6 gerações. A do slide 6:
- chama a API e **debita 5 créditos** (`CREDIT_COSTS.image`)
- recebe a URL
- cai em `template01SetImage`, que faz `const slot = template01ImageSlot(model);
  if (!slot) return {};`
- `updateSlide(i, {})` — nada acontece, em silêncio

Crédito queimado, nenhuma imagem, nenhum aviso. É a MESMA razão pela qual a capa
do Editorial foi excluída do lote na rodada 2 — só que ali foi tratado como
caso especial, e por isso este caso passou.

Este bug é NOSSO: o template01 não tinha lote antes da rodada 2.

## O que entregar

1. **Generalizar a regra de elegibilidade.** Hoje `batchTargets` tem um caso
   especial escrito à mão:

       .filter(({ slide, index }) => !(target === 'content' && isEditorialCoverSlide(style, slide, index)))

   Troque isso pela pergunta certa, feita uma vez só: **este slide tem destino
   para a imagem?** Já existe `imageDestination` (a fonte única criada na
   rodada 2) — use ela. Um slide entra no lote se, e somente se, gerar uma
   imagem para ele produziria uma mudança real no slide.
   - template01 modelo 6 (e qualquer modelo sem slot de imagem): FORA.
   - capa do Editorial quando `target === 'content'`: continua FORA, agora pela
     regra geral e não por um `if` próprio dela.
   - template02: todo modelo tem imagem, continua tudo dentro.
   - Se `isEditorialCoverSlide` ficar sem uso depois disso, avalie remover; se
     ainda for usada em outro lugar, deixe.

2. **Não crie uma segunda lista.** `generateAll`, a contagem do rótulo do botão
   e a lista de conteúdo do painel continuam saindo todas de `batchTargets`. A
   lista mostrada ao usuário tem que bater exatamente com o que vai ser gerado
   e cobrado — é o contrato que a rodada 3 estabeleceu.

3. **Confira o resto do deck.** Faça uma varredura: existe outro estilo/modelo
   em que gerar imagem não produz mudança? Olhe `imagePatch`/`imageDestination`
   para os 5 estilos (template01, template02, profile, editorial, minimalist) e
   diga no relatório o que encontrou. Não quero descobrir um terceiro caso
   depois.

## Verificação
- `npx tsc --noEmit` limpo.
- `npx vitest run --exclude "**/.claude/worktrees/**"`: baseline atual. Não pode subir.
- Teste que morde: deck template01 com 6 slides → o lote a partir do slide 1
  tem 5 alvos, não 6, e o modelo 6 não está entre eles; o rótulo do botão diz
  5; a lista do painel não mostra o slide 6.
  E o caso do Editorial continuando correto pela regra nova.

## Ao terminar
maestri ask "Orquestrador" "<o que fez, o que a varredura do item 3 encontrou, arquivos tocados, saida do tsc e do vitest>"

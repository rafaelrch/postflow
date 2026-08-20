# Rodada 4 — o lote passa a ser "deste slide em diante"

Repo: postflow--main, branch main. Working tree suja (não commitada).
Não commite, não faça push.

## A decisão do Rafael

Ele testou no portal: carrossel Atelier de 5 slides, no slide 4, escopo
"Todos os slides" → o botão dizia "Gerar nos 4 slides". O 4 estava CERTO
(Atelier é `editorial`, e a capa não entra no lote em `content`, então os
elegíveis são os slides 2..5), mas não é o que ele quer.

Decisão dele: o segundo escopo passa a ser **deste slide em diante**, incluindo
o slide atual. No slide 4 de 5 isso são os slides 4 e 5 → "2 slides".
Não é "todos os elegíveis do deck" mais.

## O que entregar

1. **`batchTargets` ganha o índice de partida.**
   Hoje: `batchTargets(slides, style, target)`.
   Passa a receber o slide de onde o lote começa e devolver só dele em diante,
   mantendo o filtro de elegibilidade que já existe (a capa do Editorial fora
   quando `target === 'content'`).
   Sugestão de assinatura — ajuste se achar melhor, mas mantenha UMA função:

       batchTargets(slides, style, target, fromIndex)

   `generateAll` passa a receber o `fromIndex` e usar a mesma função. Continua
   valendo a regra da rodada 3: `generateAll`, a contagem do rótulo e a lista do
   painel saem TODAS daqui. Nada de recalcular em outro lugar.

2. **Rótulo do escopo no seletor**: "Todos os slides" → **"Deste em diante"**.
   Mantenha "Este slide" como está.

3. **Rótulo do botão**: em vez de "Gerar nos N slides", use
   **"Gerar nos N slides restantes"**.
   ⚠️ Usei "restantes", não "seguintes": o lote INCLUI o slide atual, e
   "seguintes" leria como "os que vêm depois deste", que é outro número.
   Trate o singular: com N = 1, "Gerar no slide restante" (o caso do último
   slide do deck). Nada de "1 slides".

4. **A lista de conteúdo (rodada 3) acompanha**: no escopo em diante ela mostra
   só os slides do lote — no exemplo do Rafael, `4.` e `5.`, não mais `2.` a
   `5.`. Isso deve sair de graça se o item 1 estiver certo; confirme que sim.
   O rótulo do campo continua "CONTEÚDO DE CADA SLIDE" e a linha de apoio
   continua a mesma.

5. **Caso de borda**: se o slide atual for o único elegível daqui em diante, o
   escopo em diante e "Este slide" fazem a mesma coisa. Não esconda o seletor
   por causa disso — só garanta que o número e o texto não fiquem errados.

## Verificação
- `npx tsc --noEmit` limpo.
- `npx vitest run --exclude "**/.claude/worktrees/**"`: baseline
  `2 failed | 1610 passed`. Não pode subir.
- Atualize os testes da rodada 3 que afirmam "todos os elegíveis do deck" — a
  regra mudou e eles devem falhar agora. Se algum passar sem mudança, descubra
  por quê antes de seguir.
- Testes novos: partindo do slide 4 de 5 o lote é [4,5]; partindo do slide 1 de
  um Atelier em `content` o lote é [2..5] (a capa continua fora); no último
  slide o lote é só ele, com o rótulo no singular; e a lista do painel batendo
  exatamente com o que `generateAll` geraria.

## Ao terminar
maestri ask "Orquestrador" "<o que fez, arquivos tocados, saida do tsc e do vitest, e o que NAO conseguiu fazer>"

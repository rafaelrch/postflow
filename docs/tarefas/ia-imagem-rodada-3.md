# Rodada 3 — o campo "Conteúdo do slide" mente no modo lote

Repo: postflow--main, branch main. Continua na working tree suja (não commitada).
Não commite, não faça push.

## O problema (achado do Rafael, confirmado no código)

No `AiGenPanel` o campo readonly "CONTEÚDO DO SLIDE" mostra o texto do slide
ATIVO. Isso está certo no escopo "Este slide". No escopo "Todos os slides" ele
mente: dá a entender que aquele texto vai gerar as N imagens.

O que de fato acontece (hooks/useGenerateCarouselImages.tsx, worker do
`generateAll`): cada iteração manda `title` e `description` DO PRÓPRIO slide no
POST. Só `userPrompt` e `referenceImageUrl` são comuns ao lote. Ou seja, o
conteúdo é individual e a tela diz o contrário.

## O que entregar

1. **O campo acompanha o escopo.**
   - Escopo "Este slide": exatamente como hoje — rótulo "CONTEÚDO DO SLIDE",
     textarea readonly com título + descrição do slide ativo.
   - Escopo "Todos os slides": o rótulo vira "CONTEÚDO DE CADA SLIDE" e o campo
     passa a listar, em ordem, os slides QUE O LOTE VAI ATINGIR — uma linha por
     slide, no formato `N. <título>` (use a descrição só se o título estiver
     vazio; corte com reticências o que não couber numa linha). Área rolável com
     a mesma altura de hoje, readonly, não editável.
   - Abaixo do campo, no modo lote, uma linha de apoio (`helpCls` de
     `sidebar/tokens.ts`): "Cada imagem usa o texto do próprio slide. O prompt e
     a referência acima valem para todos."

2. **De onde vem a lista — não crie uma segunda verdade.**
   Hoje quem decide os slides do lote é o filtro dentro de `generateAll`
   (pula a capa do Editorial quando `target === 'content'`), e o `allCount` que a
   barra passa é calculado À PARTE em EditorSidebar (`slides.length` ou
   `contentSlidesCount`). Já são duas contas para a mesma pergunta, e agora a
   LISTA seria a terceira.

   Extraia do hook uma função única, exportada, que responde "quais slides o
   lote atinge":

       export function batchTargets(slides, style, target): { slide: Slide; index: number }[]

   - `generateAll` passa a usar ela para montar `targets` (em vez do
     `.map().filter()` inline).
   - `EditorSidebar` usa ela para derivar TANTO a contagem que vai em `allCount`
     QUANTO a lista de conteúdo que vai para o painel.
   - Prop nova no `AiGenPanel` para receber a lista já pronta (algo como
     `batchContents?: { index: number; text: string }[]`). O painel só renderiza
     — não recalcula quem entra no lote.
   - Com isso `allCount` deve virar `batchContents.length` e o cálculo solto de
     `contentSlidesCount` some, se ele não for usado em mais nada. Confira antes
     de apagar.

3. Não mude o comportamento da geração. É a TELA que estava mentindo, não o
   lote — o lote já faz a coisa certa.

## Verificação
- `npx tsc --noEmit` limpo.
- `npx vitest run --exclude "**/.claude/worktrees/**"`: baseline
  `2 failed | 1595 passed`. Não pode subir.
- Testes novos: o campo trocando de rótulo e de conteúdo ao alternar o escopo;
  a lista do lote batendo EXATAMENTE com os slides que `generateAll` gera
  (inclusive o caso do Editorial em 'content', que pula a capa); e `allCount`
  saindo da mesma fonte da lista.

## Ao terminar
maestri ask "Orquestrador" "<o que fez, arquivos tocados, saida do tsc e do vitest, e o que NAO conseguiu fazer>"

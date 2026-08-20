# BUG — exportação sai sem a imagem (PNG solo e ZIP)

Repo: postflow--main, branch main. Working tree suja (5 rodadas, não commitada).
Não commite, não faça push.

Rafael testou no portal: exportar o slide sozinho E exportar todos (ZIP)
produzem PNG **sem a imagem**. O resto do slide (texto, cores, fundo sólido)
sai normal.

## O que EU já apurei — não repita, comece daqui

1. A árvore oculta de exportação existe e está correta.
   `components/editor/HiddenSlides.tsx` renderiza em
   `position:fixed; left:-99999px` (NÃO é `display:none`, então o browser
   carrega as imagens). Inspecionei no portal: dentro desse container há 53
   divs, **5 com `background-image` apontando para URL https válida** do
   Supabase, e o transform sai como `scale(1) translate(0%)`.
   Ou seja: o DOM que vai para o rasterizador está certo. O problema é do
   rasterizador para frente.

2. Rede e CORS estão OK. Um `fetch` das mesmas URLs a partir da origem da
   página devolve **200**, com e sem query de cache-bust.

3. **Nenhum erro no console** durante a exportação. Ela conclui e entrega o
   arquivo — só sem a imagem. Ou seja: o `catch` de `captureSlide` NÃO está
   caindo no fallback do html2canvas; quem produz o PNG é o html-to-image.

4. Muito provavelmente **não é regressão da rodada 5**. O
   `getImageLayerStyle` antigo também devolvia `transform: scale(...)`, então
   ter transform na camada não é novidade — só o `translate(0%)` foi
   acrescentado, e ele é no-op nos valores padrão.
   **CONFIRME isso antes de qualquer outra coisa** (item 1 abaixo). Se a
   exportação já estava quebrada antes, isso está em PRODUÇÃO hoje e o Rafael
   precisa saber — é a informação mais importante desta tarefa.

## O que fazer

1. **Primeiro, datar o bug.** Reverta temporariamente só o
   `getImageLayerStyle` para a versão anterior (está no `git diff` de
   `lib/utils.ts`) e exporte de novo. Depois teste também num commit limpo
   (`git stash` do conjunto, ou uma worktree separada em `b2c26b3`) para saber
   se a exportação com imagem já falhava antes das nossas cinco rodadas.
   ⚠️ São 5 rodadas de trabalho não commitado na árvore. Se for usar `git stash`,
   confirme que voltou tudo depois (`git stash pop` + `git status`). Prefira uma
   worktree separada, é mais seguro.
   Relate a resposta explicitamente: "já quebrado antes" ou "quebramos agora".

2. **Depois, achar a causa.** `hooks/useExport.ts`, função `captureSlide`.
   Suspeitos, em ordem:
   - `cacheBust: true` (linha ~44): o html-to-image acrescenta query na URL ao
     embutir a imagem. A URL responde 200 no fetch simples, mas veja o que a
     lib faz com a resposta.
   - `width`/`height` explícitos no `toCanvas` combinados com o tamanho real do
     nó: se divergirem, o conteúdo pode ser cortado ou reposicionado.
   - O caminho do html-to-image que embute `background-image`: confirme se ele
     de fato converte para data URL nesse caso, ou se está desistindo em
     silêncio.
   - O prop `forExport` que `HiddenSlides` passa para os componentes de slide —
     veja se ele muda alguma coisa no caminho da imagem.
   Prove a causa antes de consertar: um teste, um log temporário, ou o canvas
   resultante amostrado. Não troque de biblioteca no escuro.

3. **Consertar**, mantendo a exportação idêntica ao preview no resto (texto e
   fontes já saem certos hoje — não regrida isso; foi o motivo de o
   html-to-image ter sido escolhido no lugar do html2canvas, está comentado no
   arquivo).

4. Se descobrir que o conserto exige trocar a biblioteca ou mudar o formato da
   exportação, **PARE e me avise** antes de fazer. É decisão do Rafael.

## Verificação
- `npx tsc --noEmit` limpo.
- `npx vitest run --exclude "**/.claude/worktrees/**"`: baseline
  `2 failed | 1636 passed`. Não pode subir.
- Um teste que morda o bug de verdade, se for testável sem browser. Se não for,
  diga isso claramente em vez de escrever um teste que passa dos dois lados.

## Ao terminar
maestri ask "Orquestrador" "<o bug e antigo ou nosso, qual era a causa provada, o que mudou, saida do tsc e do vitest>"

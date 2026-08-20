# Blindar a exportação contra a falha silenciosa

Decisão do Rafael. Repo: postflow--main, branch main. Working tree suja
(6 rodadas não commitadas). NÃO commite, NÃO faça push.

## O que já sabemos (provado na fonte da lib, não repita)

`node_modules/html-to-image/lib/dataurl.js`, `resourceToDataURL`:
- no `catch`: `dataURL = options.imagePlaceholder || ''`
- logo depois, incondicional: `cache[cacheKey] = dataURL`
- `getCacheKey` faz `url.replace(/\?.*/, '')` — descarta a query
- o `console.warn` só acontece na tentativa que falhou

Ou seja: uma falha de download grava `''` no cache da lib para aquela URL e
TODA exportação seguinte daquela aba sai sem imagem, em silêncio, até um
reload. Tirar o `cacheBust` (já feito) só reduz a chance de cair nisso.

## O que entregar

1. **Pré-embutir as imagens antes do `toCanvas`.** Em `hooks/useExport.ts`,
   antes de rasterizar, baixe você mesmo cada imagem usada nos slides e
   converta para data URL. A lib PULA o que já é data URL, então ela nunca
   entra no caminho do cache envenenado.
   - Junte as URLs a partir do estado dos slides (as mesmas que alimentam
     `background-image`), não varrendo o DOM.
   - Baixe cada URL UMA vez por exportação e reuse entre os slides do ZIP —
     hoje o ZIP exporta N slides e a mesma imagem pode repetir.
   - Faça isso sem `cacheBust`, pelas razões já escritas no comentário do
     arquivo.

2. **Falhar visível.** Se alguma imagem não baixar, NÃO entregue o arquivo
   calado. Mostre um toast de erro dizendo que a exportação não saiu porque uma
   imagem não pôde ser carregada, e não dispare o download. É o ponto inteiro
   da tarefa: hoje o usuário só descobre abrindo o PNG.
   Vale para os DOIS caminhos: `downloadSlide` e `downloadAll` (ZIP).

3. **Não regrida o que já está certo**: texto e fontes saem corretos hoje com o
   html-to-image, e foi por isso que ele foi escolhido no lugar do html2canvas
   (está comentado no arquivo). Mantenha o `fontEmbedCSS` pré-computado, o
   `pixelRatio: 2` e o `width`/`height` do formato ativo. O fallback para
   html2canvas continua existindo.

4. Cuidado com o tamanho: data URL de várias imagens grandes na memória, vezes
   N slides no ZIP. Se você achar que isso pode estourar em deck grande, diga
   no relatório com números em vez de inventar um limite silencioso.

## Verificação
- `npx tsc --noEmit` limpo.
- `npx vitest run --exclude "**/.claude/worktrees/**"`: baseline
  `2 failed | 1642 passed`. Não pode subir.
- Testes: a coleta de URLs a partir dos slides; a de-duplicação entre slides;
  e o caminho de falha NÃO disparando download e chamando o toast de erro.

## Ao terminar
maestri ask "Orquestrador" "<o que fez, arquivos tocados, como tratou memoria no ZIP, saida do tsc e do vitest, e o que NAO conseguiu fazer>"

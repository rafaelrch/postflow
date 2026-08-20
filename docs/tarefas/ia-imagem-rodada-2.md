# Rodada 2 — ajustes do Rafael no fluxo de imagem por IA

Repo: /Users/rafaelrocha/Documents/PROJETOS/.maestri/floors/postflow--main (branch main)
Continua em cima do que você já entregou (working tree suja, NÃO commitada).
Quatro entregas. Faça todas. Não commite, não faça push.

Arquivos que você já conhece: components/editor/GenerationToast.tsx,
components/editor/sidebar/AiGenPanel.tsx, components/editor/EditorSidebar.tsx,
hooks/useGenerateCarouselImages.tsx, components/editor/sidebar/panels.ts,
app/api/generate-image/route.ts, lib/openai.ts (buildImagePrompt).

---

## A) Toast: centralizado, branco, flutuando, subindo

1. **Posição**: passe `position: 'bottom-center'` nas OPÇÕES do `toast.custom`
   (o react-hot-toast aceita posição por toast). NÃO mexa no `position` do
   `<Toaster>` em components/AppShell.tsx — ele vale para o app inteiro e não é
   isso que o Rafael pediu.
2. **Fundo branco de verdade**: o card fica branco no claro E no escuro, com o
   texto escuro. Isso é uma EXCEÇÃO consciente à regra de "só token": os tokens
   `--ink`/`--paper` invertem no dark e deixariam texto branco sobre card
   branco. Use uma paleta fixa local (branco no fundo, tinta escura no título,
   cinza médio no hint) e escreva um comentário no arquivo dizendo que a
   exceção é deliberada e por quê — senão alguém "corrige" isso depois.
   A barra de progresso e o spinner também precisam de cor fixa legível sobre
   branco (hoje usam `--ink`, que some no dark).
3. **Sombra esfumaçada, de objeto flutuando**: sombra em camadas, difusa e
   ampla, não uma linha dura. Algo como
   `0 16px 40px rgba(0,0,0,.14), 0 4px 12px rgba(0,0,0,.08)` — ajuste até
   parecer que o card levita. Sem borda dura; se mantiver borda, que seja
   quase invisível.
4. **Animação suave subindo e saindo**: entrada deslizando de baixo para cima
   com fade-in; saída continuando a subir com fade-out. Use `t.visible` (que já
   é passado como prop `visible`) para alternar entre os dois estados, com
   keyframes/transition de ~260ms e easing suave. Respeite
   `prefers-reduced-motion`: com ele ligado, só o fade, sem deslocamento.

## B) Toast: a copy do título

- **Um slide só** (usuário escolheu "este slide"):
  `Slide ${index + 1} — gerando imagem`   ← SEM "de N". Hoje está com "de N".
- **Lote** (usuário escolheu "todos os slides"):
  `Slide ${done + 1} de ${total} — gerando imagem`
  (limite `done + 1` a `total`). Mantém a barra com percent e a porcentagem.
- O "de N" é o que distingue os dois modos na tela. Não use a mesma frase nos dois.
- Barra indeterminada continua valendo só para o slide único.

## C) Sidebar: ESCOLHA entre "este slide" e "todos os slides"

Hoje o `AiGenPanel` tem DOIS botões de disparo. O Rafael quer UMA escolha e UM
botão:

1. Dentro do painel aberto, acima do botão "Gerar", um seletor segmentado de
   duas opções — "Este slide" / "Todos os slides" — no mesmo visual dos outros
   segmentados da barra (veja o grid de "Alinhamento" do template 1 em
   EditorSidebar, com `bg-[var(--ink)] text-[var(--paper)]` no selecionado).
   Estado local, padrão "Este slide".
2. Um único botão "Gerar" embaixo. Ele chama `onGenerate(opts)` ou
   `onGenerateAll(opts)` conforme o escopo escolhido. O rótulo do botão
   acompanha: "Gerar" / "Gerar nos N slides".
3. Quando `onGenerateAll` não é passado, o seletor NÃO aparece (fica só
   "Gerar"), e o escopo é forçado para "este slide".
4. `allCount` continua alimentando o rótulo. Some com o botão secundário antigo.

## D) Adaptar a geração ao FORMATO do destino de cada slide

### O problema real (verifique você mesmo antes de mudar)
`app/api/generate-image/route.ts` hoje manda `size: '1024x1536'` FIXO nos dois
ramos (generate e edit). Nada se adapta: a capa full-bleed (1080x1350, 4:5) e o
bloco interno estreito do Template 2 (380x1089, ~1:2.9) recebem exatamente a
mesma imagem. É por isso que o enquadramento fica errado num dos dois. Isso vale
inclusive para a geração de UM slide que já existia — não é regressão sua.

### O que fazer
1. Uma função nova e ÚNICA que descreve o destino da imagem de um slide,
   ao lado de `imagePatch` em hooks/useGenerateCarouselImages.tsx — mesma fonte
   de verdade, mesma assinatura de entrada (`slide, style, index, target`):

       export type ImageShape = 'full-bleed' | 'inset-block';
       export function imageShape(slide, style, index, target): ImageShape

   Regra: se a imagem daquele slide vai para o FUNDO do slide (capa do T2, os
   modelos do T1 com `t01Media.background`, `target === 'background'` nos
   estilos sem slot) => `'full-bleed'`. Se vai para um bloco/card entre os
   textos => `'inset-block'`. Derive do MODELO do slide, igual `imagePatch` faz
   — nunca de `index + 1`.
   🔴 Não duplique a lógica de destino: se precisar, extraia o pedaço comum e
   faça `imagePatch` e `imageShape` lerem dele. Duas verdades sobre "onde a
   imagem vai" é exatamente o bug que os comentários do arquivo já contam.

2. `generateForSlide` passa `shape` no corpo do POST. `generateAll` calcula o
   shape POR SLIDE do lote (é esse o pedido do Rafael: no mesmo carrossel a capa
   e os internos têm destinos diferentes) — não calcule uma vez e reuse.

3. `app/api/generate-image/route.ts` aceita `shape` e para de mandar tamanho
   fixo: mapeia o shape para o tamanho suportado mais próximo. ⚠️ CONFIRA os
   tamanhos que o `gpt-image-2` aceita nos tipos do SDK instalado
   (node_modules/openai) antes de escrever — não chute. Se o conjunto suportado
   não tiver nada mais estreito que o retrato padrão, mantenha o tamanho e diga
   isso no relatório; nesse caso o item 4 abaixo é que faz o trabalho.

4. `buildImagePrompt` em lib/openai.ts recebe o `shape` e acrescenta direção de
   ENQUADRAMENTO ao prompt: `full-bleed` pede composição que aguenta corte nas
   bordas e área calma onde o texto entra por cima; `inset-block` pede assunto
   centrado e composição vertical apertada, que sobrevive a um recorte estreito.
   Valide `shape` na API (valor desconhecido cai no padrão de hoje) — o corpo do
   POST vem do cliente.

## E) Editorial: a geração por IA sai de "Fundo do slide"

Confirmei no portal: num carrossel Editorial na CAPA os painéis são
"Texto do slide / Layout do slide / Sombra / Overlay / Fundo do slide / Cantos".
Não existe painel "Imagem", porque panels.ts tem
`{ id: 'imagem', when: (c) => !c.isEditorialCover }` — e o `AiGenPanel` da capa
foi parar dentro do painel `fundoDoSlide` (EditorSidebar ~linha 985). O Rafael
achou isso escondido, e está certo.

1. Em panels.ts, o painel `imagem` passa a aparecer TAMBÉM na capa do Editorial
   (tire a condição).
2. No bloco `imagem:` do EditorSidebar, trate o caso capa-do-Editorial: destino
   `'background'`, com o `AiGenPanel` (agora com o seletor do item C) e os
   controles de posição/zoom do fundo. Nos internos, nada muda.
3. REMOVA o `AiGenPanel` de dentro de `fundoDoSlide`. Não deixe os dois. O que
   fica em "Fundo do slide" é cor e o resto que já estava lá.
4. Não mexa no aviso de "imagem de fundo salva que não é mais usada" — aquilo é
   limpeza de dado legado e continua onde está.

---

## Verificação obrigatória
- `npx tsc --noEmit` limpo.
- `npx vitest run --exclude "**/.claude/worktrees/**"`: baseline atual é
  `2 failed | 1575 passed` (as 2 são onboarding-form-session e onboarding-wizard,
  falhas de ambiente). Não pode subir.
- Atualize os testes que você escreveu na rodada 1: eles afirmam DOIS botões e a
  copy antiga; agora é um seletor + um botão, e o título do toast mudou.
- Testes novos para o que é novo: a copy dos dois modos, o seletor trocando o
  alvo do disparo, `imageShape` retornando o shape certo para capa e interno de
  T1/T2/editorial, e o painel "Imagem" existindo na capa do Editorial com a
  geração FORA de "Fundo do slide".

## Ao terminar
maestri ask "Orquestrador" "<o que fez, arquivos tocados, o que descobriu sobre os tamanhos suportados do gpt-image-2, saida do tsc e do vitest, e o que NAO conseguiu fazer>"

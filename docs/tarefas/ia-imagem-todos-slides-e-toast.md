# Tarefa: "Gerar para todos os slides" no painel de IA + toast de progresso

Repo: /Users/rafaelrocha/Documents/PROJETOS/.maestri/floors/postflow--main (branch main)
Duas entregas independentes no mesmo fluxo. Faça as duas.

Leia antes de escrever código:
- components/editor/sidebar/AiGenPanel.tsx
- components/editor/EditorSidebar.tsx (bloco `imagem:` ~linhas 465-620, e ~980-1000)
- hooks/useGenerateCarouselImages.ts
- components/editor/sidebar/tokens.ts (labelCls, inputCls, helpCls, numericCls)
- components/AppShell.tsx (config do Toaster)
- AGENTS.md: este Next tem breaking changes; consulte node_modules/next/dist/docs/ se precisar.

---

## PARTE 1 — Opção "gerar para todos os slides" dentro do painel de IA

### Estado atual (problema)
O botão "Gerar para todos os N slides" existe SOLTO, fora do `AiGenPanel`, e só
em dois dos quatro ramos do bloco `imagem:`:
- `style === 'profile'` -> `generateAll()`
- ramo genérico (else) -> `generateAll('content')`
Nos templates 1 e 2 (Atelier/Manifesto/Radar) esse botão NÃO existe.
E, por estar fora do painel, ele ignora o prompt e a imagem de referência que o
usuário acabou de escrever — dispara `generateAll()` sem nenhuma opção.

### O que entregar
1. `AiGenPanel` passa a ter DOIS botões de disparo dentro do painel aberto,
   lado a lado ou empilhados (siga o estilo já existente):
   - "Gerar" (o atual, primário, escuro) -> chama `onGenerate(opts)`
   - "Gerar para todos os N slides" (secundário, borda, mesmo visual do botão
     solto de hoje) -> chama uma nova prop `onGenerateAll(opts)`
   Ambos passam O MESMO `{ userPrompt, referenceImageUrl }` do painel. Esse é o
   ponto da mudança: o prompt e a referência valem para o lote inteiro.
2. Novas props do `AiGenPanel`:
   - `onGenerateAll?: (opts: GenerateOptions) => void` (opcional)
   - `allCount?: number` — quantos slides o lote vai atingir, para o rótulo
   Quando `onGenerateAll` não é passado, o segundo botão não aparece (a capa do
   Editorial, ~linha 988, gera só a capa: NÃO ganha o botão de lote).
3. Ligar `onGenerateAll` nos QUATRO ramos do bloco `imagem:` do EditorSidebar:
   - template02 -> `generateAll('background', opts)`  (ver nota do target abaixo)
   - template01 -> `generateAll('background', opts)`
   - profile    -> `generateAll('background', opts)`, allCount = slides.length
   - genérico   -> `generateAll('content', opts)`,    allCount = contentSlidesCount
   Para T1/T2 o `allCount` é `slides.length`.
4. REMOVER os dois botões soltos de "Gerar para todos" que hoje ficam fora do
   `AiGenPanel` (ramo profile e ramo genérico) — a função passa a viver só
   dentro do painel. Não deixe os dois caminhos coexistindo.
5. `useGenerateCarouselImages.generateAll` passa a aceitar
   `(target: ImageTarget = 'background', opts?: GenerateOptions)` e repassa
   `opts` para `generateForSlideWithRetry` em cada slide do lote.

Nota sobre o target em T1/T2: `imagePatch` já ignora o `target` nesses estilos
(quem decide é o modelo do slide). Não invente lógica nova ali. O filtro de
`isEditorialCoverSlide` continua valendo só quando `target === 'content'`.

---

## PARTE 2 — Toast de progresso da geração de IA

### Estado atual
`generateOne` e `generateAll` usam `toast.loading` com texto puro
("Gerando 3/5 imagens…"). O Rafael quer um toast com barra de progresso.

### O que entregar
Um componente novo `components/editor/GenerationToast.tsx` (client), renderizado
via `toast.custom(...)` com o mesmo `id` que já é usado hoje, e mantido pelo
mesmo ciclo de vida (dismiss/success/error no fim, como está hoje).

Anatomia do toast (o Rafael mandou o print; replique a estrutura):
- Card branco/superfície elevada, cantos bem arredondados (~16px), sombra
  suave, padding ~14x18, largura ~380px. Use os tokens do design system
  (`--surface-elevated`/`--paper`, `--line`, `--ink`, `--ink-dim`) — nada de
  cor literal, mesma regra do tokens.ts. Tem que funcionar em dark mode.
- Coluna esquerda: spinner circular fino girando (~18px), na cor `--ink-dim`.
- Coluna direita, três linhas:
  1. Título em negrito ~13px, cor `--ink`.
  2. Barra de progresso (trilho ~3px, `--line`; preenchimento `--ink`,
     transição de width suave ~300ms) + porcentagem à direita, ~12px,
     tabular-nums (`numericCls`), cor `--ink-dim`.
  3. Subtítulo ~12px, cor `--ink-muted`:
     "As imagens aparecem no carrossel assim que ficam prontas"

Props sugeridas: `{ title, percent?, hint? }`. Quando `percent` é `undefined`
(geração de UM slide, que não tem progresso real), a barra fica INDETERMINADA:
um segmento de ~35% deslizando da esquerda para a direita em loop (keyframes
CSS num `<style jsx>` ou classe utilitária), e a porcentagem não é exibida.
Nunca invente uma porcentagem falsa.

Copy exata:
- Lote (`generateAll`): título `Gerando imagem ${done + 1} de ${total}`
  (limite `done + 1` a `total`), `percent = Math.round((done / total) * 100)`.
- Slide único (`generateOne`): título
  `Slide ${index + 1} de ${slides.length} — gerando imagem`, sem percent.
- Rate limit da OpenAI: mantenha o aviso, mas AGORA no `hint` do toast:
  `Limite da OpenAI atingido — aguardando ${waitSecs}s…` (o título e a barra
  continuam iguais). Não troque o toast inteiro por texto solto como hoje.

Sucesso/erro continuam como estão hoje (`toast.success` / `toast.error` com o
mesmo id), então o custom some sozinho. Só o estado "carregando" muda.

Atenção ao `react-hot-toast`: `toast.custom` recebe `(t) => JSX` e não aplica o
`toastOptions.style` do `<Toaster>` — o card precisa do próprio estilo. Use
`t.visible` para a animação de entrada/saída se for simples; se complicar, pode
ignorar e entregar sem animação de entrada.

---

## Verificação obrigatória antes de reportar
- `npx tsc --noEmit` limpo (ou sem regressão em relação ao baseline).
- `npx vitest run --exclude "**/.claude/worktrees/**"` — compare com o baseline
  de falhas ANTES da sua mudança; não pode subir.
- Não commite, não faça push. Deixe na working tree e me diga os arquivos
  tocados.

## Ao terminar
Reporte com:
maestri ask "Orquestrador" "<o que fez, arquivos tocados, saida do tsc e do vitest, e o que NAO conseguiu fazer>"

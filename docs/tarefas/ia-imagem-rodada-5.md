# Rodada 5 — upload órfão + os sliders de posição/zoom quebrados

Repo: postflow--main, branch main. Working tree suja (não commitada).
Não commite, não faça push. Achados do Rafael testando no portal.

---

## BUG A — o upload ficou órfão em "Fundo do slide"

Na rodada 2 a geração por IA saiu de `fundoDoSlide` e foi para o painel
"Imagem" na capa do Editorial. Mas o UPLOAD ficou para trás:
`components/editor/EditorSidebar.tsx:1027`, o `{bgImageIsLive && <DropZone .../>}`
dentro do painel `fundoDoSlide`.

Resultado: na capa do Atelier o usuário põe imagem por upload num painel e por
IA em outro, e os dois gravam no MESMO campo. É exatamente o bug que o
comentário do bloco `imagem:` (linha ~465) diz que já foi corrigido uma vez:
"antes o upload e a geração viviam em painéis diferentes, gravando em campos
diferentes, e um vencia o outro no render sem avisar ninguém."

**O que fazer**: o upload de imagem de fundo vai para o painel "Imagem", junto
da IA e dos sliders, no ramo da capa do Editorial. Em "Fundo do slide" fica só
cor. Não duplique — mova.
Cuidado: `bgImageIsLive` (linha 183) também guarda o bloco da linha 1049
(thumb + sliders) e o aviso da 1033 (imagem legada de slide interno, que é
limpeza de dado e CONTINUA em "Fundo do slide"). Leia os três antes de mexer.

---

## BUG B — `getImageLayerStyle` (o grande)

`lib/utils.ts:83`:

    backgroundSize: fit === 'contain' ? 'contain' : 'cover',
    backgroundPosition: `${x}% ${y}%`,
    transform: `scale(${zoom / 100})`,

### Diagnóstico (confirmado, não é palpite)

1. **O slider X não faz nada, em nenhum slot.** Com `background-size: cover`, a
   porcentagem de `background-position` só desloca a imagem no eixo em que ela
   TRANSBORDA a caixa. As imagens geradas são 1024x1536 (0,667) e o slot do
   slide é 1080x1350 (0,80): a imagem é proporcionalmente mais estreita, o
   `cover` encosta pela LARGURA, e o transbordo é só vertical. Folga horizontal
   = 0, então `x%` não tem para onde mover. Vale para qualquer imagem mais
   estreita que o slot — ou seja, praticamente todas.

2. **Zoom < 100% corta a imagem.** O `transform: scale()` encolhe a CAMADA
   inteira (o div é `position:absolute; inset:0`), não o conteúdo dela. Abaixo
   de 1 a camada deixa de cobrir o slot e aparece o fundo atrás — o "a altura
   fica cortada acompanhando o zoom" que o Rafael descreveu. E mexer no Y
   "revela o resto" porque o `background-position` está reposicionando dentro de
   uma caixa menor. O zoom precisa mudar QUANTO DA IMAGEM se vê, não o tamanho
   da camada.

### Comportamento exigido

- A camada da imagem cobre o slot INTEIRO em qualquer combinação de x, y e
  zoom. Nunca pode sobrar fundo aparecendo.
- Zoom controla o quanto se vê da imagem (maior = mais perto).
- X e Y deslocam dentro da folga que existir, e são LIMITADOS: nunca dá para
  arrastar além da borda da imagem e revelar vazio.
- Onde não há folga num eixo, o slider daquele eixo não pode fingir que
  funciona. Ou ele satura de verdade, ou some/desabilita — sua escolha, mas
  escreva o porquê no código.

### Direção de implementação

- Piso do zoom passa a ser **100**, não 50 (`min={50}` nos ~8 sliders "Zoom" do
  EditorSidebar, mais o do painel da capa). Abaixo de 100 é impossível cobrir o
  slot — é o próprio bug 2. Ao subir o piso, trate o dado JÁ SALVO com zoom < 100:
  ele existe em carrossel de usuário e não pode quebrar o render; normalize na
  leitura (um `Math.max(100, zoom)` no lugar certo), não com migration.
- Com o piso em 100, o X passa a ganhar folga assim que o zoom > 100 — e em
  zoom exatamente 100 continuar sem folga horizontal é o comportamento CORRETO,
  não um bug. Deixe isso explícito num comentário.
- Mantenha a solução em **CSS puro**, sem medir a imagem em JS: este mesmo
  estilo é usado na EXPORTAÇÃO (html-to-image). Se você concluir que é
  impossível sem saber a proporção natural da imagem, PARE e me diga antes de
  introduzir medição — não quebre o export por conta própria.

### Alcance — leia antes de começar

`getImageLayerStyle` é usada por TODOS os estilos, para fundo e para conteúdo:
  components/slides/Template01Slide.tsx:335
  components/slides/Template02Slide.tsx:116
  components/slides/EditorialSlide.tsx:277 e :293
  components/slides/MinimalistSlide.tsx:192 e :242
Mudar essa função muda o render de todo carrossel já salvo e a exportação. É
uma função só — resolva NELA, não com um caso especial por estilo. E confira o
`objectFit: 'contain'`, que hoje passa pelo mesmo caminho e não pode regredir.

---

## Verificação
- `npx tsc --noEmit` limpo.
- `npx vitest run --exclude "**/.claude/worktrees/**"`: baseline
  `2 failed | 1622 passed`. Não pode subir.
- Testes de `getImageLayerStyle` para o que o diagnóstico afirma: em zoom 100 a
  camada cobre o slot; em zoom > 100 existe folga nos DOIS eixos e x/y a
  percorrem; x/y extremos não revelam vazio; zoom salvo < 100 é normalizado;
  `contain` continua se comportando como antes.
- Se você mudar a forma do estilo devolvido, os testes de render que dependem
  dele vão reclamar — conserte o teste só se a expectativa antiga era o bug.

## Ao terminar
maestri ask "Orquestrador" "<o que fez, arquivos tocados, como resolveu o cover+zoom em CSS puro, saida do tsc e do vitest, e o que NAO conseguiu fazer>"

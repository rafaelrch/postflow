# FATIA 1b — Layout do /admin: sidebar + conteúdo, em visual MINIMALISTA

Você é o Builder. Continue na branch `feat/admin-dashboard-f1`.

⚠️ **ESTA VERSÃO SUBSTITUI A ANTERIOR.** A instrução de "preservar a identidade
brutalista do CreaTools" está CANCELADA — o Rafael viu a tela e disse que fica
brutal demais para um painel de trabalho. Se você já escreveu código com bordas
grossas e sombras duras, refaça o visual. A estrutura de duas colunas continua
valendo.

Isto é LAYOUT E ESTILO. **Nenhuma métrica muda, nenhuma query muda, nenhuma
regra de autorização muda.** Se você se pegar editando `lib/admin-metrics.ts` ou
`lib/admin-auth.ts`, parou no lugar errado.

## O problema

Duas coisas ao mesmo tempo:

1. O layout gasta a tela inteira antes do primeiro dado — título editorial
   enorme, abas em pílula, subtítulo, filtro — e os cards nascem fora da dobra.
   Num painel de dados, altura vertical é o recurso escasso.
2. O visual brutalista (borda preta grossa, sombra dura deslocada, serifada
   display) compete com os números. Num painel, o design tem que sumir para o
   dado aparecer.

## Referência visual

O Rafael mandou um dashboard de referência (estilo Tempo/Linear/Vercel).
Leia estas características como especificação, não como inspiração vaga:

- **Superfícies calmas:** fundo neutro, cartão com fundo levemente distinto,
  borda de **1px** sutil e baixo contraste, canto arredondado suave (8–12px).
  **Zero sombra dura deslocada. Zero borda grossa.** Sombra, se houver, é
  quase imperceptível.
- **Tipografia de interface, uma família só.** Inter Tight, que o projeto já
  tem. **Nada de Instrument Serif no /admin.** Rótulos pequenos (12–13px) em
  cinza médio; números grandes (24–30px) em peso semibold; texto de apoio
  menor ainda. Use `tabular-nums` para os números não dançarem.
- **Ícones.** `lucide-react` já é dependência do projeto. Cada item de menu tem
  ícone; cada card tem um ícone pequeno junto do rótulo. Traço fino, tamanho
  discreto (14–16px). Ícone é apoio, não decoração.
- **Cor com parcimônia.** Paleta neutra + um acento só. Cor com significado:
  verde para variação positiva, vermelho para negativa, âmbar para atenção.
  Nunca colorir um card inteiro sem motivo. Nada de gradiente.
- **Densidade.** Cards baixos e compactos: ícone + rótulo pequeno, número
  grande logo abaixo, e uma linha de contexto ("2 mensais · 0 anuais",
  "últimos 30 dias"). É o padrão da referência e é o que faz caber na tela.
- **Filtro de período como segmented control** discreto (uma pílula com as
  opções dentro), não quatro botões soltos com sombra.

Regra de bolso: se um elemento chama atenção antes do número que ele contém,
está errado.

## ESCOPO DO VISUAL — não vaze para o produto

O app do cliente continua brutalista. **Não altere os tokens existentes em
`app/globals.css`** que o produto usa, não mexa em componente compartilhado.
Crie um escopo só do admin — tokens próprios sob um seletor/classe do layout
administrativo, ou um arquivo de estilo importado apenas por `app/admin/layout.tsx`.
Um cliente abrindo `/dashboard` não pode notar diferença nenhuma.

## Estrutura

**Sidebar fixa à esquerda, ~240px, altura cheia, não rola:**
- Topo: marca "CreaTools" com um ícone pequeno e a etiqueta "INTERNO" discreta.
- Navegação vertical com ícone + rótulo: Visão geral, Clientes, Financeiro,
  Produto, Saúde. Agrupada com um cabeçalho de grupo em cinza pequeno, como na
  referência.
- Item ativo: fundo levemente destacado + barra fina de acento à esquerda.
  **Não** um bloco preto sólido.
- Seções ainda não construídas continuam visíveis, com marcação sutil de "em
  breve" — o Rafael quer ver o mapa do que vem, sem parecer clicável e quebrado.
- Rodapé: e-mail da sessão (truncado, `title` com o valor inteiro), toggle
  claro/escuro e link de volta para `/dashboard`.

**Área de conteúdo à direita:**
- Barra de topo fina: ícone + nome da seção à esquerda; à direita, o filtro de
  período. Uma linha só, sem título display gigante.
- Cards começam perto do topo. **Meta concreta: a primeira fileira de cards
  inteira visível sem rolar em 1440x900.**
- Só esta coluna rola.

## Hierarquia dos cards

- Os de dinheiro (MRR, ARR, renovações) pesam mais que os de contagem — hoje
  estão todos idênticos. Resolva com tamanho/posição, não com cor gritante.
- **"Pagou e não criou conta" com valor > 0 tem que chamar atenção** (acento
  âmbar/vermelho discreto, ícone de alerta): é a única métrica desta tela que
  pede ação no mesmo dia. Em zero, fica quieta — "Ninguém pendurado no
  momento." está ótimo.
- Mantenha os tooltips de definição de cada métrica. Eles são o que impede o
  painel de mentir. Só troque o `?` num círculo pesado por um ícone discreto.

## Organização — a tela tem que ter ordem, não só cards bonitos

O Rafael pediu explicitamente UX/UI bem organizada. Cards soltos em grade não
são organização. Agrupe por PERGUNTA que a pessoa está fazendo, com um cabeçalho
de grupo pequeno e em cinza:

1. **Receita** — MRR, ARR, renovações previstas em 7 e 30 dias.
2. **Assinaturas** — ativas, com conta, pagou e não criou conta, cancelamentos
   agendados, distribuição mensal × anual.
3. **Aquisição** — leads no período, checkouts, contas criadas, onboarding.
4. **Uso e limites** — clientes com crédito zerado.

Dentro de cada grupo, o mais importante vem primeiro (esquerda/topo). Alinhamento
consistente: todos os rótulos na mesma altura, todos os números na mesma linha de
base, mesmo gutter entre cards. Espaçamento por escala (4/8/12/16/24), nunca
valor arbitrário.

Deixe explícito o que é FOTO DE AGORA e o que é DO PERÍODO — a tela hoje já tem
esse aviso e ele é essencial: o filtro de período não afeta MRR nem assinaturas
ativas, e misturar as duas coisas sem dizer é como o painel começa a mentir.
Mantenha esse rótulo, só num tom mais discreto.

## Dark mode

A referência é escura, e o painel já tem toggle. Os dois temas precisam ficar
bons — no escuro, fundo cinza-carvão (não preto puro), cartão um passo acima,
borda de 1px com pouco contraste, texto principal quase branco e rótulos em
cinza médio. Contraste de texto acessível nos dois.

## Responsivo

Abaixo de ~1024px a sidebar vira gaveta ou barra compacta. Nunca 240px comendo
a tela do celular. A área de conteúdo nunca rola horizontalmente.

## Preservar

- `requireAdminPage()` em toda página. Nenhuma rota nova sem guarda.
- Filtro de período na URL (`?periodo=`), preservado ao navegar entre seções.
- Todos os testes continuam passando. Se um teste quebrar por procurar
  estrutura de DOM antiga, ajuste o TESTE — nunca afrouxe a asserção de
  conteúdo.

## Verificação (obrigatória, com evidência medida)

O servidor de dev já roda na porta 3000 nesta branch. No portal, logado como
admin, meça de verdade — `offsetParent` + `getBoundingClientRect`, nunca só
presença no DOM:

1. Em 1440x900: a primeira fileira de cards está inteira acima da dobra?
   Reporte o `bottom` da fileira e a altura da viewport.
2. Sidebar visível e fixa; só a coluna direita rola.
3. Navegar entre seções mantém `?periodo=`.
4. Dark e light: sem texto com contraste quebrado.
5. Em 390x844: sidebar colapsada, sem rolagem horizontal.
6. Abra `/dashboard` como cliente e confirme que o visual do produto NÃO mudou.

Rode a suíte com `--exclude` para `.claude/worktrees` (baseline: 98 arquivos,
1392 testes, 0 falha) e `tsc --noEmit`.

## Entrega

Commit na mesma branch `feat/admin-dashboard-f1`. **Sem push, sem merge.**
Reporte com `maestri ask "Orquestrador" "<relatório>"`, incluindo os números
medidos de 1 e 5 — não escreva "cabe na tela", escreva quanto mediu.

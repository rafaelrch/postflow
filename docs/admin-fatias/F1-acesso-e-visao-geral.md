# FATIA 1 — Acesso admin + Visão Geral (só dados que já existem hoje)

Você é o Builder. Implemente APENAS esta fatia. Não comece as outras.

## Leia antes de escrever código (obrigatório)

1. `AGENTS.md` na raiz.
2. Este projeto é **Next.js 16.2.10** com breaking changes em relação ao que você
   "sabe". Leia os guias em `node_modules/next/dist/docs/` que forem relevantes
   antes de criar rotas, layouts, Server Components, cookies ou route handlers.
3. `docs/admin-dashboard-analise.md` — inventário real do banco feito pelo Codex.
   É a fonte de verdade sobre o que dá para medir hoje. **Leia inteiro.**
4. `docs/admin-dashboard-prompt.md` — a visão completa do produto final.
   Contexto apenas; NÃO implemente tudo isso agora.
5. `lib/plans.ts`, `lib/credits.ts`, `lib/subscription.ts`, `lib/supabase-admin.ts`,
   `lib/supabase-server.ts`, `proxy.ts`, `app/globals.css`.

## Contexto

O admin é UMA pessoa só: o Rafael, e-mail `rafaelrocha250304@gmail.com`.
Não existe (e não deve existir agora) sistema de papéis, convite de admin, ou
tabela `admin_users`. Não crie RBAC.

## Autorização — decisão já tomada, siga exatamente

- Allowlist de e-mails numa env var **de servidor**: `ADMIN_EMAILS`
  (lista separada por vírgula, comparação em lowercase e com trim).
- Um único helper server-only, ex. `lib/admin-auth.ts`, exportando algo como
  `requireAdmin()`, que:
  - pega a sessão pelo cliente server do Supabase (`lib/supabase-server.ts`);
  - sem sessão → 401;
  - sessão cujo e-mail não está na allowlist → 403;
  - e-mail não confirmado → 403;
  - só depois disso libera o uso do client `service_role`.
- **Toda** página e route handler sob `/admin` chama esse helper no servidor.
  Esconder link não é controle de acesso. Nunca use `user_metadata`.
- `SUPABASE_SERVICE_ROLE_KEY` nunca vai para o cliente. Nenhuma query a
  `auth.users` no browser. Se usar `auth.admin.listUsers`, é no servidor e com
  paginação.
- `proxy.ts`: adicione `/admin` aos prefixos protegidos, mas o proxy é só a
  primeira barreira — a checagem real de admin é no servidor de cada rota.
- Adicione `ADMIN_EMAILS` a `.env.local.example` (com valor de exemplo, não o
  e-mail real) e ao `.env.local` local com o e-mail real para você conseguir
  testar. Não commite `.env.local`.
- Se `ADMIN_EMAILS` não estiver definida, `/admin` nega acesso a todo mundo
  (fail closed) — nunca libere geral.

## O que construir

Rota `/admin` com layout administrativo próprio (NÃO reaproveite a shell do
dashboard do cliente; reaproveite os tokens/componentes visuais). Navegação com
as abas previstas — **Visão geral, Clientes, Financeiro, Produto, Saúde** — mas
nesta fatia só **Visão geral** funciona; as outras mostram um estado
"em construção" honesto, sem número falso.

### Visão geral — só métricas com dado real hoje

Cards, cada um com tooltip explicando a definição exata:

- Contas cadastradas (Supabase Auth, servidor)
- Assinaturas ativas (`active` ou `trialing`, com ou sem `user_id`)
- Assinantes com conta (`user_id is not null`)
- Pagou e ainda não criou conta (`user_id is null`) — **destaque**, é dinheiro
  parado esperando ação
- MRR normalizado (mensais × 59,50 + anuais × 499 ÷ 12) — leia os preços de
  `lib/plans.ts`, não hardcode
- ARR estimado (MRR × 12)
- Cancelamentos agendados (`cancel_at_period_end = true` com acesso ativo)
- Distribuição mensal × anual
- Leads no período e checkouts iniciados (leads únicos, não tentativas)
- Onboarding concluído × incompleto
- Clientes com 0 créditos
- **Renovações previstas nos próximos 7 e 30 dias** com o valor somado —
  calcule por `current_period_end` das assinaturas ativas sem cancelamento
  agendado. É caixa futuro; não existe no prompt do Codex e o Rafael vai querer.

Filtro global de período: hoje / 7 / 30 / 90 dias / intervalo custom, preservado
na URL. `pt-BR`, BRL, fuso `America/Sao_Paulo`.

Onde a comparação com o período anterior for calculável com honestidade, mostre;
onde não for, não invente variação.

### Regras de honestidade (não negociáveis)

- Zero mock. Se um número não existe, o card não existe.
- Contagem de linhas atuais (`carousels`, `news_entries`) NÃO é "uso total" —
  registros são apagados. Se exibir, rotule "conteúdo existente hoje".
- Nada de "receita recebida" nesta fatia — isso depende da tabela normalizada de
  transações da Fatia 3. Não some `subscriptions.value` e chame de receita.
- Nada de usuários online, DAU/WAU/MAU, uso de feature ou exportações — não há
  instrumentação. Não aproxime.

## Interface

Design system atual: brutalista/paper, `--paper*`, `--ink`, `--accent`, bordas
fortes, sombras `--sh-1/2/3`, Instrument Serif nos títulos, Inter Tight na
interface, JetBrains Mono nos números. Dark mode completo. Sem gradiente genérico
de dashboard SaaS. Desktop-first, mas não quebrado no celular.
Skeletons, empty states, erro com "tentar de novo".
Sem biblioteca nova de gráficos nesta fatia — SVG/CSS bastam.

## Performance

Agregação no Postgres (queries específicas ou RPC), nunca puxar todos os
usuários para somar no navegador. Índices onde os filtros por data pedirem.
Views expostas com `security_invoker`; funções `security definer` com execução
pública revogada. Não exponha tabela nova ao Data API sem necessidade.

## Testes

- Visitante em página e API `/admin` → 401.
- Usuário logado fora da allowlist → 403.
- E-mail da allowlist com caixa/espaços diferentes → passa.
- `ADMIN_EMAILS` vazia → nega todo mundo.
- Fórmula do MRR normalizado (mensal + anual) e do ARR.
- Contagem de "pagou e não criou conta".
- Renovações previstas: assinatura com cancelamento agendado NÃO entra.

Rode a suíte com `--exclude` para `.claude/worktrees` (senão dá ~488 falhas
fantasma que não são suas). Rode `tsc` e o build de produção.

## Entrega

- Trabalhe em branch nova `feat/admin-dashboard-f1`, a partir do `main`.
- **NÃO faça merge e NÃO dê push.** Merge é decisão do Rafael.
- Não altere nem apague dado existente. Nada destrutivo, dashboard é read-only.
- Ao terminar, reporte com:
  `maestri ask "Orquestrador" "<seu relatório>"`
  contendo: arquivos criados/alterados, migrations necessárias (se houver),
  resultado real dos testes/tsc/build (números, não "passou"), o que ficou de
  fora e por quê, e como eu verifico no portal.

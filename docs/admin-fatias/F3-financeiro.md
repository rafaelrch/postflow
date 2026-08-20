# FATIA 3 — Financeiro

Você é o Codex. Continue na branch `feat/admin-dashboard-f1`.

Leia antes: `AGENTS.md` (Next.js 16.2.10, consulte `node_modules/next/dist/docs/`),
`docs/admin-dashboard-analise.md` (seções "Financeiro histórico confiável" e
"Cancelamentos: ambiguidade encontrada"), `lib/asaas-webhook.ts`,
`app/api/asaas/webhook/route.ts`, `lib/subscription.ts`, `lib/plans.ts`.

## ⚠️ Esta fatia encosta no caminho do dinheiro

O webhook do Asaas é o código mais perigoso do repositório: ele está em produção,
validado com dinheiro real, e é o único caminho pelo qual um cliente que pagou
ganha acesso. **Nada nesta fatia pode aumentar a chance de um pagamento não ser
processado.**

Regra dura: a gravação analítica é **aditiva e não-bloqueante**. Se o registro
da transação falhar, o processamento do pagamento segue normalmente e a falha vai
para log. Nunca o contrário. Não reordene, não envolva o fluxo existente num
try/catch que engula erro dele, não mude o que já decide acesso.

## O problema que esta fatia resolve

Hoje o financeiro só tem o estado atual da assinatura e o payload cru do webhook.
"Receita recebida" não é uma consulta, é uma reconstrução — e interpretar
`payment_webhook_events.payload` a cada render é lento e frágil.

## Parte A — tabela normalizada de transações

Migration versionada em `supabase/migrations/` (arquivo; **não** aplique via MCP —
quem roda em produção é o Rafael).

Tabela de transações financeiras com, no mínimo: `provider_payment_id` **único**,
`provider_subscription_id`, `user_id` quando conhecido, `lead_id` quando
conhecido, status atual, valor bruto, forma de pagamento, e as datas separadas de
vencimento, confirmação, recebimento, reembolso e chargeback. Mais timestamps.

Pontos que decidem se isso presta:

- **Deduplicação.** O mesmo pagamento gera vários eventos no ciclo de vida
  (`PAYMENT_CONFIRMED`, depois `PAYMENT_RECEIVED`, depois talvez
  `PAYMENT_REFUNDED`). Upsert por `provider_payment_id`, atualizando a data
  correspondente ao evento. Somar todos os eventos é o erro clássico e dobra o
  faturamento.
- **Confirmado ≠ recebido.** São colunas diferentes e números diferentes na tela.
- **Sem receita líquida.** Taxa do Asaas não está disponível. Mostre "receita
  recebida bruta" e nada de líquido inventado.
- **Backfill** a partir de `payment_webhook_events` já existente, idempotente
  (rodar duas vezes não duplica nem corrompe). Só leitura da origem.
- RLS ligada, sem exposição ao Data API, acesso só via `service_role` depois do
  `requireAdmin`. Índices por data e por status.

## Parte B — escrever daqui pra frente

No handler do webhook, grave/atualize a transação **depois** do processamento
que já existe, de forma não-bloqueante, como descrito acima. Não mexa na
lógica de acesso, de créditos ou de assinatura.

## Parte C — a aba Financeiro

Rota `/admin/financeiro` com `requireAdminPage()`. Tire o "Em breve" só dela.

- Receita recebida no período (bruta), com série por dia/semana/mês.
- MRR e ARR ao longo do tempo — se não houver histórico confiável, mostre o
  atual e diga desde quando a série começa a existir. Não fabrique passado.
- Distribuição de assinantes e receita por plano; mensal × anual.
- Novas assinaturas, renovações e cancelamentos no período.
- Pagamentos vencidos, recusados, reembolsados e em chargeback — com link para
  o cliente correspondente na aba Clientes.
- Assinaturas com cancelamento agendado e assinaturas pagas sem conta vinculada.
- **Cobranças previstas** nos próximos 7/30 dias (o mesmo cálculo da Visão
  geral, aqui com a lista, não só o total).

Gráficos: SVG/CSS e componentes próprios. Não adicione biblioteca de gráficos
sem antes avaliar; se for indispensável, valide compatibilidade com React 19 e
Next 16 e justifique no relatório.

Churn: só mostre o que os dados sustentam. `canceled_at` é ambíguo no schema
atual (ver a análise), então **não** apresente churn histórico como se fosse
exato — ou mostre cancelamentos efetivos do período com a ressalva explícita, ou
deixe de fora com um aviso do que falta. Escolha e explique no código.

## Interface

Mesma linguagem de `app/admin/admin.css`. Somente leitura: nenhum botão que
estorne, cancele ou cobre. Skeleton, empty state, erro por bloco (um gráfico que
falha não derruba a página — mesmo princípio da Parte A da F2). Dark e light.
Sem rolagem horizontal da página.

## Testes

Deduplicação por `provider_payment_id` com a sequência confirmado → recebido →
reembolsado. Backfill idempotente. Confirmado × recebido não se misturam.
Chargeback e refund não contam como receita. Falha da gravação analítica **não**
interrompe o processamento do pagamento (teste explícito disto). Autorização da
rota nova. Período sem transação rende empty state, não zero mudo.

Baseline: `npx vitest run --exclude "**/.claude/worktrees/**"` — 1419 testes,
sendo que 2 de onboarding falham por causa do Node deste ambiente
(`--no-experimental-webstorage` resolve). Isso é pré-existente, eu confirmei no
commit anterior: **não tente consertar esses dois**. `tsc --noEmit` limpo.

## Entrega

Commits na branch `feat/admin-dashboard-f1`. **Sem push, sem merge.**
Não aplique migration via MCP — arquivo versionado e pendente do Rafael.
Já existe um servidor de dev na porta 3000; não suba outro.
Medição visual pendente é aceitável se o portal cair no login — nunca contorne
autenticação, nunca estime.

Reporte com `maestri ask "Orquestrador" "<relatório>"`: arquivos, migrations
pendentes, números reais de teste/tsc, como resolveu a dedupe, o que decidiu
sobre churn e o que ficou de fora.

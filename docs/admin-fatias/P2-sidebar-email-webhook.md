# P2 — Atalho para o admin, troca de e-mail e webhook pendente

Você é o Builder. `origin/main` = `1eae9cf`, já em produção com o painel `/admin`
e o conserto de acesso. Crie a branch `feat/p2-admin-atalho-email-webhook` a
partir do `main` atualizado.

Leia antes: `AGENTS.md` (Next.js 16.2.10 — consulte `node_modules/next/dist/docs/`),
`lib/admin-auth.ts`, `components/ui/AppSidebar.tsx`, `app/(app)/layout.tsx`,
`lib/asaas-webhook.ts`, `app/api/asaas/webhook/route.ts`, `lib/admin-health.ts`,
e o LOG do dia 15/08.

São três partes. **Um commit por parte.** Se o contexto apertar, a ordem de
prioridade é C > B > A, e me diga o que ficou.

---

## PARTE A — botão no sidebar do produto para ir ao painel

Hoje o Rafael digita `/admin` na URL. Ele quer alternar pelo menu.

- Item novo na `AppSidebar`, junto do card de usuário no rodapé, levando a
  `/admin`. Ícone lucide discreto, mesma linguagem visual do produto
  (o produto continua brutalista — **não** traga o visual do admin pra cá).
- No painel admin já existe "Voltar ao produto" apontando para `/dashboard`.
  A ida e a volta ficam simétricas.

**Segurança — o ponto que decide se isto está certo:**

- O item só aparece para admin. O booleano é calculado **no servidor**, em
  `app/(app)/layout.tsx`, reusando a decisão de `lib/admin-auth.ts`, e passado
  como prop para a `AppSidebar`. Crie uma variante que **não lança** (algo como
  `isCurrentUserAdmin()`), sem duplicar a regra: a fonte da verdade continua
  sendo `decideAdminAccess`.
- **`ADMIN_EMAILS` nunca vai para o cliente.** Nada de `NEXT_PUBLIC_`, nada de
  mandar a lista no HTML. Só o booleano.
- Esconder o link **não é** controle de acesso, e o comentário no código deve
  dizer isso: `/admin` continua protegido no servidor. Este item é conveniência.
- Teste: usuário comum não recebe o item nem o href no HTML renderizado; admin
  recebe.

---

## PARTE B — trocar o e-mail da conta

Hoje não existe: a tela manda "falar com o suporte", e o suporte é o Rafael
editando o banco na mão. Vai acontecer na primeira semana de vendas.

Na página de Configurações → aba Conta, permita trocar o e-mail.

**Isto é um vetor de tomada de conta. Trate como tal:**

- Use o fluxo nativo do Supabase (`updateUser({ email })`), que envia
  confirmação. **Nunca** escreva em `auth.users.email` com `service_role` sem
  verificação — seria trocar a identidade de uma conta sem provar que a pessoa
  controla a caixa nova.
- Confirmação nas **duas** caixas (a antiga fica sabendo). Se o projeto não
  estiver com "Secure email change" ligado, isso é configuração de painel:
  escreva no relatório para eu passar ao Rafael, não tente contornar no código.
- O e-mail só muda de fato **depois** da confirmação. Até lá, a tela mostra
  "aguardando confirmação em <novo e-mail>", com opção de cancelar/reenviar,
  e o e-mail atual continua valendo.
- Bloqueie e-mail já usado por outra conta, com mensagem clara e sem revelar
  se a outra conta existe (não vire oráculo de cadastro).
- Rate limit na rota.

**Investigue e me responda no relatório, porque muda o desenho:**

1. Alguma coisa hoje casa `auth.users.email` com `subscriptions.email`
   (o fluxo de claim faz `lower(email)`)? Se um cliente trocar o e-mail depois
   de já ter assinatura vinculada por `user_id`, nada quebra — mas **confirme
   lendo o código**, não presuma. Se houver dependência, diga qual.
2. O template "Change Email Address" do Supabase está em PT-BR? Se não estiver,
   o cliente recebe um e-mail em inglês — isso é tarefa de painel do Rafael, e
   eu registro. Não invente template no código.

Não altere o e-mail em `subscriptions` nem em lugar nenhum além do Auth.

---

## PARTE C — webhook pendente e cancelamento feito no painel do Asaas

**É a parte mais importante, e encosta no caminho do dinheiro.**

O achado: `evt_5dbdd3e48f06e3fd744ba0e8e6abd53a` (`SUBSCRIPTION_DELETED`,
14/08 17:05) está com `processed_at` nulo até hoje. A causa foi investigada: o
cancelamento pelo portal rodou **9,7s antes** do webhook chegar, gravou
`cancel_at_period_end` localmente, e o evento chegou depois e não concluiu.

Hoje é inofensivo. O problema é o outro caminho: **quando o cancelamento
começa no painel do Asaas** — e vai começar, porque o suporte é o Rafael e é lá
que ele cancela — o webhook é o **único** canal. Se ficar pendente, a assinatura
segue parecendo ativa depois do fim do período e infla o MRR do painel.

Construa:

1. **Reconciliação idempotente** de eventos com `processed_at` nulo.
   Reprocessar o mesmo evento duas vezes não pode duplicar efeito, não pode
   reabrir acesso encerrado, não pode reverter um cancelamento já registrado.
2. **`SUBSCRIPTION_DELETED` vindo de fora do produto** tem que reconciliar o
   estado local: registrar o cancelamento e encerrar a renovação, **mantendo o
   acesso até o fim do período já pago**. Cancelamento não é revogação.
3. **Nunca revogue acesso automaticamente.** Se o evento indicar algo que a
   reconciliação não sabe resolver com segurança, isso vira alerta na aba Saúde
   — quem corta cliente é o Rafael.
4. **Separe no alerta** "evento pendente" (chegou e não processou) de
   "cancelamento não refletido" (o Asaas diz cancelado e o nosso banco não
   sabe). São problemas diferentes, com urgências diferentes.
5. O webhook continua respondendo **2xx sempre**. Se começar a devolver erro, o
   Asaas pausa a fila e o estrago vira geral.

Como disparar a reconciliação: escolha e justifique no código. Pode ser na
chegada do próximo evento, uma rota administrativa protegida por
`requireAdmin`, ou verificação sob demanda. **Não** crie cron nem job de fundo
sem me perguntar. Se precisar de migration, é arquivo versionado — nunca MCP —
e não pode alterar linha existente.

O evento pendente que existe hoje **não deve ser "consertado" por migration**.
Se a reconciliação der conta dele quando rodar, ótimo; senão, ele fica no
alerta. Não escreva DML corrigindo dado de produção.

---

## Testes

Parte A: usuário comum não vê o item nem no HTML; admin vê; `/admin` continua
403 para não-admin mesmo com o link escondido/exposto.

Parte B: troca só efetiva após confirmação; e-mail antigo continua válido até
lá; e-mail duplicado é recusado sem vazar existência; sessão continua válida.

Parte C: evento pendente reprocessado uma vez concilia; reprocessado duas vezes
não duplica; `SUBSCRIPTION_DELETED` vindo do Asaas sem cancelamento local
registra o cancelamento **e preserva o acesso até `current_period_end`**;
assinatura já cancelada localmente não é alterada; webhook responde 2xx em todos
os casos; nada revoga acesso automaticamente.

Baseline: `npx vitest run --exclude "**/.claude/worktrees/**"` — 1475 testes,
com 2 falhas conhecidas de onboarding (Node deste ambiente, `localStorage`).
**Não tente consertar essas duas.** `tsc --noEmit` limpo e `npm run build`
concluindo — o build agora importa, porque isto vai para produção.

## Entrega

Branch `feat/p2-admin-atalho-email-webhook`, um commit por parte.
**Sem push, sem merge.** Migrations como arquivo, pendentes do Rafael.
Reporte com `maestri ask "Orquestrador" "<relatório>"`: arquivos, migrations,
números reais de teste/tsc/build, as duas respostas da investigação da Parte B,
como disparou a reconciliação da Parte C e por quê, e o que ficou de fora.

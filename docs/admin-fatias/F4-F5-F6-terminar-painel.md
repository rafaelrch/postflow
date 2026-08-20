# F4 + F5 + F6 — Terminar o painel administrativo

Você é o Codex. Volte para a branch `feat/admin-dashboard-f1` (a P1 já está
commitada em `fix/acesso-exige-pagamento`, não misture as duas).

Ordem do Rafael: terminar o painel. São as três fatias que faltam. **Entregue
uma de cada vez, commitando cada uma**, para eu revisar sem esperar o todo.
Se o contexto apertar, priorize F6 > F4 > F5 e me diga o que ficou.

Leia antes: `AGENTS.md`, `docs/admin-dashboard-analise.md` (é a fonte de verdade
sobre o que existe no banco), `lib/admin-metrics.ts`, `lib/admin-customers.ts`,
`lib/admin-finance.ts`, `app/admin/admin.css`, `lib/credits.ts`.

Regras que valem para as três, e não se repetem depois:
- `requireAdminPage()` em toda página nova; `requireAdmin()` em toda rota.
- Migration é **arquivo versionado**, nunca MCP. Ela não pode alterar linha
  existente. Diga no relatório quais ficaram pendentes do Rafael.
- Somente leitura no painel. Nenhum botão que altere dado de cliente.
- Nunca exibir conteúdo privado: título, texto de slide, prompt, legenda.
- Visual minimalista de `admin.css`, dark e light, sem rolagem horizontal.
- Erro por bloco: um card que falha não derruba a página, e nunca vira zero.
- Zero mock. Métrica sem dado não existe na tela — com aviso de desde quando
  a coleta começa, quando for o caso.
- Baseline atual: `npx vitest run --exclude "**/.claude/worktrees/**"`, com as
  2 falhas conhecidas de onboarding (Node deste ambiente). Não as conserte.
- Sem push, sem merge. Não suba servidor de dev novo.

---

## F6 — Saúde e alertas (FAÇA ESTA PRIMEIRO)

Subiu de prioridade: foi o painel que revelou hoje uma assinatura ativa sem
pagamento nenhum, e o Rafael só descobriu porque eu fui olhar na mão. Esta aba
existe para que a próxima vez ele seja avisado sozinho.

Rota `/admin/saude`. Alertas acionáveis, com severidade, quantidade, primeira e
última ocorrência, e link para os registros afetados.

Regras obrigatórias (as duas primeiras são as que já provaram valer):

1. **Assinatura ativa sem pagamento confirmado** — `status in (active, trialing)`,
   criada há mais que uma janela de tolerância, sem `payment_confirmed_at` e sem
   linha em `payment_transactions`. Severidade maior quando já existe `user_id`
   vinculado ou `paid_signup_intent` consumido: significa acesso concedido sem
   comprovante.
2. **`PAYMENT_CONFIRMED` com `processed_at` nulo** — evento chegou e não foi
   processado.
3. Webhook recebido e não processado há mais de 5 minutos.
4. Assinatura ativa sem `user_id` por tempo excessivo (pagou e não criou conta).
5. Assinatura ativa sem `current_period_end` — é a que some da previsão de caixa.
6. Pagamento `past_due`, `unpaid`, reembolsado, em chargeback.
7. Usuário com conta mas sem assinatura válida.
8. Onboarding incompleto após 24h; checkout iniciado sem pagamento.
9. Clientes com créditos zerados.

**Alerta nunca vira ação automática.** Nada de revogar acesso, cancelar
assinatura ou apagar dado. A tela informa; quem decide é o Rafael.

Se um alerta estiver zerado, diga "nenhuma ocorrência" — não esconda a regra.
O Rafael precisa ver que a verificação existe e está limpa.

---

## F4 — Eventos de produto, ledger de créditos e custo de IA

A base de tudo que a F5 vai mostrar. Ver "Instrumentação necessária" na análise.

**Eventos.** Tabela `product_events` (ou equivalente): `user_id`, `event_name`,
`feature`, `session_id`, `properties` JSONB validado, `created_at`. Rota
autenticada para receber: `user_id` **derivado da sessão, nunca do body**,
whitelist de eventos, propriedades validadas e limitadas, rate limit, inserção
por conexão segura, leitura bloqueada para cliente comum.

**Nunca grave** prompt, texto de carrossel, legenda, conteúdo do cliente ou
payload financeiro. Nos eventos de IA pode gravar modelo, tipo de geração,
estilo, nº de slides, idioma, créditos consumidos, duração em ms e erro
normalizado — **jamais o prompt nem a resposta**.

Instrumente pelo menos: `session_started`, `onboarding_completed`,
`carousel_created`, `carousel_generated_with_ai`, `carousel_created_manually`,
`carousel_imported_json`, `carousel_exported_single`, `carousel_exported_all`,
`image_generation_succeeded`, `image_generation_failed`, `news_batch_created`,
`schedule_created`, `checkout_started`.

Exportação acontece no navegador e hoje não deixa rastro nenhum — é a métrica
que o Rafael mais vai querer e a que exige instrumentar o cliente.

**Ledger de créditos.** Registre consumo, estorno, recarga mensal e ajuste, com
feature responsável, saldo antes, saldo depois, quantidade e timestamp.
Atomicidade com as funções atuais de consumo/estorno. Sem saldo negativo, sem
estorno duplicado. **Não altere o saldo de ninguém** ao instalar isso.

**Custo de IA.** Registre o custo estimado de cada geração (modelo + tokens ou
o que a API devolver). É o que responde se R$ 59,50 com 200 créditos dá margem —
um cliente que queima o teto todo mês pode estar dando prejuízo. Se não der para
obter custo confiável, registre o insumo bruto e **diga que é insumo, não custo**.

⚠️ As rotas de geração (`generate-carousel`, `generate-image`) cobram e estornam
crédito de cliente pagante. Instrumentação ali é **aditiva e não-bloqueante**,
igual ao webhook: se o registro falhar, a geração continua. Teste isso.

---

## F5 — Aba Produto

Em cima da F4. Rota `/admin/produto`.

DAU/WAU/MAU (usuários distintos, não sessões), stickiness DAU÷MAU, usuários
ativos por dia, conteúdo criado por dia, carrossel por IA × manual × JSON,
exportações, imagens geradas, notícias, agendamentos, features mais usadas por
eventos **e** por usuários únicos, estilos e templates mais usados, média de
slides, créditos consumidos por feature, taxa de falha da IA, usuários que
zeraram créditos, quem criou conteúdo e nunca exportou, quem pagou e nunca criou.

Tudo que depende de evento só existe a partir de agora: mostre "dados coletados
a partir de DD/MM/AAAA" em vez de fabricar passado. Contagem de linha atual
(`carousels`, `news_entries`) é "conteúdo existente hoje", nunca "total criado".

Reels está desativado por feature flag: preserve o histórico, marque como
"feature desativada" e não misture com as features vivas.

---

## Entrega

Um commit por fatia, na `feat/admin-dashboard-f1`. Reporte com
`maestri ask "Orquestrador" "<relatório>"` a cada fatia concluída: arquivos,
migrations pendentes, números reais de teste e tsc, o que ficou de fora e por
quê. Medição visual pendente é aceitável se o portal cair no login — nunca
contorne autenticação, nunca estime.

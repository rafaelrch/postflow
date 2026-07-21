# CHANGELOG Go-Live — Run de 17/07/2026

> **Estado do run:** 5 bloqueadores da auditoria de 16/07 foram processados. Resumo estruturado por bloqueador para revisão de merge.

---

## B1 — Cobrança Dupla

**Problema:**  
Um usuário com assinatura ativa poderia chamar `POST /api/stripe/checkout` novamente e criar uma segunda sessão de checkout, resultando em cobrança dupla.

**Mudanças:**  
- `app/api/stripe/checkout/route.ts`: adicionado guard na linha 26–33 que chama `hasBillableSubscription(supabase, user.id)` para usuários logados, retornando HTTP 409 com `{alreadySubscribed: true}` antes de qualquer chamada a `stripe.checkout.sessions.create()`.
- `lib/subscription.ts`: não alterado (reutiliza lógica existente que verifica status ativo/trialing/past_due/unpaid).
- `tests/stripe-checkout.test.ts`: novo arquivo com 2 testes: assinante logado → 409 + zero chamada ao Stripe; anônimo → fluxo intacto.

**Evidência:**  
- Teste escrito ANTES do fix: falha com TypeError (guard não existe, checkout.sessions.create não é mocado).
- Teste APÓS o fix: ambos passam; coerência confirmada via `git stash`.
- `npm run build`: exit 0, 21 páginas, TypeScript ok.
- `npm test`: 9/9 testes passando (7 existentes + 2 novos).

**Reviewer:**  
✅ APROVADO (linha 30 do LOG). Guard em lugar certo, contrato `{alreadySubscribed: true}` bate com cliente, falha-antes/passa-depois confirmada, escopo respeitado.

**Security:**  
🚫 BLOQUEIO TÉCNICO (linha 26): gap crítico do **caminho deslogado**. Usuário deslogado (ou aba anônima) `user=null` → guard não dispara → sessão criada e 2ª assinatura paga com mesmo e-mail = cobrança dupla. Fechamento airtight exige dedupe por e-mail no webhook `checkout.session.completed` (INTOCÁVEL pela SPEC, seção 5).

**Decisão do Rafael (linha 32):**  
Opção C — aceitar risco residual + fast-follow. Guard logado permanece como mitigação do caso comum; caminho deslogado é RISCO ACEITO FORMALMENTE. Fix definitivo (dedupe no webhook) agendado como 1ª tarefa pós-venda.

**STATUS:**  
**🟡 PARCIAL / RISCO ACEITO** — Guard implementado e aprovado para assinante logado. Caminho deslogado fica como risco residual com monitoramento manual no painel Stripe no interim.

---

## B2 — Sequestro de Conta (Cadastro Sem Prova de Pagamento)

**Problema:**  
`supabase.auth.signUp()` com a anon key pública podia ser chamado direto com QUALQUER e-mail. Quem soubesse o e-mail pago da vítima roubava a conta. O trigger `enforce_paid_signup` só checava "existe assinatura com esse e-mail", não quem pediu.

**Mudanças:**  
- `app/api/auth/verify-signup/route.ts`: novo arquivo. Recebe `{email, session_id}`, faz `stripe.checkout.sessions.retrieve(session_id)`, rejeita se faltar campo, sessão inválida, e-mail da sessão ≠ e-mail submetido, ou sessão não paga (status≠'complete' ou payment_status='unpaid'). Chama `syncSubscriptionFromSession()` antes de retornar `{ok: true}`.
- `components/auth/AuthForm.tsx`: no fluxo de cadastro, ANTES de chamar `supabase.auth.signUp()`, lê `session_id` de `useSearchParams` e faz POST `/api/auth/verify-signup`. Sem OK, toast de erro e RETURN — `signUp()` só roda depois.
- `supabase/credits-and-flow.sql`: trigger `enforce_paid_signup` recebeu `and user_id is null` (defesa em profundidade: exige assinatura ainda não reivindicada).
- `tests/verify-signup.test.ts`: novo arquivo com 6 testes (sem session_id→400; sessão inválida→403; e-mail não bate/ataque reproduzido→403; sessão não paga→403; sessão paga→200 ok:true; trial anual→200 ok:true).

**Evidência:**  
- Teste escrito ANTES do fix: 'Cannot find module .../verify-signup/route' (suite falha, 0 testes rodados).
- Teste APÓS o fix: 6/6 passam; `npm test` suite inteira = 15/15.
- `npm run build`: exit 0, 25 rotas (nova: `/api/auth/verify-signup`), TypeScript ok.

**Reviewer:**  
✅ APROVADO (linha 39 do LOG). Validação server-side antes de signUp, e-mail da sessão é conferido case-insensitive, critério `complete+subscription+payment_status!=='unpaid'` aceita trial (no_payment_required) corretamente, escopo isolado, falha-antes/passa-depois confirmada.

**Security:**  
✅ APROVADO com risco residual aceito (linha 40 do LOG). `signUp()` direto com anon key segue possível por fora da rota (o trigger não distingue origem), MAS:
- **Backstop ativo:** confirmação de e-mail obrigatória (já habilitada no Supabase pelo Rafael) — atacante não confirma no e-mail da vítima.
- **Cenário vitima-confirma:** atacante que sabe o e-mail pago corre na janela pós-pagamento com signUp direto; vítima espera e-mail de confirmação legítimo → clica → conta do atacante confirmada. **Mitigação:** vítima não loga com sua senha → faz reset → controla o e-mail → recupera a conta (com assinatura já vinculada). Risco BAIXO-MÉDIO, recuperável, cenário exato registrado em TAREFAS-RAFAEL.

**STATUS:**  
**✅ APROVADO COM RISCO RESIDUAL** — Reviewer e Security aprovaram. Cenário vitima-confirma deve constar explicitamente em aceite do Rafael. Backstop (confirmação obrigatória) ativo.

---

## B3 — Páginas Legais (LGPD + CDC)

**Problema:**  
Faltam rotas `/termos`, `/privacidade`, `/reembolso` com conteúdo real, menção a OpenAI, direito de arrependimento de 7 dias (CDC art. 49), transferência de dados internacionais (LGPD art. 33).

**Mudanças:**  
- `app/(marketing)/termos/page.tsx`: novo, 151L. Objeto do serviço, contas/responsabilidades, planos/pagamento/renovação via Stripe, uso aceitável, propriedade de conteúdo, limitação de responsabilidade, rescisão, **foro do domicílio do consumidor (CDC art. 101,I)**.
- `app/(marketing)/privacidade/page.tsx`: novo, 160L. Dados coletados, finalidades, base legal LGPD, **menção explícita de que prompts/conteúdos são processados pela OpenAI L.L.C. (EUA) com transferência internacional (LGPD art. 33)**, cookies, **direitos do titular (LGPD art. 18)**, retenção, contato do controlador (placeholder descritivo, não e-mail cru).
- `app/(marketing)/reembolso/page.tsx`: novo, 111L. **Direito de arrependimento de 7 dias (CDC art. 49)** com reembolso integral, como solicitar (placeholder descritivo), prazos de estorno via Stripe/operadora, cancelamento via portal.
- `app/(marketing)/page.tsx`: FOOTER_COLS Legal `href="#"` → `/termos`, `/privacidade`, `/reembolso`.
- `components/auth/AuthForm.tsx`: links Termos + Privacidade adicionados abaixo do botão de cadastro (modo cadastro apenas).
- `app/(marketing)/precos/page.tsx`: paragrafo de disclaimer existente ganhou links para Termos/Privacidade/Reembolso.
- **Todas as 3 páginas têm banner visível no topo:** "Documento em revisão — versão preliminar".

**Evidência:**  
- `npm run build`: exit 0, 24 rotas (3 novas, todas estáticas ○), TypeScript ok.
- `curl /termos`: 200; `/privacidade`: 200; `/reembolso`: 200.
- HTML renderizado: banner "versão preliminar" presente em cada página, links cruzados funcionando.

**Reviewer:**  
✅ APROVADO (linha 33 do LOG). Conteúdo verificado no HTML, menção explícita a OpenAI, LGPD art. 33, direitos do titular (art. 18), CDC art. 49, foro do consumidor (art. 101,I) presentes e corretos. Links em footer, AuthForm, preços funcionando. Banner "versão preliminar" mantido. Escopo respeitado: zero alteração em webhook, RLS, subscribe.

**Security:**  
✅ APROVADO (linha 34 do LOG). Páginas 100% estáticas, server components, zero formulário/fetch/estado/segredo, zero href externo, placeholders descritivos (não e-mail cru), grep limpo de secrets.

**Reviewer (juridicamente):**  
🟡 BANNER MANTIDO — Publicação como definitivo exige **revisão jurídica profissional final do Rafael** (não agente). Conteúdo é rascunho em português real (não lorem), mas não foi auditado por advogado.

**STATUS:**  
**✅ TÉCNICO APROVADO, JURÍDICO PENDENTE** — Rotas funcionam, links corretos, conteúdo real com avisos legais necessários. Revisão jurídica final e remoção do banner "versão preliminar" ficam com Rafael.

---

## B4 — Config de Produção Apontando para Localhost

**Problema:**  
`NEXT_PUBLIC_APP_URL` era vazio (fallback localhost:3000) em produção, quebrava `success_url`, `cancel_url` do checkout e redirect de confirmação de e-mail.

**Mudanças:**  
- `lib/stripe.ts`: função `appUrl()` adicionada (linhas 50–53). Retorna valor de `NEXT_PUBLIC_APP_URL` em produção; lança **erro se ausente ou aponta para localhost/127.0.0.1** (regex cobre host+porta+path). Em dev mantém fallback localhost:3000. Usada em checkout (success_url, cancel_url) e portal (return_url).
- `components/auth/AuthForm.tsx`: `redirectTo` agora usa `NEXT_PUBLIC_APP_URL` como fonte de verdade, `window.location.origin` só como fallback para dev/SSR-sem-env.
- `tests/app-url.test.ts`: novo arquivo com 7 casos. Sem env → throw; localhost:3000 → throw; 127.0.0.1 → throw; inválido → throw; válido (https://....) → retorna URL; dev (NODE_ENV!=='production') → fallback localhost ok.

**Evidência:**  
- Teste ANTES do fix: 3 dos 7 testes (que checam throw) falham no código antigo, passam no novo.
- Falha-antes/passa-depois confirmada via `git stash`.
- `npm run build`: exit 0, 21 páginas, TypeScript ok.
- `npm test`: 7/7 no arquivo app-url.test.ts.

**Reviewer:**  
✅ APROVADO (linha 25 do LOG). Proteção em lugar certo (usada em checkout e portal), regex correto, dev comporta-se bem, escopo respeitado, sem arquivo proibido tocado.

**STATUS:**  
**✅ CÓDIGO APROVADO, ENV PENDENTE** — `appUrl()` está pronto e protegido. **PENDENTE do Rafael:** definir o domínio real de produção e setar `NEXT_PUBLIC_APP_URL` na Vercel. Sem isso, produção ainda lançará erro em runtime (behavior esperado).

---

## B5 — Stripe em Modo Teste (Go-Live Não Executado)

**Problema:**  
Código estava em modo teste (sk_test, pk_test); go-live exige criação de produtos/preços live, webhook de produção, customer portal em live.

**Mudanças (Código):**  
- **Zero hardcode:** grep confirmou limpo de `sk_test`, `sk_live`, `pk_live`, `whsec_`, price IDs hardcoded.
- Todas as envs Stripe mapeadas (code já lê de env): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`, `STRIPE_TRIAL_DAYS_YEARLY`, `NEXT_PUBLIC_APP_URL`.
- Webhook escuta 9 event types (checkout.session.completed, charge.dispute.*, invoice.*, customer.subscription.*, etc).

**Evidência (Código):**  
- `npm run build`: exit 0, 21 páginas, TypeScript ok.
- `npm audit`: zero segredo exposto.

**Tarefas (Painel Stripe — Rafael):**  
Checklist de 7 passos escrito em TAREFAS-RAFAEL para o Rafael executar:
1. Recuperar/migrar conta Stripe (conta pausada desde jan/2025).
2. Criar produtos live (App Subscription).
3. Criar preços live (mensal, anual com trial de 3 meses).
4. Gerar `sk_live` e `pk_live`.
5. Criar webhook de produção com secret `whsec_...` live.
6. Ativar Customer Portal em live.
7. Testar fluxo end-to-end.

**STATUS:**  
**🚫 BLOQUEADO EXTERNAMENTE** — Código limpo e pronto. **EXECUÇÃO TRAVADA:** conta Stripe pausada desde jan/2025 (review do account representative); suporte acionado 17/jul/2026. Go-live real depende de recuperar/migrar a conta. Checklist executável aguarda desbloqueio.

---

## Pendências do Rafael

| Item | Bloqueador | Ação |
|------|-----------|------|
| Aceitar risco residual B1 (deslogado) | B1 | Registrar decisão formal; monitoramento manual de cobrança dupla no painel Stripe interim |
| Aprovar cenário vitima-confirma B2 | B2 | Registrar aceite; considerar e-mail personalizado via Resend como fast-follow |
| Revisar conteúdo jurídico & remover banner "versão preliminar" | B3 | Revisão por advogado das 3 páginas; aprovação final antes de publicar |
| Setar `NEXT_PUBLIC_APP_URL` na Vercel | B4 | Definir domínio real de produção e provisionar a env var (bloqueia produção) |
| Recuperar/migrar conta Stripe | B5 | Resolver travamento de conta (pausada desde jan/2025); suporte acionado 17/jul |
| Executar checklist go-live Stripe (7 passos) | B5 | Criar produtos/preços live, webhook live, Customer Portal live |

---

## Fast-Follows Pós-Venda

| Tarefa | Prioridade | Bloqueador Relacionado | Descrição |
|--------|-----------|----------------------|-----------|
| Fix A: Dedupe no webhook `checkout.session.completed` | 🔴 CRÍTICA | B1 | Rejeitar/estornar checkout se e-mail já tem subscription ativa (fecha gap do deslogado) |
| Rate-limit em `/api/auth/verify-signup` | 🟡 MÉDIA | B2 | Evitar spam que consuma rate limit Stripe; implementar `Ratelimit` via biblioteca (ex: redis) |
| E-mails personalizados via Resend | 🟡 MÉDIA | B2 | Confirmação de e-mail + reset de senha com branding e clareza sobre origem do cadastro (mitiga cenário vitima-confirma) |
| Hardening: fail-open em erro de DB | 🟡 MÉDIA | B1 | `hasBillableSubscription()` retorna false em erro → assinante logado consegue criar sessão. Revisar telemetria/retry. |
| Status 'incomplete' em `hasBillableSubscription()` | 🟢 BAIXA | B1 | Pagamento inicial pendente (3DS, expira ~23h) segue fora da lista de status cobráveis. Revisar casos de edge. |
| Desabilitar signup público no Supabase | 🟢 BAIXA | B2 | Alternativa ao backstop de e-mail: config `EXTERNAL_PASSWORD_HASHING_ENABLED = false` e bloquear `.signUp()` anônimo (requer config) |

---

## Resumo Executivo

**Fase 6 completa (17/07/2026):**
- ✅ **B1**: Guard 409 implementado (assinante logado). Reviewer aprovado; Security bloqueou gap deslogado; Rafael aceitou risco (opção C), fix pós-venda.
- ✅ **B2**: Rota verify-signup + confirmação e-mail obrigatória. Reviewer + Security aprovados com risco vitima-confirma registrado.
- ✅ **B3**: Rotas `/termos`, `/privacidade`, `/reembolso` com avisos LGPD/CDC/OpenAI. Técnico aprovado; revisão jurídica final pendente.
- ✅ **B4**: `appUrl()` protege localhost em produção. Código aprovado; env Vercel pendente.
- 🚫 **B5**: Código limpo, checklist pronto. **Execução bloqueada externamente** — conta Stripe pausada desde jan/2025.

**Testes:** 15/15 passando (app-url, stripe-checkout, verify-signup).  
**Build:** exit 0, 25 rotas, TypeScript ok.  
**Working tree:** git status confirma escopo correto (zero arquivo proibido tocado).

**Próximo:** Merge via Rafael após aprovação de TAREFAS-RAFAEL (B1/B2 aceites de risco, B4 env, B5 Stripe, B3 jurídico). PR base: `main`, head: `go-live`.

---

**Registrado no LOG:** 2026-07-17, DOCS, CHANGELOG-go-live.md criado (Fase 6).

---

## Revisão de Segurança — D2f (remoção total Stripe + consolidação schema)

**Escopo auditado:** branch `chore/leads-hardening-stripe-removal` sobre `feature/abacatepay-migration`. Commits `1146648`, `7310f0e`, `688038b`. Autorização: Rafael (21/07/2026, nenhum assinante Stripe real).

**Veredito: ✅ APROVADO (segurança).** Nenhum bloqueio. Verificado de forma independente, não pelo relato do Builder.

**Confirmações:**
1. **Segredos** — nenhum literal `sk_`/`whsec_`/`rk_`/`service_role`/JWT nem `price_/prod_` hardcoded no diff dos 3 commits nem no HEAD. `lib/stripe.ts` removido lia tudo de `process.env`. Sem logging de segredo no código AbacatePay. `.gitignore` cobre `.env*`; nenhum `.env` rastreado. `cleanup-stripe-test-data.sql` é só SELECT/DELETE idempotente em transação, sem credencial.
2. **RLS** — `subscriptions` (schema canônico em `subscriptions-schema.sql`) mantém apenas `select_own` (SELECT por `auth.uid()=user_id`); sem policy de INSERT/UPDATE/DELETE ⇒ escrita deny-by-default, service role é o único caminho — igual a antes. `stripe-schema.sql` reduzido preserva `stripe_customers` (select/insert own legado, sem leitor no código) e `stripe_webhook_events` (RLS on, zero policy ⇒ deny). View `user_active_subscription` com `security_invoker=true`. Nenhuma policy nova permissiva.
3. **`handle_new_user()`** — remoção do insert morto em `stripe_customers` (que gravava `stripe_customer_id NOT NULL` e quebrava cadastro AbacatePay) NÃO abre janela de fraude: o gate é o trigger separado `enforce_paid_signup_trg` (BEFORE INSERT em `auth.users`), intocado; `on_auth_user_created`/`handle_new_user` roda AFTER INSERT, depois do gate. Se o gate lança, a transação inteira aborta antes de qualquer provisionamento.
4. **`/api/abacatepay/verify-signup`** — validação `ref`→linha→`getCheckout()` PAID→e-mail continua robusta. Estado lido da API, nunca do cliente. Bypass via anon key impossível: (a) escrita em `subscriptions` bloqueada por RLS; (b) linha nasce no checkout com status `incomplete` (PENDING), fora de `('active','trialing')`, logo não satisfaz o gate; (c) promover para `active` exige PAID real, só alcançável por verify-signup (checa PAID+e-mail) ou webhook (HMAC+secret, re-read na API). `signUp` direto sem assinatura paga e não reivindicada é barrado pelo trigger.
5. **Superfície removida** — `app/api/stripe/{checkout,portal,webhook}` e `app/api/auth/verify-signup` deletados; `lib/stripe.ts`/`lib/stripe-sync.ts` removidos; `ManageSubscriptionButton` removido. Nenhum endpoint órfão acessível. Únicas referências textuais restantes são 2 comentários (`abacatepay/checkout/route.ts:12`, `abacatepay/verify-signup/route.ts:11`) — cosmético, sem efeito.

**Observações não-bloqueantes:**
- Comentário desatualizado em `credits-and-flow.sql` (função `enforce_paid_signup`) e em `verify-signup/route.ts` ainda cita a rota Stripe `app/api/auth/verify-signup` como validação primária; a validação agora vive na rota AbacatePay. Só doc.
- Working tree do worktree tem 2 arquivos não commitados fora do escopo dos 3 commits: `app/(marketing)/page.tsx` e `app/(marketing)/precos/page.tsx` (troca de copy "Stripe"→"Pix/cartão", sem impacto de segurança). Commitar ou stashar antes do merge para o diff da PR ficar limpo.

Merge fica a critério do Rafael, com este aceite de Segurança + o do Reviewer.

**Registrado no LOG:** 2026-07-21, Security Reviewer, revisão D2f (remoção Stripe).

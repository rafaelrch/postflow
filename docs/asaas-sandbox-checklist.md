# Validação do Asaas em sandbox

Roteiro manual para provar que a integração funciona ponta a ponta **antes**
de trocar para produção. Os testes automatizados (`npx vitest run tests/`)
cobrem a lógica — mapeamento de eventos, idempotência, assinatura de token,
validação de entrada. O que **não** dá para automatizar é a conversa real com
o Asaas, e é isso que este documento cobre.

Nada aqui toca produção. A conta sandbox é separada, tem chave própria
(`$aact_hmlg_`) e dashboard próprio em `sandbox.asaas.com`.

---

## 0. Antes de começar

**Variáveis no `.env.local`:**

```bash
ASAAS_API_KEY=$aact_hmlg_...        # do dashboard SANDBOX, não do de produção
ASAAS_ENV=sandbox
ASAAS_WEBHOOK_TOKEN=                # você inventa: 32+ caracteres, sem espaços
SIGNUP_TOKEN_SECRET=                # openssl rand -base64 48
NEXT_PUBLIC_APP_URL=https://SEU-TUNEL   # ⚠️ NÃO pode ser localhost
```

> ⚠️ **`NEXT_PUBLIC_APP_URL` precisa ser a URL do túnel, não `localhost:3000`.**
> O Asaas recusa o checkout com "O campo successUrl é inválido" se os callbacks
> apontarem para localhost. Verificado contra o sandbox em 12/08.

O cliente recusa a combinação errada de chave e ambiente **antes** de qualquer
requisição sair — se você colar a chave de produção com `ASAAS_ENV=sandbox`,
ele lança em vez de cobrar de verdade. É proposital.

**Expor o webhook local.** O Asaas precisa alcançar sua máquina:

```bash
ngrok http 3000
# ou: cloudflared tunnel --url http://localhost:3000
```

**Registrar o webhook** no dashboard sandbox (Integrações → Webhooks) ou via
`POST /v3/webhooks`. URL: `https://SEU-TUNEL/api/asaas/webhook`. Token: o mesmo
`ASAAS_WEBHOOK_TOKEN`. Eventos a assinar: ver `docs/asaas-webhook.md`.

---

## 1. Fluxo feliz: do plano ao acesso

- [ ] Abrir `/precos` e clicar em **Assinar mensal**
- [ ] Preencher o popup (nome, e-mail, telefone) e enviar
- [ ] **Conferir no banco** que a linha entrou em `public.leads` *antes* do
      redirect. Se o lead não gravou, o pagamento não terá como ser
      reconhecido depois — é a peça que amarra tudo.
- [ ] Ser redirecionado para o checkout hospedado do Asaas
- [ ] Pagar com um cartão de teste do sandbox
      (só cartão: o Asaas não aceita PIX em assinatura recorrente)
- [ ] Voltar em `/assinatura/sucesso` e ver "estamos confirmando seu pagamento"
- [ ] **Conferir que a linha em `subscriptions` nasceu com `user_id` NULL**,
      `status='active'`, `payment_provider='asaas'` e `external_reference`
      igual ao id do lead
- [ ] Criar a conta com **o mesmo e-mail que pagou** e conferir que entra
- [ ] Conferir que `user_credits` foi provisionado (200 no mensal, 300 no anual)

> ⚠️ O acesso é liberado pelo **webhook**, nunca pela página de sucesso. Se
> você chegar em `/assinatura/sucesso` e a assinatura não aparecer no banco, o
> problema é o webhook não estar chegando — não a página.

## 2. O gate de cadastro segura mesmo

- [ ] Tentar criar conta com um e-mail que **não** pagou → deve falhar com
      `paid_subscription_required`
- [ ] Tentar criar uma **segunda** conta com o e-mail que já reivindicou a
      assinatura → deve falhar. É a proteção do `user_id is null`: uma
      assinatura paga vale por uma conta, não por N.

## 3. Idempotência do webhook

- [ ] Reenviar o **mesmo evento** pelo dashboard do Asaas (ou repetir a
      requisição à mão com o mesmo `id`)
- [ ] Conferir que a segunda entrega responde 2xx e **não** reprocessa
- [ ] Conferir em `payment_webhook_events` que existe **uma** linha para
      aquele `event_id`, com `processed_at` preenchido

## 4. Autenticação do webhook

- [ ] Chamar `/api/asaas/webhook` com `asaas-access-token` **errado** → 401
- [ ] Chamar **sem** o header → 401
- [ ] Conferir que nada foi gravado em `payment_webhook_events` nesses casos

```bash
curl -i -X POST https://SEU-TUNEL/api/asaas/webhook \
  -H 'Content-Type: application/json' \
  -H 'asaas-access-token: token-errado' \
  -d '{"id":"evt_teste","event":"PAYMENT_CONFIRMED"}'
```

## 5. Ações de sandbox (transições de estado)

O sandbox tem endpoints para forçar transições sem esperar o mundo real.
Confirme os paths atuais na referência antes de usar.

- [ ] **Confirmar pagamento** de uma cobrança pendente → conferir que o acesso
      é liberado (`PAYMENT_CONFIRMED`)
- [ ] **Forçar vencimento** de uma cobrança → conferir que a assinatura vai
      para `past_due` (`PAYMENT_OVERDUE`)
- [ ] Conferir que `PAYMENT_RECEIVED` **não** é o que libera acesso — no cartão
      ele chega ~32 dias depois do CONFIRMED, e usá-lo como gatilho deixaria
      todo assinante um mês sem acesso

## 5b. O que NÃO dá para testar (e por quê)

- **PIX**: o Asaas recusa `billingTypes: ["PIX"]` quando `chargeTypes` inclui
  `RECURRENT` — "CREDIT_CARD é o único método permitido para operações
  RECURRENT". PIX só existe em cobrança avulsa (`DETACHED`), que exigiria
  renovação manual a cada ciclo. Se você quiser vender por PIX, é outro
  produto, não um ajuste de configuração.

## 6. Cartão recusado

- [ ] Usar um cartão de teste que falha na captura
- [ ] Conferir o comportamento em `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`:
      o usuário deve ser avisado para atualizar o cartão, e o acesso **não**
      deve ser liberado

## 7. Cancelamento

- [ ] Cancelar via `POST /api/asaas/cancel` (autenticado)
- [ ] Conferir no dashboard do Asaas que a assinatura saiu
- [ ] Conferir que a linha local ficou `status='canceled'` com `canceled_at`

> Não há UI de cancelamento de propósito — o Asaas não tem portal do cliente
> como a Stripe tinha, e o cancelamento segue manual por decisão de negócio.
> A rota existe para o caminho de servidor estar pronto e testado.

---

## Antes de virar a chave para produção

- [ ] `ASAAS_ENV=production` **e** chave `$aact_prod_` — os dois juntos, nunca
      um só
- [ ] Webhook registrado na conta de **produção**, com token próprio
- [ ] `SIGNUP_TOKEN_SECRET` de produção, diferente do de sandbox
- [ ] `NEXT_PUBLIC_APP_URL` apontando para o domínio público (o `appUrl()`
      recusa localhost em produção e falha alto — de propósito)
- [ ] **Tokenização de cartão**: peça a liberação ao gerente de contas. Sem
      ela, trocar de plano não pode alterar a assinatura existente — o código
      cai no fallback de cancelar e criar outra (ver
      `lib/asaas-subscription-admin.ts`)

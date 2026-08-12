# Webhook do Asaas

Runbook de configuração do webhook que confirma os pagamentos.

Endpoint da aplicação: `POST /api/asaas/webhook`
URL pública: `https://<seu-dominio>/api/asaas/webhook`

Código: `app/api/asaas/webhook/route.ts` (I/O) e `lib/asaas-webhook.ts` (regra).

## Antes de registrar

Configure `ASAAS_WEBHOOK_TOKEN` no ambiente da aplicação **antes** de cadastrar
o webhook no Asaas. Sem a variável, a rota recusa tudo com 500 — de propósito:
um ambiente mal provisionado deve falhar alto, nunca aceitar qualquer chamada.

Regras do token (impostas pelo Asaas): 32 a 255 caracteres, sem espaços. Nunca
use a própria API key. Gere com `openssl rand -base64 48`.

## Registrar

### Pelo painel

Integrações → Webhooks → adicionar. Preencha a URL, marque como ativo, escolha
o tipo de envio e cole o mesmo valor de `ASAAS_WEBHOOK_TOKEN` no campo de token
de autenticação.

### Pela API

`POST /v3/webhooks` — todos os campos são obrigatórios:

```json
{
  "name": "Creatools — pagamentos",
  "url": "https://<seu-dominio>/api/asaas/webhook",
  "email": "<e-mail que recebe aviso de fila pausada>",
  "enabled": true,
  "interrupted": false,
  "apiVersion": 3,
  "authToken": "<o mesmo valor de ASAAS_WEBHOOK_TOKEN>",
  "sendType": "SEQUENTIALLY",
  "events": [
    "PAYMENT_CONFIRMED",
    "PAYMENT_RECEIVED",
    "PAYMENT_OVERDUE",
    "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
    "PAYMENT_REFUNDED",
    "PAYMENT_CHARGEBACK_REQUESTED",
    "SUBSCRIPTION_CREATED",
    "SUBSCRIPTION_UPDATED",
    "SUBSCRIPTION_INACTIVATED",
    "SUBSCRIPTION_DELETED"
  ]
}
```

O `email` não é decoração: é para lá que o Asaas avisa quando a fila é
interrompida. Use um endereço que alguém realmente leia.

Assine **apenas** esses 10 eventos. A lista do Asaas tem cerca de 30; os outros
cairiam em `ignore` — funcionam, mas só geram tráfego e ruído no log.

`sendType: SEQUENTIALLY` entrega em ordem, uma de cada vez. É o mais seguro
aqui, já que a ordem entre `PAYMENT_CONFIRMED` e os eventos de assinatura
importa para o estado final.

## Como o Asaas envia

O token volta no header `asaas-access-token` de **toda** entrega. É a única
barreira: o Asaas **não assina o corpo** (não há HMAC como na Stripe ou na
AbacatePay). A rota compara em tempo constante e responde 401 se não bater.

## ⚠️ 15 falhas consecutivas PAUSAM A FILA

Para o Asaas considerar o evento entregue, a resposta precisa ser **2xx**.

- Falhas consecutivas penalizam a fila (backoff).
- Na **15ª falha consecutiva**, a fila de sincronização é **INTERROMPIDA** — e
  não só para esse evento: para **todos** os pagamentos da conta.
- Eventos pendentes ficam retidos por **14 dias**; depois disso são apagados em
  definitivo.

Ou seja, uma exceção não tratada nessa rota pode derrubar silenciosamente o
recebimento de pagamentos do produto inteiro. Por isso a rota trata erro de
regra de negócio como **log + 200**, e só devolve não-2xx em dois casos:

| Situação | Resposta | Por quê |
| --- | --- | --- |
| Token não confere / ausente | 401 | Chamada não autenticada não pode contar como entregue |
| `ASAAS_WEBHOOK_TOKEN` não configurada | 500 | Ambiente quebrado deve falhar alto |
| Corpo não é JSON | 400 | Nenhuma reentrega conserta um corpo ilegível |
| Erro ao processar a regra | **200** | Preservar a fila; o evento fica com `processed_at` null |

### Se a fila for pausada

O Asaas avisa por e-mail. Reative pelo painel (Integrações → Webhooks) ou pela
API, depois de corrigir a causa. Antes de reativar, veja o que ficou pendente:

```sql
select event_id, event_type, received_at
  from public.payment_webhook_events
 where processed_at is null
 order by received_at desc;
```

## Idempotência

A chave é o campo `id` do evento, gravado como PK em
`public.payment_webhook_events`.

O registro acontece **antes** do processamento, não depois. É isso que dá
idempotência de verdade: uma reentrega colide na PK e sai sem reprocessar,
inclusive quando as duas entregas chegam em paralelo. Gravar depois deixaria
aberta a janela entre processar e registrar.

`processed_at` só é preenchido no fim, com sucesso. **Linha com `processed_at`
null é evento que morreu no meio** — é o rastro de diagnóstico e a lista do que
reprocessar.

## Mapeamento de eventos

| Evento | Efeito | Status interno |
| --- | --- | --- |
| `PAYMENT_CONFIRMED` | **libera/renova acesso** | `active` |
| `PAYMENT_RECEIVED` | confirma recebimento (conciliação) | *não altera* |
| `PAYMENT_OVERDUE` | tolerância / avisar usuário | `past_due` |
| `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` | pedir novo cartão | `unpaid` |
| `PAYMENT_REFUNDED` | revoga acesso | `canceled` |
| `PAYMENT_CHARGEBACK_REQUESTED` | revoga acesso | `canceled` |
| `SUBSCRIPTION_CREATED` | sincroniza | derivado do status cru |
| `SUBSCRIPTION_UPDATED` | sincroniza | derivado do status cru |
| `SUBSCRIPTION_INACTIVATED` | encerra ao fim do ciclo pago | `cancel_at_period_end` |
| `SUBSCRIPTION_DELETED` | encerra ao fim do ciclo pago | `cancel_at_period_end` |

### ⚠️ O gatilho de liberação é `PAYMENT_CONFIRMED`, não `PAYMENT_RECEIVED`

No cartão de crédito os dois são separados por cerca de **32 dias**:
`PAYMENT_CONFIRMED` é a aprovação pela operadora (o cliente já pagou, o acesso
começa agora); `PAYMENT_RECEIVED` é quando o dinheiro cai na conta Asaas.

Trocar um pelo outro deixaria **todo assinante de cartão um mês sem acesso**, e
o defeito só apareceria em produção, um mês depois, pela boca do cliente.

### Vocabulário de status

O banco tem CHECK em `active | trialing | past_due | unpaid | canceled`. O
status cru do Asaas vai para `subscription_status`, sem tradução, para debug.

O Asaas **não tem** `past_due` para assinatura — os status dele são
`ACTIVE | EXPIRED | INACTIVE`, e quem fica `OVERDUE` é a **cobrança**. Por isso
`past_due` nasce de `PAYMENT_OVERDUE`, nunca do status da assinatura.

## O e-mail gravado é o do PAGADOR

O cadastro posterior casa por `lower(email)`
(`enforce_paid_signup_precondition`), então o e-mail na assinatura precisa ser o
de quem **pagou** — não o digitado no popup de lead. Nada impede a pessoa de
informar outro endereço no checkout hospedado.

O payload de cobrança traz só `customer` (`cus_xxx`), nunca o e-mail, então a
rota faz `GET /v3/customers/{id}`. Divergência entre o e-mail do lead e o do
pagador é registrada no log (`payer_email_differs`) e vence o do pagador.

## Testar

Sandbox: dispare um pagamento de teste e acompanhe. Localmente, exponha a porta
(ngrok/cloudflared) e registre a URL pública temporária como um webhook
**separado** — não aponte o webhook de produção para a sua máquina.

Os testes automatizados cobrem autenticação, idempotência, cada evento do
mapeamento e a tolerância a payload desconhecido:

```
npx vitest run tests/asaas-webhook.test.ts tests/asaas-webhook-route.test.ts
```

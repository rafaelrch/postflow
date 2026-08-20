# P1 — Acesso só com pagamento confirmado

Você é o Codex. Branch: crie `fix/acesso-exige-pagamento` a partir de
`feat/admin-dashboard-f1`. Isto NÃO é uma fatia do painel — é conserto no
caminho do dinheiro.

Leia antes: `AGENTS.md`, `app/api/asaas/webhook/route.ts`, `lib/asaas-webhook.ts`,
`lib/subscription.ts`, `lib/orphan-signup-notice.ts`, o fluxo de
`paid_signup_intents` e `claim_paid_signup_for_user` nas migrations, e o LOG do
achado (registrado em 15/08).

## O problema, com evidência

`sub_8ckz67pg3efhn7t3` nasceu `active`, valor 59,50, `provider_payment_id` NULL,
a partir de **um único** evento `SUBSCRIPTION_CREATED`. Nenhum evento de
pagamento jamais existiu. Dez segundos depois a conta foi criada e o
`paid_signup_intent` consumido. **Acesso concedido sem comprovante de pagamento.**

O Rafael decidiu fechar isso: acesso passa a exigir pagamento confirmado.

## O RISCO que você tem que administrar

Apertar demais é pior que o problema. Se o cadastro passar a exigir
`PAYMENT_CONFIRMED` e o cliente chegar na tela nos segundos entre a assinatura
ser criada e o pagamento confirmar, ele vê erro depois de ter pago. Trocar
"alguém entra de graça" por "quem pagou não entra" é um péssimo negócio.

Por isso:

- **Nunca** um erro seco para quem pagou. Estado de espera explícito e honesto:
  "estamos confirmando seu pagamento", com o e-mail de aviso que já existe
  (`orphan-signup-notice`) cobrindo quem ficar pendurado.
- Quando o `PAYMENT_CONFIRMED` chegar depois, o acesso tem que ser concedido
  **sozinho**, sem o cliente precisar fazer nada nem falar com você.
- O webhook continua respondendo 2xx sempre. Não pause a fila do Asaas.

## Investigue antes de decidir o desenho

1. **Quais formas de pagamento o checkout aceita hoje?** Se PIX ou boleto
   estiverem habilitados, este furo é muito pior do que parece: a assinatura
   nasce, o boleto nunca é pago, e a pessoa usa para sempre. Isso muda a
   urgência e talvez o desenho. Responda com evidência do código/config.
2. **O Asaas emite `SUBSCRIPTION_CREATED` antes do primeiro pagamento em todos
   os métodos?** Qual é a janela típica no cartão? Use a documentação oficial,
   não suposição.
3. O que exatamente hoje transforma `SUBSCRIPTION_CREATED` em acesso: qual
   linha marca `status = 'active'` e qual permite o claim do cadastro.

Traga essas três respostas no relatório. Se alguma mudar o desenho que você
escolheu, diga isso explicitamente.

## O que construir

Assinatura criada sem pagamento confirmado **não concede acesso**. Ela existe,
fica registrada, e aguarda. Só vira acesso quando o pagamento confirmar.

Escolha o mecanismo (status intermediário, coluna de comprovação, verificação no
claim — o que couber melhor no schema atual) e **justifique no código**. O que
não é negociável:

- `SUBSCRIPTION_CREATED` sozinho nunca resulta em conta com acesso.
- `PAYMENT_CONFIRMED` chegando depois concede o acesso automaticamente.
- Quem já tem acesso hoje **não perde nada**. Proibido revogar retroativamente:
  nenhum `update` que desative assinatura existente, nenhuma migration que mexa
  em linha já ativa. A mudança vale para eventos novos. Se você achar que uma
  assinatura antiga está irregular, ela vira ALERTA na aba Saúde, nunca revogação
  automática — quem decide cortar acesso de um cliente é o Rafael.
- O caminho de quem paga com cartão e confirma em segundos continua fluido.

## Testes — esta é a parte que mais importa

- Cliente paga com cartão, `SUBSCRIPTION_CREATED` e `PAYMENT_CONFIRMED` chegam
  em sequência: acesso concedido, como hoje.
- Só `SUBSCRIPTION_CREATED`: **sem acesso**, sem conta liberada, sem intent
  consumido de forma que dê acesso.
- `PAYMENT_CONFIRMED` chegando minutos ou dias depois: acesso concedido sozinho.
- Eventos fora de ordem (pagamento antes da assinatura): não quebra.
- Evento duplicado: não concede duas vezes nem corrompe estado.
- Assinatura JÁ ativa antes desta mudança: continua ativa, intocada.
- Webhook responde 2xx em todos os casos acima.
- O e-mail de aviso continua sendo disparado para quem paga e não conclui o
  cadastro, sem duplicar.

Baseline: `npx vitest run --exclude "**/.claude/worktrees/**"` — 1439 testes, com
as 2 falhas de onboarding conhecidas do Node deste ambiente. Não tente
consertá-las. `tsc --noEmit` limpo.

## Entrega

Branch `fix/acesso-exige-pagamento`. **Sem push, sem merge.** Se precisar de
migration, é arquivo versionado — nunca MCP, e ela não pode alterar linha
existente.

Este commit vai para produção e decide quem entra no produto pago. No relatório,
me diga em uma frase o que acontece com um cliente real que paga agora, e o que
acontece com um que paga e o `PAYMENT_CONFIRMED` some.

Reporte com `maestri ask "Orquestrador" "<relatório>"`.

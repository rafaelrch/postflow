# Análise técnica — Dashboard Administrativo do CreaTools

Data da análise: 15/08/2026.

## Escopo e ressalva

Esta análise foi feita por inspeção do repositório, schemas, migrations e fluxos da aplicação. Ela não consultou o banco de produção nem o painel do Asaas. Portanto, descreve quais dados o sistema modela e consegue produzir, não os valores reais atuais de clientes, receita ou uso.

Os principais arquivos examinados foram:

- `package.json`
- `proxy.ts`
- `app/globals.css`
- `lib/plans.ts`
- `lib/credits.ts`
- `lib/subscription.ts`
- `lib/supabase-admin.ts`
- `lib/supabase-server.ts`
- `lib/asaas-webhook.ts`
- `lib/asaas-subscription-admin.ts`
- `app/api/asaas/webhook/route.ts`
- `app/api/asaas/cancel/route.ts`
- `app/api/generate-carousel/route.ts`
- `app/api/generate-image/route.ts`
- `components/editor/CreateWizard.tsx`
- `hooks/useAutoSave.ts`
- `hooks/useExport.ts`
- `supabase/schema.sql`
- `supabase/reels-schema.sql`
- `supabase/leads-schema.sql`
- `supabase/credits-and-flow.sql`
- `supabase/migrations/20260812_asaas_migration.sql`
- `supabase/migrations/20260812b_checkout_refs.sql`
- `supabase/migrations/20260814_backfill_current_period_end.sql`

## Resumo executivo

O CreaTools já possui dados suficientes para uma primeira versão administrativa de clientes, assinaturas, plano atual, MRR estimado, leads, onboarding, quantidade de conteúdo existente, saldo de créditos e saúde básica do webhook.

Por outro lado, o sistema não possui hoje uma camada de analytics de produto. Não há registro confiável de sessões, usuários online, exportações, utilização de feature, consumo histórico de créditos por recurso, retenção, DAU/WAU/MAU ou falhas de IA. Esses indicadores só poderão ser calculados corretamente depois de instrumentação nova.

O financeiro também guarda principalmente o estado atual da assinatura e payloads brutos de webhook. Isso permite auditoria e algumas reconstruções, mas não é uma base normalizada para receita recebida, reembolsos, chargebacks e histórico financeiro por pagamento.

O ponto de maior risco conceitual é o cancelamento: `subscriptions.canceled_at` possui mais de um significado no código atual. Ele pode representar a solicitação do cancelamento, o cancelamento imediato, um reembolso/chargeback ou um evento posterior de encerramento. Por isso não é uma fonte suficiente para churn histórico ou para separar cancelamento voluntário de involuntário.

## Stack e arquitetura observadas

- Next.js 16.2.10 com App Router.
- React 19.2.4.
- TypeScript.
- Tailwind CSS 4.
- Supabase Auth, Postgres, Storage e biblioteca SSR.
- Asaas como provedor de pagamento.
- OpenAI para geração de carrosséis e imagens.
- Vitest para testes.
- Aplicação com RLS por proprietário nas tabelas de produto.
- Cliente `service_role` já existe em `lib/supabase-admin.ts` e é explicitamente tratado como servidor-only.

O `AGENTS.md` determina que os guias locais em `node_modules/next/dist/docs/` sejam consultados antes de qualquer código Next.js, porque esta versão possui mudanças incompatíveis com conhecimento anterior.

## Modelo comercial confirmado no código

A fonte central de preços é `lib/plans.ts`:

- Plano Mensal: R$ 59,50, ciclo `MONTHLY`.
- Plano Anual: R$ 499, ciclo `YEARLY`.
- Não há plano gratuito no fluxo atual.

A fonte de custos de crédito é `lib/credits.ts`:

- Geração de carrossel com IA: 5 créditos.
- Geração de imagem com IA: 5 créditos.
- Criação manual, edição e Notícias não consomem créditos.

Allowance mensal:

- Plano Mensal: 200 créditos por mês.
- Plano Anual: 300 créditos por mês.

O plano anual é cobrado anualmente, mas o saldo de créditos continua trabalhando em períodos mensais por meio de `user_credits` e da lógica de reset.

## Autenticação e autorização atuais

O sistema possui autenticação de usuário comum, mas não possui papel de administrador nem área `/admin`.

O `proxy.ts` protege as rotas normais do produto somente pela presença de uma sessão. Ele não faz distinção de papéis. Os prefixes protegidos atuais incluem dashboard, generator, agenda, news, onboarding, conta e configurações, mas não existe uma regra administrativa.

Existem valores em `app_metadata` usados pelo fluxo pago/passwordless, como `origin` e `password_set`. Não foi encontrada uma claim ou tabela de papel administrativo, como `role`, `is_admin`, `admin_users` ou equivalente.

Consequências:

- Uma nova área administrativa precisa de autorização real no servidor.
- Apenas esconder um link na sidebar não protegeria os dados.
- O `service_role` só pode ser usado após validar sessão e papel administrativo.
- `auth.users` não deve ser lido pelo navegador; a listagem deve ocorrer no servidor, por API administrativa apropriada ou outra solução privilegiada segura.
- `user_metadata` não deve ser usado para decisões de autorização porque é editável pelo usuário.

## Inventário das tabelas e dados disponíveis

### `auth.users`

Fonte real das contas autenticadas. Possui dados como ID, e-mail, datas de criação/confirmação e informações de login mantidas pelo Supabase Auth.

Uso potencial no admin:

- Total exato de contas cadastradas.
- Data de cadastro.
- E-mail confirmado.
- Último login, deixando claro que “último login” não é “última atividade no produto”.

Limitação: não deve ser consultada pelo cliente. `profiles` não deve ser usado silenciosamente como sinônimo de `auth.users`, pois o fluxo pago cria/vincula o perfil em etapas específicas e inconsistências operacionais podem fazer os totais divergirem.

### `profiles`

Principais colunas:

- `id`, ligado ao usuário.
- `name`, `handle`, `phone`, `photo_url`.
- `workspace_name` e `brand_name`.
- Handles sociais.
- Identidade de marca, nicho, audiência, tom e objetivos.
- `onboarding_completed`.
- `created_at` e `updated_at`.

Uso potencial:

- Nome e avatar do cliente.
- Conclusão do onboarding.
- Segmentações agregadas por nicho ou objetivo, desde que respeitem privacidade.
- Data do perfil.

Não é recomendável exibir no admin o conteúdo textual privado da estratégia de marca. Para o dashboard bastam metadados, status e contagens.

### `projects`

Principais colunas:

- `id`, `user_id`.
- Nome, descrição, nicho, audiência, tom e objetivos.
- `status` com `active` ou `archived`.
- Timestamps.

Uso potencial:

- Quantidade de projetos/workspaces por usuário.
- Projetos ativos versus arquivados.

### `carousels`

Principais colunas:

- `id`, `user_id`, `project_id` e `template_id`.
- `title` e `description`.
- `style`.
- `status`: `draft`, `ready`, `published` ou `archived`.
- `source_kind` e `source_id`.
- Tema, fontes, cor, configurações e metadados.
- `caption`, hashtags.
- `published_at`, `archived_at`, `created_at` e `updated_at`.

Estilos aceitos pelo schema atual:

- `minimalist`
- `profile`
- `editorial`
- `template01`
- `template02`

Uso potencial:

- Quantidade atual de carrosséis.
- Criação por dia/período, considerando apenas itens que ainda existem.
- Distribuição por estilo.
- Distribuição por status.
- Clientes que já criaram ao menos um carrossel.
- Frequência aproximada de criação.

Limitações:

- O modo de criação não é persistido de forma explícita. O wizard permite IA, manual e JSON, mas o insert em `carousels` não grava `creation_mode`.
- Um carrossel apagado desaparece do histórico, então contar linhas não representa toda a atividade passada.
- `updated_at` mostra alteração do documento, não necessariamente uma ação relevante de produto.
- Exportações não alteram essa tabela.

### `slides`

Possui o conteúdo e configurações visuais de cada slide, ligado a `carousels` por `carousel_id`, além de `position`, campos de texto, imagens, layout, overrides de template e timestamps.

Uso potencial:

- Número médio e distribuição de slides por carrossel.
- Uso de modelos dos templates 1 e 2.
- Presença de imagens nos carrosséis, com cuidado para não expor conteúdo.

Limitação: a tabela representa o estado atual dos slides. O autosave substitui os slides com delete + insert; ela não funciona como histórico de edições.

### `news_entries`

Principais colunas:

- `id`, `user_id`, `project_id`.
- Título, tópico, descrição, fontes e imagens.
- Caption e hashtags.
- `raw_payload` JSONB.
- `status` e relação com carrossel.
- Timestamps.

O código agrupa cards de uma mesma criação pelo valor `raw_payload.batch_id`.

Uso potencial:

- Quantidade atual de cards de notícia.
- Quantidade de lotes distintos.
- Cards por lote.
- Criações por data.
- Clientes que utilizaram Notícias.

Limitações:

- Linhas apagadas somem do histórico.
- Não há evento de exportação de notícia.
- A tabela mede artefatos persistidos, não cada tentativa ou interação com a feature.

### `scheduled_posts`

Principais colunas:

- `user_id`, `project_id`.
- `scheduled_at`.
- `kind`: `carousel`, `news` ou `note`.
- Título, nota, canal e metadados.
- `status`: `planned`, `ready`, `published` ou `skipped`.
- Referências opcionais ao carrossel e à notícia.

Uso potencial:

- Agendamentos criados.
- Distribuição por tipo e status.
- Publicações marcadas como publicadas.
- Uso da Agenda por usuário.

Limitação: sem analytics de eventos, não se sabe quantas vezes a pessoa visitou ou tentou usar a Agenda, apenas os registros que persistiram.

### `templates`

Possui nome, categoria, tipo, visibilidade, estilo, configurações, blueprint, `is_favorite`, `usage_count`, metadados e timestamps.

Uso potencial:

- Catálogo atual de templates.
- Favoritos.
- `usage_count`, somente se for confirmado que todas as criações o atualizam.

Não foi identificada evidência suficiente de que `usage_count` seja atualizado de maneira completa em todos os fluxos. Para uso real, `carousels.style`, modelo persistido e eventos de criação seriam fontes mais confiáveis.

### `assets`

Registra biblioteca de arquivos com usuário, projeto, tipo, bucket, caminho, URL, MIME, tamanho, dimensões, tags e timestamps.

Uso potencial:

- Quantidade de assets por usuário e tipo.
- Volume em bytes dos registros existentes.

Limitação: o sistema também envia arquivos diretamente ao Storage em alguns fluxos. É necessário verificar se todo upload possui uma linha correspondente antes de tratar `assets` como inventário completo do Storage.

### `reels`

Principais colunas:

- `user_id`.
- Nome, handle, caption e avatar.
- Formato, mute e offset.
- Caminho, MIME, dimensões, duração e tamanho do vídeo.
- `status`.
- Timestamps.

A feature está desativada em `lib/feature-flags.ts`. A navegação, rota e upload ficam indisponíveis enquanto `REELS_ENABLED` estiver falso, mas tabela e código permanecem.

Uso potencial:

- Uso histórico antes da desativação.
- Reels existentes por usuário.
- Duração e tamanho médios.

Limitação: a exportação MP4 ocorre no cliente e não é registrada.

### `leads`

Principais colunas:

- `id`.
- `name`, `email`, `phone`.
- `plan_interval`: `month` ou `year`.
- `created_at` e `updated_at`.

O e-mail é único. Reenvios atualizam o mesmo lead, e `updated_at` representa o interesse mais recente.

Uso potencial:

- Leads totais e por período.
- Interesse em mensal versus anual.
- Leads recorrentes por atualização.
- Primeira e última manifestação de interesse.

Limitações:

- Não existem campos de UTM, origem, campanha, referrer, landing page ou canal de aquisição.
- O e-mail do lead pode ser diferente do e-mail usado pelo pagador no checkout. Portanto, e-mail não deve ser usado para atribuir a conversão ao lead.

### `payment_checkout_refs`

Principais colunas:

- `checkout_session_id`, PK com o ID do checkout do Asaas.
- `lead_id`.
- `plan_interval`.
- `created_at`.

Essa tabela é a ponte correta entre checkout e lead. Ela existe porque o Asaas devolve `checkoutSession`, mas não propaga de forma confiável o `externalReference` enviado na criação do checkout.

Uso potencial:

- Checkouts iniciados.
- Quantidade de tentativas por lead.
- Conversão de lead para pagamento quando combinada com subscription/webhook.
- Conversão por plano escolhido.

Importante: um lead pode abrir vários checkouts. O funil deve contar leads únicos e, separadamente, tentativas de checkout.

### `subscriptions`

Schema atual após migração para o Asaas:

- `id`, ID da assinatura no Asaas.
- `user_id`, nullable porque o pagamento pode existir antes da conta.
- `email`, e-mail do pagador.
- `payment_provider`, atualmente `asaas`.
- `provider_customer_id`.
- `provider_subscription_id`.
- `provider_payment_id`, última cobrança conhecida.
- `external_reference`, ID do lead quando resolvido.
- `status`: `active`, `trialing`, `past_due`, `unpaid` ou `canceled`.
- `subscription_status`, status cru do Asaas.
- `plan_interval`: `month` ou `year`.
- `billing_type`.
- `cycle`.
- `value`.
- `next_due_date`.
- `cancel_at_period_end`.
- `current_period_start` e `current_period_end`.
- `canceled_at`.
- `metadata` e timestamps.

Uso potencial imediato:

- Assinaturas por status.
- Assinaturas por plano.
- Valor recorrente contratado.
- Assinaturas com cancelamento agendado.
- Fim do acesso/renovação corrente.
- Pagantes que ainda não criaram ou vincularam conta (`user_id is null`).
- Assinantes com conta vinculada.
- MRR atual normalizado.
- ARR atual estimado.
- Lista atual de `past_due` e `unpaid`.

Definições recomendadas:

- Assinatura ativa: status `active` ou `trialing`.
- Assinatura ativa com conta: ativa e `user_id is not null`.
- Pagamento aguardando cadastro: ativa e `user_id is null`.
- Cancelamento agendado: `cancel_at_period_end = true` e status ainda ativo/trialing.
- MRR mensal: soma do valor de assinaturas mensais ativas.
- MRR anual normalizado: soma do valor de assinaturas anuais ativas dividida por 12.
- ARR: MRR normalizado multiplicado por 12.

Limitações relevantes:

- A tabela guarda o estado atual, não um histórico de todos os estados da assinatura.
- `provider_payment_id` guarda a última cobrança conhecida, não uma linha por cobrança.
- `value` é valor contratado/da assinatura e não comprova dinheiro recebido.
- Não há plano histórico por usuário nem snapshot de MRR no tempo.
- Mudanças de plano podem cancelar uma assinatura e criar outra; sem motivo normalizado isso pode parecer churn.

### `payment_customers`

Colunas:

- `user_id`.
- `payment_provider`.
- `provider_customer_id`.
- `cpf_cnpj`.
- Timestamps.

Uso potencial:

- Conciliação entre conta e customer do Asaas.

Dados como CPF/CNPJ são sensíveis e não devem aparecer em cards ou tabelas gerais. Se houver uma necessidade operacional futura, o acesso deve ser mínimo, auditado e mascarado.

### `payment_webhook_events`

Colunas:

- `event_id`, PK para idempotência.
- `event_type`.
- `payload` JSONB bruto.
- `received_at`.
- `processed_at` nullable.

O webhook insere o evento antes de processá-lo. Uma linha com `processed_at is null` é evidência de evento que morreu ou falhou no meio do processamento.

Uso potencial imediato:

- Eventos recebidos por tipo.
- Webhooks pendentes/não processados.
- Latência entre recebimento e processamento.
- Auditoria manual do payload.
- Reconstrução histórica parcial de pagamentos e estados.

Limitações:

- Payload bruto não é uma tabela financeira normalizada.
- O mesmo pagamento gera vários eventos, por exemplo confirmação e recebimento. Somar os valores por evento causaria dupla contagem.
- Eventos sem `event_id` são processados e apenas logados; não ficam representados de forma consultável nessa tabela.
- Consultar JSON bruto em todas as páginas administrativas seria mais caro, frágil e sujeito a variações do provedor.

Mapeamento financeiro observado no código:

- `PAYMENT_CONFIRMED`: libera/renova acesso e leva o status interno para `active`.
- `PAYMENT_RECEIVED`: significa dinheiro recebido e não altera acesso.
- `PAYMENT_OVERDUE`: leva a `past_due`.
- `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`: leva a `unpaid`.
- `PAYMENT_REFUNDED`: revoga e leva a `canceled`.
- `PAYMENT_CHARGEBACK_REQUESTED`: revoga e leva a `canceled`.
- Eventos de inativação/deleção de assinatura respeitam o período já pago e podem marcar cancelamento para o fim do ciclo.

### `paid_signup_intents`

Colunas principais:

- `id`.
- `subscription_id`.
- `user_id`.
- `expires_at`.
- `consumed_at` e `consumed_by`.
- `created_at`.

Uso potencial:

- Diagnóstico do fluxo pagamento-primeiro.
- Intents expirados, abertos ou consumidos.
- Pagamentos cuja criação/vinculação de conta travou.

### `user_credits`

Colunas:

- `user_id`.
- `balance`.
- `monthly_allowance`.
- `period_start` e `period_end`.
- `updated_at`.

Uso potencial imediato:

- Saldo atual.
- Allowance mensal.
- Clientes com saldo zero.
- Consumo aproximado no ciclo atual como `monthly_allowance - balance`.
- Próxima recarga.

Limitações:

- Não existe ledger de crédito.
- Não se sabe historicamente quanto foi consumido, estornado ou recarregado.
- Não é possível separar consumo entre carrossel e imagem.
- O cálculo `allowance - balance` é apenas uma aproximação do ciclo corrente e não explica estornos, ajustes ou mudanças de plano.
- Não existe idempotency key específica para cada movimento de crédito registrado como linha histórica.

## Fluxo de pagamento-primeiro e o funil possível

O desenho atual permite que uma assinatura seja criada pelo webhook antes da existência da conta do usuário. Por isso `subscriptions.user_id` é nullable. Depois, o cadastro pago reivindica a assinatura e cria/vincula perfil e créditos.

O funil parcialmente reconstruível hoje é:

1. Lead capturado em `leads`.
2. Checkout criado em `payment_checkout_refs`.
3. Pagamento/assinatura chega ao webhook e é registrado.
4. `subscriptions.external_reference` recebe o ID do lead quando a ponte é resolvida.
5. A assinatura é vinculada à conta por `subscriptions.user_id`.
6. O onboarding é concluído em `profiles.onboarding_completed`.
7. O primeiro conteúdo pode ser aproximado pela menor `created_at` entre carrosséis, notícias, Reels e agendamentos existentes.

O que não é possível completar historicamente:

- Primeira exportação, porque exportações não são registradas.
- Retorno em 7 dias, porque não há sessões/eventos de atividade.
- Tempo real até primeiro valor quando o primeiro conteúdo foi apagado.
- Origem/campanha de aquisição, porque não há UTMs.

## Cancelamentos: ambiguidade encontrada

O cancelamento solicitado pelo usuário executa a seguinte lógica:

- Cancela a recorrência no Asaas.
- Mantém a assinatura com acesso até `current_period_end`.
- Grava `cancel_at_period_end = true`.
- Grava `canceled_at = now()` mesmo que o status continue ativo.

Outros fluxos também gravam `canceled_at`:

- Cancelamento imediato usado em troca de plano.
- Reembolso.
- Chargeback.
- Sincronização de assinatura inativa/expirada.
- Evento de fim de ciclo.

Assim, `canceled_at` atualmente pode significar “pediu para cancelar” ou “acesso terminou”, além de não trazer causa suficiente.

Consequências:

- Não se pode calcular churn efetivo historicamente apenas por `canceled_at`.
- Não se pode separar churn voluntário de falha de pagamento, refund, chargeback ou troca de plano.
- Não se pode calcular com segurança o MRR perdido em cada cancelamento sem um snapshot/histórico.

Dados recomendados para instrumentação futura:

- `cancellation_requested_at`.
- `access_ended_at`.
- `cancellation_type`.
- `cancellation_reason` opcional.
- Plano, valor e MRR normalizado no momento do cancelamento.
- Histórico de transição de status.

## O que já pode ser medido hoje

### Clientes e cadastro

- Total exato de contas, via Supabase Auth no servidor.
- Total de perfis.
- Novas contas/perfis por período.
- Onboarding concluído versus incompleto.
- Nome, e-mail e datas básicas para uma tabela administrativa segura.
- Pagantes com e sem conta vinculada.

### Assinaturas

- Total atual por status.
- Assinaturas ativas.
- Distribuição mensal versus anual.
- Assinantes com conta vinculada.
- Assinaturas ativas aguardando cadastro.
- Cancelamentos atualmente agendados.
- Próximo fim de período, quando preenchido.
- MRR e ARR atuais estimados/normalizados.
- Lista atual de `past_due`, `unpaid` e `canceled`.

### Leads e conversão

- Leads por período.
- Preferência mensal/anual informada no lead.
- Checkouts iniciados.
- Número de tentativas de checkout por lead.
- Leads atribuídos a uma assinatura.
- Pagamentos/assinaturas que chegaram à vinculação de conta.
- Conversão parcial até onboarding.

### Produto

- Carrosséis atualmente existentes por data, usuário, estilo e status.
- Número médio atual de slides.
- Usuários com ao menos um carrossel.
- Cards e lotes de Notícias existentes.
- Agendamentos existentes por tipo e status.
- Reels históricos persistidos.
- Projetos, assets e templates existentes.

Esses números devem ser chamados de “artefatos existentes” ou “criações persistidas”, e não de eventos totais de uso, pois exclusões removem o histórico.

### Créditos

- Saldo atual e allowance.
- Clientes sem créditos.
- Consumo aproximado do ciclo atual.
- Próxima data de recarga.

### Saúde operacional

- Webhooks com `processed_at is null`.
- Tempo de processamento dos webhooks concluídos.
- Assinaturas ativas sem `user_id`.
- Assinaturas sem `current_period_end`.
- Status financeiros problemáticos atuais.
- Paid signup intents expirados ou não consumidos.
- Divergências básicas de plano, cycle e value.

## O que não pode ser medido corretamente hoje

### Presença e atividade

- Usuários online em tempo real.
- Usuários online únicos versus quantidade de abas.
- Última atividade real dentro do produto.
- Sessões.
- Duração de sessão.
- Página atual.
- DAU, WAU e MAU.
- Stickiness DAU/MAU.
- Retenção D1, D7 ou D30.

Não existe implementação de Supabase Realtime Presence nem heartbeat/last_seen.

### Uso de features

- Ranking real das features mais usadas.
- Usuários únicos por feature.
- Frequência por usuário.
- Criação de carrossel por IA versus manual versus JSON.
- Uso de web search na IA.
- Uso de imagem de referência.
- Aberturas de páginas e interações que não geram registros persistidos.

Não foi encontrada uma tabela ou serviço de analytics com `event_name`, `feature`, sessão e propriedades.

### Exportações

- Exportação de um slide.
- Exportação do carrossel completo.
- Exportação de notícia.
- Exportação de Reel.
- Usuários que criaram mas nunca exportaram.
- Tempo até a primeira exportação.

As exportações acontecem no navegador e não emitem um evento persistido.

### IA e custos

- Total histórico de gerações bem-sucedidas.
- Total histórico de tentativas e falhas.
- Taxa de falha por endpoint/modelo.
- Latência da geração.
- Créditos consumidos separadamente por carrossel e imagem.
- Custo monetário de OpenAI por usuário ou feature.
- Margem bruta por cliente/plano.

Os endpoints debitam e estornam créditos, mas não criam uma linha histórica por operação. Logs do servidor não substituem analytics estruturado.

### Financeiro histórico confiável

- Receita recebida normalizada por dia/mês sem interpretar payload bruto.
- Valor líquido após taxas.
- Taxas do Asaas.
- MRR histórico exato.
- ARR histórico exato.
- Churn de MRR histórico.
- LTV.
- Receita por coorte.
- Recuperação de inadimplência.

É possível reconstruir parte desses dados a partir dos webhooks brutos, deduplicando por pagamento, mas o schema atual não fornece uma tabela financeira pronta e estável.

### Cancelamento e churn

- Churn efetivo confiável por período.
- Cancelamento voluntário versus involuntário.
- Motivo do cancelamento.
- MRR perdido por cancelamento.
- Troca de plano separada de churn real.
- Momento exato em que o acesso terminou em todos os casos históricos.

### Aquisição

- Conversão por campanha, canal, anúncio, referrer ou UTM.
- CAC.
- ROAS.
- Origem dos melhores clientes.

Os leads atuais não carregam atribuição de marketing nem custo de aquisição.

## Métricas e fórmulas recomendadas

### Contas cadastradas

Quantidade de usuários em Supabase Auth. Não usar `profiles` sem deixar explícito que é contagem de perfis.

### Assinaturas ativas

Quantidade de assinaturas com status em `active` ou `trialing`. Como o fluxo é pagamento-primeiro, incluir tanto `user_id` preenchido quanto nulo.

### Assinantes com conta

Assinaturas ativas com `user_id is not null`.

### Pagantes aguardando cadastro

Assinaturas ativas com `user_id is null`.

### MRR atual normalizado

```text
MRR = soma dos valores das assinaturas mensais ativas
    + soma dos valores das assinaturas anuais ativas / 12
```

Com os preços atuais, se todos estiverem no preço padrão:

```text
MRR = mensais × 59,50 + anuais × (499 / 12)
```

O ideal é usar o valor realmente gravado na assinatura, com validação contra a fonte de planos, para preservar eventuais preços históricos.

### ARR estimado

```text
ARR = MRR normalizado × 12
```

### Receita recebida

Soma de pagamentos únicos cujo ciclo de vida atingiu `PAYMENT_RECEIVED`, deduplicados por `provider_payment_id`. Não somar eventos de webhook diretamente.

### Vendas confirmadas

Soma de pagamentos únicos que atingiram `PAYMENT_CONFIRMED`, deduplicados por `provider_payment_id`. Esse número pode diferir do dinheiro já recebido.

### Churn de clientes

```text
cancelamentos efetivos no período / assinantes ativos no início do período
```

Essa fórmula requer histórico/snapshot de status e não é confiável apenas com a tabela atual.

### Churn de MRR

```text
MRR efetivamente perdido no período / MRR no início do período
```

Troca de plano deve ser tratada separadamente de perda total do cliente.

### Usuário ativo

Usuário distinto que realizou ao menos um evento qualificado de produto no período. Login isolado e atualização automática não devem necessariamente contar como ativação.

### Adoção de feature

```text
usuários únicos que usaram a feature / usuários ativos no período
```

Mostrar adoção por usuário único e frequência por total de eventos, pois respondem perguntas diferentes.

## Instrumentação necessária para completar o dashboard

### Eventos de produto

É necessária uma estrutura append-only como `product_events`, contendo pelo menos usuário, evento, feature, propriedades validadas, sessão opcional e timestamp.

Eventos mínimos sugeridos estão especificados no prompt completo, incluindo onboarding, criação por modo, exportações, geração de imagem, Notícias, Agenda, Reels, checkout e ciclo financeiro.

Cuidados:

- Não registrar prompts, legendas, copy ou conteúdo gerado.
- Derivar o usuário da sessão no servidor.
- Aceitar somente whitelist de eventos/propriedades.
- Impedir leitura por clientes comuns.
- Marcar a data inicial da coleta para não fingir histórico anterior.

### Presença

Para “online agora”, é necessário Supabase Realtime Presence ou mecanismo equivalente.

Definição recomendada: usuário autenticado com conexão ativa no canal privado de presença. A contagem deve deduplicar o ID do usuário, pois a mesma pessoa pode ter várias abas.

O payload deve ser mínimo e não deve publicar e-mail, telefone ou PII. Usuários comuns devem conseguir publicar a própria presença sem receber a lista global. A visualização global deve ser exclusiva de administradores.

### Ledger de créditos

É necessário registrar consumo, estorno, recarga e ajuste com usuário, feature, quantidade, saldo antes/depois, timestamp e chave idempotente. O registro deve estar na mesma transação lógica do débito/estorno para não divergir do saldo.

### Transações financeiras normalizadas

É recomendada uma linha por `provider_payment_id`, atualizada pelo webhook conforme o pagamento avança entre confirmação, recebimento, overdue, refund e chargeback.

Isso evita dupla contagem e retira do dashboard a responsabilidade de interpretar payload JSON bruto a cada consulta.

### Histórico de assinatura/cancelamento

É necessário registrar transições de status e diferenciar:

- Pedido de cancelamento.
- Fim efetivo do acesso.
- Falha de pagamento.
- Reembolso.
- Chargeback.
- Troca de plano.
- Ação administrativa.

### Atribuição de aquisição

Se o dashboard precisar responder marketing, os leads/checkouts futuros precisam guardar UTMs, referrer, landing page e origem normalizada. Sem esses campos, CAC e conversão por canal não são calculáveis.

## Saúde operacional já aproveitável

Uma primeira versão de “Saúde do sistema” pode ser útil antes mesmo da instrumentação ampla, usando:

- Webhooks não processados há mais de alguns minutos.
- Assinaturas ativas sem usuário vinculado por tempo excessivo.
- Assinaturas ativas sem `current_period_end`.
- Assinaturas `past_due` ou `unpaid`.
- Pagamentos/assinaturas com plan interval, cycle ou value divergentes.
- Intents de signup expirados/não consumidos.
- Usuários com saldo zero.
- Perfis com onboarding incompleto após um período definido.

Falhas de geração de IA e eventos sem ID só se tornarão alertas estruturados depois de sair do log e entrar em uma fonte consultável.

## Design system a preservar

O design system em `app/globals.css` é explicitamente “Brutalist · Paper-first · Hard 3D shadows”. Elementos relevantes:

- Tokens `--paper`, `--paper-2`, `--paper-3`.
- Texto `--ink` e variações.
- Acento coral/terracota `--accent`.
- Estados `--success`, `--warn` e `--danger`.
- Bordas fortes e sombras duras `--sh-1`, `--sh-2`, `--sh-3`.
- Instrument Serif para títulos editoriais.
- Inter Tight para interface.
- JetBrains Mono para labels, dados e números.
- Tema escuro com inversão dos tokens.

Uma área administrativa deve reutilizar essa linguagem e evitar o visual genérico de dashboard SaaS com gradientes, cards sem borda e componentes alheios à marca.

## Riscos de interpretação a evitar

- Chamar perfis de “total de contas” sem conferir Auth.
- Chamar assinatura ativa de “usuário ativo”.
- Chamar `subscriptions.value` de receita recebida.
- Somar valores de todos os webhooks e duplicar o mesmo pagamento.
- Contar checkouts como pessoas no funil.
- Chamar linhas atuais de “total histórico de usos”.
- Tratar `canceled_at` como fim efetivo do acesso.
- Tratar troca de plano como churn.
- Usar saldo atual de créditos como histórico de consumo.
- Mostrar zero em usuários online quando o Realtime estiver indisponível.
- Exibir dados privados de conteúdo ou payload financeiro desnecessariamente.
- Usar `user_metadata` como autorização administrativa.

## Conclusão

Uma versão inicial do dashboard pode ser construída com dados atuais para contas, perfis, assinaturas, planos, MRR estimado, onboarding, leads, checkouts, conteúdo persistido, saldo de créditos e alertas do webhook.

As métricas de comportamento e histórico — usuários online, DAU/WAU/MAU, retenção, feature usage, exportações, crédito por feature, falhas de IA, receita normalizada e churn preciso — exigem instrumentação nova. O dashboard deve comunicar claramente a data de início dessa coleta, em vez de fabricar um histórico com proxies frágeis.

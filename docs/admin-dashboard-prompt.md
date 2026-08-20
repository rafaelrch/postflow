# Prompt completo — Dashboard Administrativo do CreaTools

Você é um engenheiro full-stack sênior especializado em Next.js, Supabase, analytics de produto e dashboards SaaS.

Quero que você analise o repositório existente do CreaTools e implemente uma área administrativa completa, funcional e conectada a dados reais.

Não crie apenas um mockup visual. O resultado precisa ter autenticação administrativa, consultas reais, métricas corretamente definidas, migrations seguras, instrumentação de eventos, estados de loading/erro/vazio e testes.

Antes de escrever código:

1. Leia o AGENTS.md do projeto.
2. Este projeto usa Next.js 16.2.10 com mudanças incompatíveis com versões anteriores. Leia os guias relevantes em `node_modules/next/dist/docs/` antes de implementar rotas, layouts, Server Components, proxy, cookies ou APIs.
3. Analise o schema e todas as migrations do Supabase antes de criar tabelas ou consultas.
4. Analise o design system existente em `app/globals.css` e reutilize componentes, tokens, fontes e padrões visuais do projeto.
5. Apresente brevemente o diagnóstico encontrado, mas não pare no diagnóstico: implemente a solução.

CONTEXTO REAL DO PRODUTO

Stack:

- Next.js 16.2.10 com App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase Auth, Postgres, Storage e Realtime
- Asaas como provedor de pagamento
- OpenAI para geração de carrosséis e imagens
- Lucide React
- Vitest

Modelo comercial atual:

- Não existe plano grátis.
- Plano Mensal: R$ 59,50, com 200 créditos por mês.
- Plano Anual: R$ 499, com 300 créditos por mês.
- Carrossel gerado com IA custa 5 créditos.
- Imagem gerada com IA custa 5 créditos.
- Editor manual e Notícias não consomem créditos.
- Leia os valores diretamente de `lib/plans.ts` e `lib/credits.ts`; não duplique preços ou limites manualmente.

Funcionalidades existentes:

- Carrosséis
- Geração de carrossel com IA
- Editor manual de carrossel
- Importação de carrossel por JSON
- Geração de imagem com IA
- Estilos/templates de carrossel
- Notícias em lotes
- Agenda editorial
- Onboarding e identidade da marca
- Reels, atualmente desativado por feature flag
- Assinaturas e pagamentos pelo Asaas
- Sistema de créditos

Dados existentes importantes:

- `auth.users`
- `profiles`
- `projects`
- `carousels`
- `slides`
- `news_entries`
- `scheduled_posts`
- `templates`
- `assets`
- `reels`
- `leads`
- `payment_checkout_refs`
- `subscriptions`
- `payment_customers`
- `payment_webhook_events`
- `paid_signup_intents`
- `user_credits`

OBJETIVO

Criar uma área `/admin`, acessível somente por administradores, para responder rapidamente:

1. Como está o negócio?
2. Quantos clientes estão pagando?
3. Quanto o produto gera de receita?
4. Onde estamos perdendo clientes?
5. Quais recursos realmente geram valor?
6. Quais clientes estão ativos, inativos ou em risco?
7. Existe algum problema operacional ou financeiro acontecendo agora?

ARQUITETURA DA ÁREA ADMINISTRATIVA

Crie uma área com as seguintes seções ou abas:

- Visão geral
- Clientes
- Financeiro
- Produto
- Saúde do sistema

A rota inicial pode ser `/admin`, com subrotas se isso melhorar a arquitetura.

Não misture a área administrativa com o dashboard normal dos clientes. Crie um layout administrativo próprio, mantendo a identidade visual do CreaTools.

SEGURANÇA OBRIGATÓRIA

O projeto ainda não possui um sistema de papel administrativo. Implemente um controle seguro.

Requisitos:

- O papel de administrador deve ser armazenado em `app_metadata` ou em uma estrutura RBAC equivalente controlada exclusivamente pelo servidor.
- Nunca use `user_metadata` para autorização.
- Não considere esconder o link como controle de acesso.
- Toda página, rota de API e ação administrativa deve validar o usuário e o papel administrativo no servidor.
- Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` no navegador.
- Consultas que precisam ignorar o RLS devem executar apenas no servidor, depois da autorização administrativa.
- Nunca consulte `auth.users` diretamente no cliente.
- Se usar `auth.admin.listUsers`, faça isso exclusivamente no servidor e com paginação.
- Dados de clientes, pagamentos e payloads de webhook não podem ficar acessíveis para usuários comuns.
- Adicione testes provando que visitante recebe 401 e usuário comum recebe 403.
- Não crie ações destrutivas de usuário, assinatura ou pagamento nesta primeira versão. O dashboard é inicialmente somente leitura.

MÉTRICAS DA VISÃO GERAL

Crie cards principais com valor atual, variação contra o período anterior e tooltip explicando a definição:

- Contas cadastradas
- Assinaturas ativas
- Assinantes com conta vinculada
- Pagamentos confirmados aguardando criação da conta
- MRR normalizado
- ARR estimado
- Receita recebida no período
- Usuários online agora
- Cancelamentos agendados
- Churn do período

Filtros globais:

- Hoje
- Últimos 7 dias
- Últimos 30 dias
- Últimos 90 dias
- Intervalo personalizado

Use `pt-BR`, valores em BRL e datas no fuso `America/Sao_Paulo`.

DEFINIÇÕES OBRIGATÓRIAS

Não use nomes ambíguos:

- “Contas cadastradas” = usuários existentes no Supabase Auth.
- “Assinaturas ativas” = assinaturas com status `active` ou `trialing`, inclusive as ainda não vinculadas a uma conta.
- “Assinantes com conta” = assinaturas ativas com `user_id` preenchido.
- “Aguardando cadastro” = assinatura ativa com `user_id` nulo.
- “Cancelamento agendado” = `cancel_at_period_end = true` enquanto o acesso ainda permanece ativo.
- “Cancelamento efetivo” = momento em que o acesso realmente passa para `canceled`.
- “Usuário ativo” = usuário com pelo menos um evento relevante no período. Não confundir com assinatura ativa.
- DAU, WAU e MAU = usuários distintos com eventos de produto, não número de sessões.
- Uso de feature deve mostrar tanto quantidade de eventos quanto número de usuários únicos.
- Churn de clientes = cancelamentos efetivos no período dividido pelo número de assinantes ativos no início do período.
- MRR mensal = quantidade de planos mensais × R$ 59,50.
- MRR anual normalizado = quantidade de planos anuais × R$ 499 ÷ 12.
- ARR = MRR total × 12.

Não trate `subscriptions.value` como receita já recebida. Esse campo representa o valor recorrente da assinatura.

Diferencie:

- Vendas/pagamentos confirmados: `PAYMENT_CONFIRMED`
- Dinheiro efetivamente recebido: `PAYMENT_RECEIVED`
- Reembolsos
- Chargebacks
- Pagamentos vencidos
- Falhas de cartão

Evite dupla contagem: o mesmo `provider_payment_id` pode gerar vários eventos durante o ciclo de vida do pagamento.

ATENÇÃO AO CANCELAMENTO

No código atual, `canceled_at` pode representar tanto o momento em que o usuário pediu cancelamento quanto um evento posterior do Asaas. Isso não é suficiente para calcular churn histórico com precisão.

Crie campos ou uma tabela de histórico que diferencie:

- `cancellation_requested_at`
- `access_ended_at`
- `cancellation_type`: voluntary, payment_failure, refund, chargeback, plan_change ou admin
- `cancellation_reason`, inicialmente opcional
- plano e MRR perdidos no momento do cancelamento

Atualize o fluxo existente de cancelamento e o webhook sem remover o direito de acesso até o fim do período já pago.

FINANCEIRO

Crie:

1. Gráfico de MRR e ARR ao longo do tempo.
2. Receita recebida por dia, semana ou mês.
3. Distribuição de assinantes por plano.
4. Receita e assinantes por plano.
5. Novas assinaturas, renovações e cancelamentos.
6. Churn de clientes e churn de MRR.
7. Pagamentos vencidos, recusados, reembolsados e em chargeback.
8. Assinaturas com cancelamento agendado.
9. Assinaturas pagas ainda sem conta vinculada.
10. Comparação entre plano mensal e anual.

Crie uma tabela normalizada de transações financeiras a partir do webhook do Asaas. Não dependa de consultar e interpretar `payment_webhook_events.payload` em todas as renderizações.

Essa tabela deve ter, no mínimo:

- `provider_payment_id`, único
- `provider_subscription_id`
- `user_id`, quando conhecido
- `lead_id`, quando conhecido
- status atual
- valor bruto
- forma de pagamento
- data de vencimento
- data de confirmação
- data de recebimento
- data de reembolso
- data de chargeback
- timestamps

Se o valor líquido e as taxas não estiverem disponíveis, não invente “receita líquida”. Mostre “receita recebida bruta” até que esses dados sejam integrados.

FUNIL DE CONVERSÃO

Crie um funil com usuários únicos, taxas entre etapas e tempo médio entre etapas:

1. Lead capturado
2. Checkout iniciado
3. Pagamento confirmado
4. Assinatura vinculada a uma conta
5. Onboarding concluído
6. Primeiro conteúdo criado
7. Primeira exportação
8. Retorno ao produto em até 7 dias

Use:

- `leads`
- `payment_checkout_refs`
- `subscriptions.external_reference`
- `subscriptions.user_id`
- `profiles.onboarding_completed`
- eventos de produto

Um mesmo lead pode abrir vários checkouts. Conte pessoas/leads únicos no funil, não o número bruto de tentativas.

Inclua:

- Conversão por plano escolhido
- Tempo médio entre lead e pagamento
- Tempo médio entre pagamento e cadastro
- Tempo médio até o primeiro valor
- Leads que abriram checkout e não pagaram
- Pagantes que ainda não concluíram o cadastro

ANALYTICS DE PRODUTO

O sistema atual não registra uso real de recursos. Apenas contar linhas atuais nas tabelas não é suficiente porque registros podem ser editados ou apagados.

Crie uma estrutura `product_events` ou equivalente com:

- `id`
- `user_id`
- `event_name`
- `feature`
- `session_id`, se aplicável
- `properties` JSONB validado
- `created_at`

Nunca grave prompts, textos dos carrosséis, legendas, conteúdo pessoal, payload financeiro ou outro conteúdo produzido pelo cliente.

Crie uma rota autenticada para receber eventos. O servidor deve:

- Derivar `user_id` da sessão, nunca do body.
- Aceitar somente eventos de uma whitelist.
- Validar e limitar propriedades.
- Aplicar rate limit.
- Inserir usando uma conexão segura.
- Impedir leitura desses eventos por clientes comuns.

Instrumente pelo menos:

- `session_started`
- `onboarding_completed`
- `carousel_created`
- `carousel_generated_with_ai`
- `carousel_created_manually`
- `carousel_imported_json`
- `carousel_exported_single`
- `carousel_exported_all`
- `carousel_duplicated`
- `image_generation_succeeded`
- `image_generation_failed`
- `news_batch_created`
- `news_exported`
- `schedule_created`
- `schedule_marked_published`
- `reel_saved`
- `reel_exported`
- `checkout_started`
- `payment_confirmed`
- `subscription_cancellation_requested`
- `subscription_canceled`
- `payment_overdue`
- `payment_failed`
- `payment_refunded`
- `payment_chargeback`

Nos eventos de IA, pode registrar:

- modelo utilizado
- tipo de geração
- estilo/template
- quantidade de slides
- idioma
- uso de web search
- uso de imagem de referência
- créditos consumidos
- duração em milissegundos
- sucesso ou erro normalizado

Não registre o prompt nem a resposta da IA.

PAINEL DE USO DO PRODUTO

Mostre:

- DAU, WAU e MAU
- Stickiness: DAU ÷ MAU
- Novos usuários versus usuários ativados
- Usuários ativos por dia
- Conteúdos criados por dia
- Carrosséis criados
- Carrosséis gerados com IA versus manual versus JSON
- Exportações de um slide versus carrossel completo
- Imagens geradas com IA
- Notícias criadas, contando lotes e cards separadamente
- Agendamentos criados e publicados
- Recursos mais usados por eventos
- Recursos mais adotados por usuários únicos
- Estilos de carrossel mais usados
- Templates mais usados
- Média de slides por carrossel
- Créditos consumidos por feature
- Taxa de falha das gerações de IA
- Usuários que chegaram a zero créditos
- Usuários que criaram conteúdo mas nunca exportaram
- Usuários que pagaram mas nunca criaram conteúdo

Reels está atualmente desativado. Preserve os dados históricos, mas sinalize na interface “Feature desativada” e não misture o uso histórico com features atualmente disponíveis.

DADOS HISTÓRICOS

Para métricas que já podem ser calculadas, use os dados atuais:

- Carrosséis: `carousels` e `slides`
- Estilos: `carousels.style`
- Notícias: `news_entries`, agrupando lotes por `raw_payload.batch_id`
- Agenda: `scheduled_posts`
- Reels históricos: `reels`
- Onboarding: `profiles`
- Créditos atuais: `user_credits`

Para métricas que só serão confiáveis após a instrumentação, mostre algo como:

“Dados coletados a partir de DD/MM/AAAA”

Não fabrique histórico com dados que não existem.

CRÉDITOS

O banco atual guarda apenas o saldo e o limite mensal. Isso permite calcular aproximadamente o consumo do ciclo atual, mas não fornece histórico confiável nem separação por feature.

Implemente um ledger ou eventos transacionais que registrem:

- consumo
- estorno
- recarga mensal
- ajuste administrativo
- feature responsável
- saldo antes
- saldo depois
- quantidade
- timestamp

Garanta atomicidade com as funções atuais de consumo e estorno. Não permita saldo negativo nem estorno duplicado.

CLIENTES

Crie uma tabela administrativa com busca, filtros, ordenação e paginação no servidor.

Colunas:

- Nome
- E-mail
- Data de cadastro
- Status online
- Última atividade
- Onboarding concluído
- Plano
- Status da assinatura
- Valor do plano
- Próxima renovação ou fim do acesso
- Cancelamento agendado
- Créditos disponíveis e limite
- Créditos consumidos no ciclo
- Quantidade de carrosséis
- Quantidade de notícias/lotes
- Quantidade de exportações

Filtros:

- Plano mensal/anual
- Ativa
- Past due
- Unpaid
- Cancelada
- Cancelamento agendado
- Online agora
- Onboarding incompleto
- Sem atividade
- Sem conteúdo criado
- Créditos esgotados
- Pagou mas ainda não criou conta

Ao clicar em um cliente, abra uma página ou drawer com:

- Resumo da conta
- Assinatura
- Créditos
- Conteúdos criados
- Eventos recentes
- Linha do tempo do funil
- Alertas

Não exiba conteúdo privado criado pelo cliente. Mostre apenas metadados e contagens.

USUÁRIOS ONLINE EM TEMPO REAL

Implemente Supabase Realtime Presence em um canal privado.

Definição:

“Online” = usuário autenticado com uma conexão Realtime ativa no canal de presença.

Requisitos:

- Contar usuários únicos, não abas.
- Usar uma chave derivada do ID do usuário.
- Payload mínimo: `user_id`, horário de entrada e rota atual, se necessário.
- Não publicar e-mail, telefone ou outros dados pessoais no canal.
- Atualizar presença quando a rota mudar, sem enviar atualizações em alta frequência.
- Remover o canal no cleanup do React.
- Usar canal privado e autorização apropriada.
- Usuários comuns podem publicar a própria presença, mas não devem receber a lista global de usuários online.
- Somente administradores podem visualizar a presença global.
- Mostrar “atualizado agora” e estado de reconexão no card.
- Em caso de falha do Realtime, mostrar “indisponível”, nunca zero falsamente.

SAÚDE DO SISTEMA E ALERTAS

Crie uma seção com alertas acionáveis:

- Webhooks recebidos mas não processados há mais de 5 minutos
- Eventos de webhook sem ID
- Assinatura ativa sem `user_id` por tempo excessivo
- Assinatura ativa sem `current_period_end`
- Usuário com conta mas sem assinatura válida
- Pagamento `past_due`
- Pagamento `unpaid`
- Reembolso
- Chargeback
- Falhas recentes de geração de IA
- Alta taxa de falha em geração de imagem
- Usuários com créditos zerados
- Onboarding incompleto após 24 horas
- Checkout iniciado sem pagamento
- Divergência entre plano, valor e ciclo

Exiba severidade, quantidade, primeira ocorrência, última ocorrência e link para os registros afetados.

INTERFACE

Siga o design system atual do CreaTools:

- Visual brutalista e paper-first
- Fundo baseado nos tokens `--paper`, `--paper-2` e `--paper-3`
- Texto `--ink`
- Coral `--accent`
- Bordas fortes
- Sombras duras `--sh-1`, `--sh-2` e `--sh-3`
- Instrument Serif para títulos editoriais
- Inter Tight para interface
- JetBrains Mono para números, labels e dados
- Suporte completo ao tema escuro
- Sem gradientes genéricos de dashboard SaaS
- Sem mudar a identidade visual do produto

A página deve ser desktop-first, mas funcional em tablets e celulares.

Inclua:

- Skeletons
- Empty states
- Mensagens de erro com opção de tentar novamente
- Tooltips com definição das métricas
- Indicação de comparação com período anterior
- Gráficos acessíveis
- Tabelas paginadas no servidor
- Busca com debounce
- Filtros preservados na URL
- Exportação CSV apenas dos dados filtrados, respeitando a autorização administrativa

Não adicione uma biblioteca pesada de gráficos sem necessidade. Primeiro avalie se SVG/CSS e componentes existentes são suficientes. Caso uma dependência seja necessária, valide compatibilidade com React 19 e Next.js 16.

PERFORMANCE

- Evite consultas N+1.
- Faça agregações no Postgres com views, RPCs ou queries específicas.
- Use `security_invoker` em views expostas.
- Se usar funções `security definer`, revogue execução pública e proteja-as explicitamente.
- Adicione índices para filtros por data, usuário, evento, status e feature.
- Não carregue todos os usuários ou eventos para agregar no navegador.
- Use paginação real no banco.
- Se o volume justificar, crie agregações diárias incrementais.
- Não exponha novas tabelas ao Data API sem necessidade.
- Se uma tabela precisar ser exposta, use GRANT explícito, RLS e policies mínimas.

TESTES E ENTREGA

Adicione testes para:

- Autorização administrativa
- Usuário comum bloqueado
- Visitante bloqueado
- Definições de MRR e ARR
- Normalização do plano anual
- Churn
- Cancelamento agendado versus efetivo
- Deduplicação de pagamentos
- Funil com múltiplos checkouts do mesmo lead
- Contagem de usuários únicos por feature
- DAU, WAU e MAU
- Whitelist e validação de eventos
- RLS das novas tabelas
- Falha do Realtime sem exibir zero falso
- Paginação e filtros

Ao terminar:

1. Rode os testes.
2. Rode o build de produção.
3. Corrija erros de TypeScript e lint.
4. Faça uma revisão de segurança.
5. Informe arquivos criados e alterados.
6. Liste migrations necessárias.
7. Explique quais métricas já possuem histórico e quais começam a contar a partir desta implementação.
8. Não use dados mockados no resultado final.
9. Não altere nem apague dados existentes.
10. Não pare apenas no plano: implemente e verifique a área administrativa.

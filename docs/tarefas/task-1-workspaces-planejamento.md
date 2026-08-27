# TASK 1 — Workspaces, Projetos e contexto por cliente

**Status:** implementação incremental da base da Task 1 realizada nesta branch; não marcar como concluída.

**Base da inspeção:** branch \`feat/task-1-workspaces-context\`, criada a partir de \`main\` em \`a8af66f\` em 26/08/2026. O planejamento serviu de base para uma implementação incremental, sem merge, deploy ou alteração do switch visual do sidebar.

## Premissas e decisões já confirmadas

- A ordem oficial do run é Task 2 → Task 4 → Task 3 → Task 1. As três anteriores têm evidência de integração/publicação no LOG; a Task 1 só começa pela arquitetura e precisa de aprovação do planejamento.
- O produto deve coletar, após cadastro/onboarding, identidade do usuário (nome/sobrenome), foto(s), objetivo e perfil profissional (por exemplo, agência, social media ou creator), e depois permitir múltiplos Workspaces, normalmente um por cliente.
- O isolamento deve abranger carrosséis, notícias, onboarding de marca, contexto da marca e dados relacionados ao cliente. O \`user_id\` continuará representando a conta/autor; não será a única fronteira de tenant.
- O link de referência fornecido é [21st.dev — Workspaces](https://21st.dev/@sshahaider/components/workspaces). A página mostra um padrão de popover com avatar, busca e troca de workspace, mas não define o contrato de produto Creatools.
- O prompt específico do Rafael para a TESC-E4 e o material específico da aba de troca de Workspace ainda não foram fornecidos. A implementação detalhada da UI, nomes finais, estados visuais e adaptação do componente fica bloqueada até esses materiais e a aprovação deste documento.
- Não se deve tocar no dedupe de \`checkout.session.completed\`, mudar o design da landing, remover o banner jurídico, registrar segredos, fazer merge, publicar ou deploy. Mudanças futuras nas superfícies B1/B2 (\`verify-signup\`, checkout, AuthForm e subscription) exigem revisão de Security.

## 1. Estado atual encontrado no código

### Autenticação e rotas protegidas

- Supabase Auth usa \`@supabase/ssr\`: \`lib/supabase.ts\` cria o client de browser e \`lib/supabase-server.ts\` cria o client de servidor com cookies.
- \`proxy.ts\` protege \`/dashboard\`, \`/generator\`, \`/agenda\`, \`/news\`, \`/setup\`, \`/onboarding\`, \`/conta\`, \`/configuracoes\` e \`/admin\`; as rotas de API fazem sua própria validação com \`auth.getUser()\`.
- \`components/AuthProvider.tsx\` consulta \`profiles.onboarding_completed\` por usuário, mantém a camada \`inert\`/bloqueante enquanto verifica e abre \`GlobalOnboardingModal\` para conta incompleta. A checagem é cacheada por id na aba e é resetada no logout.
- O \`AuthProvider\` não resolve Workspace ativo hoje. Uma sessão válida é suficiente para qualquer rota do app; o filtro efetivo atual é o RLS por \`auth.uid()\`.

### Perfil e onboarding

- \`public.profiles\` tem uma linha por usuário, com \`name\`, \`handle\`, \`phone\`, \`photo_url\`, \`workspace_name\`, dados de marca (\`brand_name\`, logo, palette, história, dores, nicho, audiência, tom), \`goals\` e \`onboarding_completed\`.
- \`components/onboarding/OnboardingForm.tsx\` hoje tem cinco etapas: identidade da marca/nicho/paleta, canais, foto opcional com crop, contexto da marca e revisão. Não há campos explícitos para nome/sobrenome, objetivo ou perfil profissional no fluxo atual; \`profiles.name\` pode vir dos metadados do cadastro, mas não é coletado/atualizado nesse wizard.
- \`app/api/onboarding/route.ts\` deriva o usuário da sessão, faz upsert do perfil e, ao concluir, cria ou atualiza um registro em \`projects\` com o nome da marca. O campo \`workspace_name\` é preenchido com o nome da marca.
- \`GlobalOnboardingModal\` é bloqueante e não pode ser fechado. Esse comportamento deve ser preservado; o futuro contexto ativo não pode permitir que uma conta incompleta contorne o gate.

### Banco e conteúdo

O schema atual (\`supabase/schema.sql\`, espelhado em \`lib/database-schema.ts\`) contém:

- \`projects\`: \`id\`, \`user_id\`, nome, descrição, nicho, audiência, tom, objetivos, \`brand_voice\` e status \`active/archived\`. Não existe \`workspaces\` nem tabela de membros.
- \`carousels\`: \`user_id\` obrigatório e \`project_id\` opcional; \`slides\` dependem de \`carousel_id\` e têm RLS derivado do dono do carrossel.
- \`news_entries\`: \`user_id\` obrigatório e \`project_id\` opcional. O editor de Notícias grava cards e lotes em \`raw_payload.batch_id\`.
- \`templates\`, \`assets\` e \`scheduled_posts\`: também têm \`user_id\` e \`project_id\` opcionais. O código atual normalmente cria esses registros sem \`project_id\`.
- \`content_relations\`: \`user_id\` e ids/tipos genéricos, sem FK para garantir que source e target existam no mesmo contexto.
- \`reels\` (\`supabase/reels-schema.sql\`): tabela separada, hoje somente por \`user_id\`; Reels está atrás de feature flag, mas deve ser explicitamente classificado como conteúdo de Workspace antes de ser reativado.
- \`subscriptions\`, créditos, ledger, eventos de produto e dados de pagamento são de conta/usuário, não de cliente. Não devem ser duplicados por Workspace nesta Task 1.

### Persistência atual no app

- Dashboard (\`app/(app)/dashboard\`) carrega carrosséis por usuário. Busca, paginação, duplicação e delete não recebem contexto de projeto/Workspace.
- \`CreateWizard\` consulta apenas o perfil do usuário, chama \`/api/generate-carousel\` e grava \`carousels\`/\`slides\`; o insert do carrossel leva \`user_id\`, mas não leva \`project_id\`.
- \`useAutoSave\` insere/atualiza o carrossel por id e recria seus slides. Não há captura nem validação de projeto ou Workspace ativo.
- O contexto de marca para texto e imagem é carregado em \`lib/brand-context.ts\` a partir de \`profiles\` por \`userId\`; \`generate-carousel\` e \`generate-image\` o injetam nos prompts.
- Notícias (\`app/(app)/news/page.tsx\`) lê/escreve templates por \`user_id\` implícito no RLS, carrega o logo de \`profiles.brand_logo_url\` e grava \`news_entries\` sem \`project_id\`.
- Agenda (\`app/(app)/agenda/page.tsx\` e \`AgendaClient\`) lê e grava \`scheduled_posts\` sem \`project_id\`; \`ScheduleModal\` vincula um agendamento ao \`carousel_id\`, mas não ao contexto de cliente.
- A sidebar (\`components/ui/AppSidebar.tsx\`) mostra identidade do usuário, plano/créditos, navegação e logout. Não existe seletor de Workspace. O link conhecido da 21st.dev pode orientar a futura área, mas a aparência final depende do prompt do Rafael.

### RLS e riscos estruturais observados

- As policies atuais são \`auth.uid() = user_id\` em projetos, carrosséis, notícias, assets, agenda e relações; slides consultam o dono do carrossel.
- \`project_id\` é uma FK simples e não prova que o projeto pertence ao mesmo usuário do registro filho. Hoje o código também não permite consultar projeto para decidir autorização. Ao introduzir Workspace, toda relação entre conta, membro, Workspace, projeto e conteúdo deve ser validada no banco, não apenas no client.
- \`content_relations\` aceita ids genéricos sem integridade referencial. Qualquer desenho que reutilize a tabela precisa validar tipo, existência e mesmo Workspace.
- O bucket \`postflow-assets\` é público; policies de escrita usam a primeira pasta do caminho igual ao \`auth.uid()\`. Foto de perfil/logo são gravadas em caminhos por usuário. Alterar caminhos para Workspace exige revisão de exposição pública, policies e URLs antigas.
- \`lib/database-schema.ts\` é uma segunda fonte SQL usada por \`/setup\` em desenvolvimento. Não se deve criar uma migration e esquecer esse espelho; a sincronização deve ser uma etapa explícita da implementação, sem executar SQL por esta branch de planejamento.

## 2. Problemas e riscos

1. **Mistura conceitual:** \`workspace_name\` em \`profiles\` e \`projects\` foram usados como substitutos de Workspace, mas nenhum deles permite vários clientes, membros ou troca segura de contexto.
2. **Filtro incompleto:** adicionar somente \`workspace_id\` ao client ou à URL não isola dados; queries, endpoints, RLS, Storage e relações precisam convergir no mesmo contexto.
3. **Vazamento por relações:** \`project_id\`, \`carousel_id\`, \`news_entry_id\` e relações genéricas podem apontar para outro contexto se a autorização for baseada apenas no id recebido pelo navegador.
4. **Corrida na troca:** trocar Workspace durante load/autosave/geração pode gravar um rascunho no Workspace errado ou mostrar dados antigos. A troca precisa invalidar cargas em andamento e bloquear a ação até salvar/cancelar o estado local.
5. **Contexto de IA errado:** \`getBrandContext\` hoje lê \`profiles\`; após a migração, uma chamada pode usar a marca do cliente A para gerar conteúdo do cliente B se o Workspace não for resolvido no servidor.
6. **Migração de legado:** registros antigos têm \`project_id\` nulo ou apontam para um projeto por usuário. Backfill parcial pode criar registros invisíveis ou misturar clientes.
7. **Compatibilidade de URL/cache:** páginas e links atuais não carregam Workspace. Um cookie de seleção é útil, mas não pode ser autoridade; precisa ser revalidado por membership e ter fallback determinístico.
8. **Storage público:** mover logo/foto/vídeo para caminhos de Workspace sem decidir a visibilidade pode criar exposição entre clientes ou quebrar imagens antigas.
9. **Papéis não definidos:** sem contrato de convite, remoção, transferência de ownership e permissões de marca, criar \`workspace_members\` sem comportamento de produto seria apenas schema sem segurança operacional.
10. **Schema duplicado:** \`schema.sql\` e \`lib/database-schema.ts\` podem divergir e fazer instalações novas diferentes do banco de produção.

## 3. Modelo conceitual proposto

| Entidade | Significado | Escopo | Relações principais |
|---|---|---|---|
| Conta/Usuário | identidade Auth, preferências pessoais, assinatura, créditos e eventos | global da conta | possui memberships; cria conteúdo |
| Workspace | fronteira de um cliente/tenant; nome, status e membro ativo | multiusuário | pertence a um owner; possui marca, projetos e conteúdo |
| Membro | autorização de uma conta dentro de um Workspace | por Workspace | \`user_id + workspace_id + role\` |
| Marca/contexto | identidade usada por conteúdo e IA: nome, logo, canais, nicho, público, dores, história, tom e paleta | por Workspace | uma marca padrão por Workspace na primeira versão |
| Projeto | iniciativa/campanha dentro do Workspace; organiza conteúdo sem ser fronteira de segurança | por Workspace | pode ter muitos carrosséis, notícias e agendamentos |
| Coleção | agrupamento de conteúdo para organização/curadoria, sem necessariamente ter ciclo de vida próprio | por Workspace | referencia conteúdo do mesmo Workspace |
| Conteúdo | carrossel, slide, notícia, template, asset, agendamento e, futuramente, Reel | por Workspace | autor é um membro; relações devem permanecer no Workspace |

### Decisão recomendada para Coleção

Não criar uma tabela de Coleção na primeira fatia sem um caso de uso e o material do Rafael. Na Task 1, Projeto é a organização operacional persistente; Coleção pode ser tratada como agrupamento de UI/tag/view somente se o prompt TESC-E4 exigir. Se houver necessidade real de ordem, descrição, compartilhamento ou arquivamento de coleções, criar depois uma entidade própria com \`workspace_id\` e tabela de junção, sem transformar Coleção em sinônimo de Projeto.

### Marca

Implementação inicial recomendada: \`workspace_brand_context\` com uma linha padrão por Workspace. Conceitualmente é a marca do cliente; fisicamente permite separar o contexto dos campos globais de \`profiles\` e deixa a porta aberta para múltiplas marcas depois. \`profiles\` continua contendo dados pessoais e \`brand_*\` permanece temporariamente por compatibilidade, mas deixa de ser fonte de verdade após o rollout.

## 4. Proposta de banco de dados e migração

### Tabelas novas

    workspaces
      id uuid primary key
      owner_id uuid not null references auth.users(id)
      name text not null
      slug text not null          -- unicidade por conta ou global, decisão pendente
      avatar_url text not null default ''
      status text not null         -- active | archived
      created_at, updated_at

    workspace_members
      workspace_id uuid references workspaces(id) on delete cascade
      user_id uuid references auth.users(id) on delete cascade
      role text not null           -- owner | admin | editor | viewer
      status text not null         -- invited | active | removed
      created_at, updated_at
      primary key (workspace_id, user_id)

    workspace_brand_context
      id uuid primary key
      workspace_id uuid unique references workspaces(id) on delete cascade
      brand_name, logo_url, instagram_handle, news_instagram_handle, twitter_handle
      brand_palette jsonb, brand_story, audience_pains, niche, audience, default_tone
      created_at, updated_at

    user_workspace_preferences
      user_id uuid primary key references auth.users(id) on delete cascade
      active_workspace_id uuid references workspaces(id) on delete set null
      updated_at

Campos \`workspace_id uuid\` devem ser adicionados, inicialmente nullable, a \`projects\`, \`carousels\`, \`news_entries\`, \`templates\`, \`assets\`, \`scheduled_posts\`, \`content_relations\` e \`reels\`. \`slides\` pode derivar o Workspace por \`carousel_id\` para evitar duplicação; se consultas de auditoria exigirem filtro direto, só adicionar coluna com constraint de consistência. Conteúdo novo deve chegar com \`workspace_id\` derivado do servidor, nunca do corpo confiado do navegador.

### RLS e integridade

- Criar função SQL pequena e testada, como \`is_workspace_member(workspace_id, required_role)\`, com \`security definer\`, \`search_path\` fechado e sem recursão de policy. Ela deve distinguir membro ativo, convidado e removido.
- Policies de leitura devem exigir membership ativo no Workspace do registro. Policies de insert/update/delete devem exigir também o papel apropriado e impedir alteração de \`workspace_id\` depois da criação, salvo uma operação de transferência explicitamente autorizada.
- Manter \`user_id\` como autor/owner de compatibilidade, mas adicionar constraints/triggers ou FKs compostas que impeçam \`user_id\`/\`project_id\`/\`workspace_id\` inconsistentes. A referência a Projeto deve provar o mesmo Workspace.
- \`slides\` deve continuar autorizado pelo carrossel pai; \`scheduled_posts\` precisa provar que o \`carousel_id\`/\`news_entry_id\` referenciado está no mesmo Workspace; \`content_relations\` precisa provar source/target do mesmo Workspace.
- Admin global continua sendo uma regra separada de \`requireAdmin\`; ser administrador do sistema não transforma a sessão em membro de todos os Workspaces para operações normais.
- Storage deve manter arquivos legados funcionando. Para arquivos novos, decidir se o caminho será \`{userId}/{workspaceId}/...\` ou se continuará por usuário com autorização no banco. Como o bucket atual é público, nenhum caminho novo deve ser tratado como privado sem mudar o contrato de URL e os consumidores.

### Sequência de migração (expand → backfill → enforce)

1. **Expand:** criar as quatro tabelas novas, índices e funções/policies de membership; adicionar \`workspace_id\` nullable às tabelas de conteúdo. Não remover campos legados.
2. **Backfill de conta:** para cada usuário, criar exatamente um Workspace inicial ativo, nomeado a partir de \`profiles.workspace_name\`, depois \`brand_name\`, e por fim \`Meu workspace\`; criar membership \`owner\` e preferência ativa.
3. **Backfill de marca:** copiar os campos de marca do perfil para \`workspace_brand_context\`. Manter \`profiles\` intacto para rollback e clientes antigos.
4. **Backfill de projeto:** atribuir todos os \`projects\` do usuário ao Workspace inicial. O projeto criado pelo onboarding deve permanecer reconhecível; não fundir projetos com mesmo nome automaticamente sem confirmar regra de negócio.
5. **Backfill de conteúdo:** atribuir por \`project_id\` quando válido; para \`project_id\` nulo ou órfão, usar o Workspace inicial do \`user_id\`. Registrar contagens de órfãos, conflitos e linhas sem usuário antes de tornar a coluna obrigatória.
6. **Dual read/write controlado:** resolver Workspace ativo no servidor e gravar \`workspace_id\` em novos registros; ler o contexto de marca do Workspace. Em período curto, fallback para perfil legado somente se a migração da conta ainda não estiver concluída, com observabilidade sem valores sensíveis.
7. **Enforce:** após validação, \`workspace_id not null\` nos recursos que são de cliente, constraints de mesma fronteira, policies de membership e índices compostos (\`workspace_id, updated_at\`)/datas. Remover writes que omitem a coluna.
8. **Cutover:** tornar \`workspace_brand_context\` a fonte de verdade; manter leitura de campos antigos por uma janela de rollback e depois planejar sua descontinuação em migration posterior.

### Compatibilidade de rollout

- Migration antes do deploy é a ordem recomendada para ativar o recurso, mas não é requisito estrito: durante \`expand\`, o código identifica apenas objetos/funções da Task 1 ausentes e mantém o comportamento legado por perfil/\`user_id\`.
- O deploy pode preceder a migration sem transformar essa ausência esperada em 500: onboarding continua salvando perfil/projeto legado, a resolução de Workspace retorna \`legacy\`, as rotas de Workspace respondem \`409 workspace_unavailable\` e geração de texto/imagem mantém o contexto de marca do perfil.
- Depois do backfill, a migration deve ser aplicada antes de habilitar o switch visual. Erros diferentes de tabela/função ausente (RLS, constraint, rede ou dados inválidos) não entram no fallback e continuam sendo reportados como erro.
- A cobertura automatizada de rollout deve verificar esses dois caminhos: instalação antiga sem objetos da Task 1 e instalação migrada com contexto ativo; o lint SQL em banco local/CI continua obrigatório antes da aplicação em produção.

### Rollback

- Migrations devem ser aditivas e reversíveis por fase. Não apagar nem reescrever dados antigos durante o backfill.
- Um feature flag de resolução de Workspace deve permitir voltar a leitura legada enquanto os registros novos continuam identificáveis. O rollback não deve apagar memberships, preferências ou contexto copiado.
- Antes do enforce, executar relatório de contagens por usuário/Workspace/projeto e amostras de referências. O rollback de código deve preceder qualquer rollback destrutivo de banco.
- Não executar migration em produção como parte desta etapa; a execução precisa de autorização do Rafael e evidência pós-migration.

## 5. Estratégia de isolamento e autorização

### Resolução do Workspace ativo

1. A sessão identifica o usuário.
2. O servidor busca o \`active_workspace_id\` persistido e valida membership \`active\`.
3. Um cookie/localStorage pode acelerar a UI, mas é apenas uma sugestão não confiável; id inválido, removido ou arquivado cai para o primeiro Workspace ativo permitido.
4. Se não houver Workspace ativo, o servidor não consulta conteúdo: retorna estado explícito \`workspace_required\` e encaminha para criação/seleção.
5. Todo endpoint recebe no máximo um identificador de recurso; resolve o Workspace pelo registro e compara com o Workspace selecionado. Nunca aceita \`user_id\`, \`owner_id\` ou contexto de marca enviado pelo client como autoridade.

### Papéis recomendados

- \`owner\`: tudo dentro do Workspace, inclusive arquivar/reativar, gerenciar membros e transferir ownership mediante confirmação.
- \`admin\`: conteúdo, marca, projetos e membros; não altera assinatura, créditos, dados globais da conta ou administração global.
- \`editor\`: cria/edita/arquiva conteúdo e projetos conforme regra de produto; não gerencia membros.
- \`viewer\`: leitura do Workspace; exportação, duplicação e acesso a dados sensíveis precisam da decisão do Rafael. Por segurança, o default deve ser sem escrita.

Convites, transferência de owner, remoção e último owner são casos de produto bloqueadores para implementação de membership. Não basta esconder botões: cada mutação precisa da mesma regra no endpoint e no RLS.

## 6. Fluxos principais de UX

### Primeiro acesso

- Cadastro e confirmação continuam usando o fluxo existente.
- O onboarding bloqueante passa a coletar dados pessoais mínimos (nome/sobrenome, foto(s), objetivo e perfil profissional) e cria o primeiro Workspace junto com a marca/contexto inicial.
- Se o usuário abandonar antes de concluir, rascunho local continua por usuário; não cria múltiplos Workspaces nem marca parcialmente duplicada.
- Ao concluir, a preferência ativa aponta para o Workspace recém-criado e o usuário chega ao Dashboard daquele contexto.

### Criar Workspace

- Ação na troca de Workspace ou rota própria; formulário mínimo: nome, avatar/logo opcional e configuração inicial da marca conforme prompt TESC-E4.
- Criar Workspace deve criar membership owner e marca padrão em transação/rota idempotente. Falha parcial não deve deixar Workspace sem owner/contexto.
- O novo Workspace torna-se ativo somente após persistência confirmada.

### Trocar Workspace

- O seletor mostra apenas memberships ativos, com nome/avatar e estado do Workspace atual; busca só filtra a lista permitida.
- Ao trocar: salvar preferência, limpar/invalidate caches e cargas em andamento, atualizar a rota atual e recarregar dados server-side. Se houver edição não salva, oferecer salvar, descartar ou cancelar; não trocar silenciosamente.
- Se o Workspace foi arquivado/removido em outra aba, a próxima consulta deve retornar contexto inválido e selecionar outro Workspace permitido.

### Editar/arquivar

- Renomear/avatar/marca em Configurações do Workspace, não em Conta global.
- Arquivar é reversível, preserva conteúdo e remove o Workspace das escolhas normais; bloqueia novas gravações/generações e informa o usuário. Reativação exige owner/admin.
- Não excluir em cascata por ação de UX; exclusão definitiva e retenção devem ser decisão posterior.

## 7. Rotas e estados de navegação

### Compatibilidade recomendada de rotas

Na primeira implementação, preservar URLs públicas internas atuais e adicionar resolução de contexto no servidor:

- \`/dashboard\`, \`/generator\`, \`/news\`, \`/agenda\`, \`/onboarding\` e \`/configuracoes\` continuam funcionando, mas todos exigem Workspace ativo validado.
- \`/workspaces\` pode ser a tela de gerenciamento; \`/api/workspaces\`, \`/api/workspaces/[id]/switch\`, \`/api/workspaces/[id]\` e \`/api/workspaces/[id]/members\` são nomes de trabalho, sujeitos ao prompt do Rafael.
- \`/generator?id=...\` deve resolver primeiro o carrossel por membership e só então abrir o editor; um id de outro Workspace deve parecer “não encontrado” sem revelar sua existência.
- Links antigos sem contexto devem cair no Workspace ativo da conta. Não colocar ids de clientes em localStorage como única forma de navegação.

Uma rota canônica \`/w/[workspaceSlug]/...\` pode ser considerada depois para links compartilháveis e SSR mais explícito, mas não deve ser adotada antes de resolver slug, colisão, redirects, cache e o material específico da aba. A decisão final de URL é bloqueadora de implementação detalhada.

Estados mínimos que cada página precisa tratar:

- \`checking\`: sessão/membership/contexto sendo resolvidos;
- \`ready\`: Workspace ativo válido, conteúdo filtrado;
- \`workspace_required\`: usuário autenticado sem Workspace;
- \`workspace_archived\`/\`forbidden\`: seleção inválida ou sem membership;
- \`switching\`: bloqueia ações concorrentes e mostra feedback;
- \`error\`: falha de rede/consulta sem converter em lista vazia;
- \`onboarding_required\`: mantém o modal bloqueante atual.

## 8. Compatibilidade e migração de usuários existentes

- Toda conta existente recebe um Workspace inicial e membership owner; usuários não devem perder carrosséis, notícias, templates, assets, agenda ou Reels.
- \`profiles.name\`, \`handle\`, \`phone\` e \`photo_url\` continuam globais. Os novos objetivo/perfil profissional são preferencialmente colunas de perfil global (\`professional_profile\`, \`goals\` ou contrato equivalente aprovado), porque descrevem a pessoa/agência, não um cliente.
- Marca, logo, canais e contexto usados para gerar conteúdo passam para o Workspace. Durante a transição, dual read/write controlado evita que contas antigas fiquem sem contexto.
- Conteúdo sem \`project_id\` entra no Workspace inicial do usuário. Conteúdo com projeto válido segue o Workspace do projeto. Registros inconsistentes não devem ser “adivinhados” silenciosamente: relatório e fila de exceção precisam ser verificados antes do enforce.
- Usuários sem Workspace selecionado recebem seleção/criação guiada, não Dashboard global nem mistura de todos os dados.
- Assinatura, créditos, limites e eventos permanecem por usuário/conta. A criação de Workspaces não multiplica créditos nem contorna gates B1/B2.

## 9. Impacto por domínio

- **Carrosséis:** criar, listar, buscar, duplicar, editar, autosave, exportar e abrir por id devem resolver o Workspace; slides herdam do carrossel. Geração de IA deve carregar o contexto da marca do Workspace ativo.
- **Notícias:** lotes, templates de notícia, logo, cards salvos e edição devem usar Workspace; \`batch_id\` continua sendo organização de lote, não substituto de Workspace.
- **Onboarding de marca:** o primeiro onboarding cria o contexto do primeiro Workspace; edição posterior atualiza a marca ativa. O modal continua bloqueante para requisitos globais pendentes.
- **Contexto de marca:** \`lib/brand-context.ts\` deve aceitar Workspace resolvido/brand id no servidor e manter sanitização, limites e comportamento best-effort sem fallback para marca de outro cliente.
- **Agenda:** agendamentos e vínculos de carrossel/notícia devem ser do mesmo Workspace; troca de contexto não pode mostrar posts de outro cliente.
- **Templates/assets:** classificar como recursos de Workspace ou conta global antes de aplicar coluna. Templates de sistema continuam globais/read-only; assets do cliente são isolados.
- **Reels:** hoje separado e desativado por flag; antes de reativar, decidir se a tabela e Storage entram no backfill de Workspace.
- **Billing/créditos/admin:** permanecem por conta e fora da troca de Workspace; a navegação de admin não deve vazar lista de clientes por um filtro client-side.

## 10. Plano de testes

### Unitários

- normalização de Workspace ativo: cookie/localStorage inválido, arquivado, removido e fallback determinístico;
- matriz de papel/ação e resolução de ownership;
- validação de referências same-Workspace para projeto, carrossel, notícia, agenda e relações;
- migração de campos de \`profiles\` para contexto de marca, incluindo valores vazios, limites e dados legados;
- sanitização e seleção de contexto em prompts de texto/imagem;
- regras de slug/nome, arquivamento e estados \`workspace_required\`/\`forbidden\`.

### Integração/API/RLS

- usuário A não lê, atualiza, duplica, agenda, exporta ou deleta conteúdo do Workspace de B, mesmo chutando ids;
- membro viewer não escreve; editor não administra membros; admin não acessa billing global por endpoint de Workspace;
- \`workspace_id\` não pode ser forjado no insert/update; \`user_id\` sempre deriva da sessão;
- troca de Workspace não altera assinatura/créditos nem reutiliza contexto de marca anterior;
- endpoints de geração recebem o Workspace resolvido no servidor e nunca aceitam brand context arbitrário;
- teste de RLS real em banco temporário ou ambiente controlado, não somente mocks de Supabase;
- migration é idempotente, conta backfill, não perde conteúdo e passa no relatório de órfãos/conflitos;
- policies de Storage e URLs legadas continuam funcionando sem tornar arquivo de cliente público por engano.

### Fluxos de usuário/E2E

1. conta nova → onboarding bloqueante → primeiro Workspace → Dashboard;
2. agência cria cliente B, troca A ↔ B e confirma que carrosséis/notícias/marca/agenda mudam;
3. cria carrossel/notícia em B, troca para A durante load/autosave e confirma que nada é salvo no contexto errado;
4. abre link direto de carrossel de outro Workspace e recebe estado seguro sem vazamento;
5. arquiva Workspace, tenta acessar rota e reativa com owner/admin;
6. conta existente pós-migração vê os dados antigos no Workspace inicial e pode criar um segundo sem duplicar o primeiro;
7. logout/login de outra conta na mesma aba não reaproveita Workspace, marca ou cache da conta anterior;
8. falha de rede/contexto não vira lista vazia silenciosa nem injeta marca anterior nos prompts.

## 11. Plano incremental de implementação (após aprovação)

1. **Contrato:** Rafael fornece prompt TESC-E4/material da aba e aprova conceitos, URL, papéis, Coleções e regra de marca.
2. **Schema expand:** migrations novas, funções/policies, índices e testes SQL; atualizar \`schema.sql\` e \`lib/database-schema.ts\` de forma sincronizada.
3. **Backfill dry-run:** relatório de contagens e exceções sem enforce; revisão do Rafael antes da execução.
4. **Resolver server-side:** helper único para sessão → membership → Workspace ativo; cookie/preferência como aceleração; estados de ausência/forbidden.
5. **Compatibilidade de onboarding:** coletar dados globais faltantes e criar primeiro Workspace/contexto, mantendo gate bloqueante e fluxo legado seguro.
6. **Sidebar/troca:** aplicar somente o prompt recebido, com estados de loading/erro/busca, sem inventar design.
7. **Migração de leitura:** Dashboard, Generator, News, Agenda, templates/assets e APIs passam a filtrar pelo Workspace. Geração de texto/imagem lê a marca correta.
8. **Writes e concorrência:** novos registros recebem Workspace derivado do servidor; autosave, duplicação, agenda e upload abortam/confirmam troca de contexto.
9. **Enforce e limpeza controlada:** tornar campos obrigatórios após o relatório, remover fallback legado somente quando houver rollback e observabilidade suficientes.
10. **QA/review:** testes unitários, integração/RLS e E2E; Reviewer, Security e QA aprovam. B1/B2 só podem ser considerados verificados com os reviews registrados no LOG; merge/deploy dependem do Rafael.

## 12. Critérios de aceite da Task 1

- Documento de conceito aprovado, incluindo Workspace/Projeto/Coleção/marca, papéis, URL e destino dos dados globais.
- Todo usuário existente tem exatamente um Workspace inicial sem perda ou mistura de conteúdo.
- Usuário pode criar, visualizar, editar, arquivar/reativar e alternar Workspaces conforme papel aprovado.
- Workspace ativo persiste entre navegações/reload/dispositivo conforme política definida e nunca é confiado sem revalidar membership.
- Dashboard, Generator, News, Agenda, marca/contexto, templates/assets e recursos incluídos exibem e gravam somente o Workspace selecionado.
- Usuário A não consegue acessar dados de B por UI, rota, API, id forjado, relação, cache ou Storage; há testes de isolamento reais.
- Conta sem Workspace tem estado guiado e seguro; conta com onboarding incompleto continua bloqueada.
- Contexto de IA usa a marca do Workspace correto, com sanitização e sem aceitar instrução/brand context arbitrário do navegador.
- Migration é idempotente, auditável, com rollback documentado, e \`schema.sql\`/\`lib/database-schema.ts\` permanecem alinhados.
- Reviewer, Security e QA aprovam a entrega; Rafael aprova a integração, merge e publicação conforme SPEC.

## 13. Perguntas bloqueadoras para o Rafael

1. Enviar o prompt específico da TESC-E4 e o material completo da aba de troca de Workspace; o link 21st.dev sozinho não define a implementação.
2. Confirmar se a URL deve permanecer nas rotas atuais com contexto ativo ou migrar para \`/w/[slug]/...\`.
3. Confirmar se um Workspace tem exatamente uma marca na primeira versão ou se múltiplas marcas são requisito imediato.
4. Definir campos obrigatórios e opções fechadas para objetivo e perfil profissional; confirmar se são globais da conta ou específicos de Workspace.
5. Aprovar papéis \`owner/admin/editor/viewer\`, incluindo convite, transferência de ownership, remoção, último owner e permissões de exportação.
6. Definir se Projeto é obrigatório para novo conteúdo, opcional ou apenas organização; decidir o comportamento de registros sem projeto.
7. Confirmar se Coleção entra agora como entidade persistida ou fica fora da primeira implementação.
8. Decidir classificação de templates/assets e Reels: globais da conta, por Workspace ou híbridos; confirmar visibilidade de assets/logo.
9. Autorizar a estratégia de backfill e a janela de dual read/write; confirmar ambiente e procedimento para executar migration sem credenciais em notas.
10. Confirmar se a troca de Workspace deve salvar automaticamente, pedir confirmação ou bloquear quando houver autosave/generation pendente.
11. Definir comportamento de Workspace arquivado, recuperação, retenção e eventual exclusão definitiva.
12. Confirmar se créditos/limites de IA são compartilhados pela conta ou têm orçamento por Workspace. Recomendação técnica: manter compartilhados nesta Task 1.

Esses itens devem ser registrados em \`TAREFAS-RAFAEL\` pelo Tech Lead; este Builder não altera notas.

## 14. Fora do escopo desta Task 1

- Implementação de componentes, migrations, endpoints, policies ou alterações de banco nesta etapa de planejamento.
- Aplicação do prompt visual TESC-E4 e mudanças visuais antes do material do Rafael.
- Refatoração ampla do editor, templates, design system, landing, parallax ou sidebar fora do seletor de Workspace aprovado.
- Migração de Stripe/Asaas/Resend, planos, trial, checkout, webhooks ou billing por Workspace.
- Alteração do dedupe intocável de \`checkout.session.completed\` e qualquer mudança não solicitada nas superfícies B1/B2.
- Decisão ou implementação de Coleções avançadas, múltiplas marcas, compartilhamento externo, comentários, auditoria completa, SSO, SCIM ou organizações hierárquicas.
- Exclusão definitiva/retention policy de Workspaces e conteúdo.
- Reativação de Reels ou redesenho de Storage sem decisão explícita de escopo.
- Execução de migration em produção, merge, push da main, deploy ou verificação de produção.

## Arquivos inspecionados

- \`supabase/schema.sql\`, \`supabase/reels-schema.sql\`, \`supabase/migrations/*\` relevantes e \`lib/database-schema.ts\`;
- \`proxy.ts\`, \`lib/supabase.ts\`, \`lib/supabase-server.ts\`, \`components/AuthProvider.tsx\`;
- \`components/onboarding/OnboardingForm.tsx\`, \`components/onboarding/GlobalOnboardingModal.tsx\`, \`app/api/onboarding/route.ts\`;
- \`app/(app)/layout.tsx\`, \`components/AppShell.tsx\`, \`components/ui/AppSidebar.tsx\`;
- \`app/(app)/dashboard/page.tsx\`, \`app/(app)/dashboard/DashboardClient.tsx\`, \`lib/dashboard-data.ts\`;
- \`components/editor/CreateWizard.tsx\`, \`app/(app)/generator/GeneratorClient.tsx\`, \`hooks/useAutoSave.ts\`, \`hooks/useEditorStore.ts\`, \`lib/carousel-load.ts\`, \`app/api/generate-carousel/route.ts\`, \`app/api/generate-image/route.ts\`, \`app/api/delete-carousel/route.ts\`, \`lib/carousel-duplicate.ts\`;
- \`app/(app)/news/page.tsx\`, \`app/(app)/agenda/page.tsx\`, \`app/(app)/agenda/AgendaClient.tsx\`, \`components/editor/ScheduleModal.tsx\`, \`lib/brand-context.ts\`;
- \`app/(app)/setup/page.tsx\`, \`app/(app)/configuracoes/conta/page.tsx\`, \`components/auth/AuthForm.tsx\`;
- testes de onboarding, brand context, dashboard, sidebar, news, agenda, carrossel, RLS/schema e rotas protegidas em \`tests/\`.

## Estado após a implementação incremental

Foram alterados/criados arquivos funcionais da Task 1, além deste planejamento:

- Backend e contexto: \`lib/workspace-context.ts\`, \`lib/workspaces.ts\`, \`lib/brand-context.ts\` e \`app/api/workspaces/**\`.
- Onboarding e rollout: \`components/onboarding/OnboardingForm.tsx\` e \`app/api/onboarding/route.ts\`, com fallback seguro para instalações legadas.
- Banco: \`supabase/migrations/20260826_task_1_workspaces_context.sql\`, \`supabase/schema.sql\` e \`lib/database-schema.ts\`, incluindo workspaces, membros, marca, preferências, backfill e isolamento por contexto.
- Testes: \`tests/workspaces-context.test.ts\`, \`tests/workspaces-database.test.ts\`, \`tests/onboarding-route.test.ts\`, \`tests/onboarding-wizard.test.tsx\` e \`tests/brand-context.test.tsx\`.

Limitações conhecidas: o switch visual do Workspace/AppSidebar permanece fora desta etapa; convites, transferência/remoção de membros e regra do último owner ainda dependem de decisão de produto; o lint SQL contra banco local não foi executado porque não havia Docker/Postgres Supabase ativo. Não foram feitos commit, merge, deploy ou alterações em TODO/TODO-RAFAEL/LOG.

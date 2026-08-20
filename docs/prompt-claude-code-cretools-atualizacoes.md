# Prompt para o Claude Code — atualização do Cretools

Copie o conteúdo abaixo e use-o como prompt principal no Claude Code.

---

Você é o orquestrador responsável por atualizar o Cretools neste repositório. Trabalhe com um builder/agente executor e conduza a implementação em loop fechado, uma task por vez.

## Contexto obrigatório

Antes de alterar qualquer código:

1. Leia `AGENTS.md` e todos os arquivos de instrução locais relevantes.
2. Leia a documentação da versão instalada do Next.js em `node_modules/next/dist/docs/`, conforme exigido pelo `AGENTS.md`. Não use APIs ou convenções antigas por memória.
3. Inspecione a arquitetura atual, os componentes existentes e o schema efetivamente usado pelo Supabase. Não invente tabelas, rotas, campos ou fluxos sem verificar o código e as migrações/configuração disponíveis.
4. Inspecione os arquivos `TODO` e `TODO RAFAEL`, onde quer que estejam no repositório. Se não existirem neste checkout, crie-os no local mais coerente, deixando explícito que foram criados. Preserve o conteúdo existente e organize as novas demandas sem apagar histórico.
5. Leia os testes existentes e execute a suíte atual antes da primeira implementação para estabelecer a linha de base.
6. Crie uma lista de riscos e dependências. Se uma decisão de produto não puder ser deduzida do código ou deste prompt, registre a dúvida no TODO correspondente e escolha a alternativa mais compatível e reversível; não pare uma task inteira por uma dúvida pequena.

## Regra de orquestração: loop fechado obrigatório

As tasks abaixo devem ser executadas estritamente em sequência, da mais simples para a mais complexa.

Para cada task, o orquestrador deve:

1. Enviar ao builder somente a task atual, junto com seu contexto, arquivos prováveis e critérios de aceite.
2. Aguardar o builder implementar a task completamente.
3. Revisar o diff produzido, verificando escopo, regressões, segurança, UX, persistência e aderência ao padrão existente.
4. Solicitar correções ao builder enquanto houver qualquer pendência.
5. Executar os testes unitários/integrados relevantes, lint/typecheck se existirem, build de produção e os testes manuais ou de browser necessários para a task.
6. Só considerar a task concluída quando implementação, testes e documentação do TODO estiverem finalizados. “Compila” sozinho não é conclusão.
7. Atualizar `TODO` e `TODO RAFAEL` com status, arquivos alterados, decisões, testes executados e eventuais pendências residuais.
8. Somente depois disso enviar a próxima task ao builder.

Não implemente várias tasks em paralelo. Não avance com testes quebrados, type errors, warnings críticos, fluxo incompleto ou critérios de aceite não verificados. Se um teste falhar, reabra a task atual, corrija e repita o loop. Não faça refactors não relacionados.

Ao final de cada task, produza um mini-relatório com: status, resumo, arquivos alterados, testes executados com resultado, screenshots/URLs verificadas quando aplicável e pendências. Ao final do projeto, produza um relatório consolidado.

## Ordem de execução

### TASK 0 — Preparação, auditoria e atualização inicial dos TODOs

Objetivo: preparar o plano executável sem ainda misturar implementação de produto.

Entregas:

- localizar ou criar `TODO` e `TODO RAFAEL`;
- documentar o estado atual do editor, templates, geração de copy, geração de imagem, exportação e News;
- documentar schema/tabelas, políticas de acesso, rotas API e componentes que serão reutilizados;
- registrar dependências entre tasks e os assets que ainda serão enviados pelo Rafael;
- definir a matriz de testes por task;
- registrar baseline dos testes e build.

Critério de aceite: os dois TODOs têm um plano ordenado, sem apagar conteúdo existente, e o orquestrador consegue apontar exatamente onde cada feature será implementada.

### TASK 1 — Padronização dos nomes de exportação

Objetivo: alterar os nomes dos arquivos exportados sem quebrar exportação individual, ZIP ou News.

Regras:

- carrossel: `Creatools - [TITULO DO CARROSEL]`;
- grupo de News: `Creatools News - [DATA DO GRUPO DE NEWS]`;
- uma única notícia: `Creatools News - [TITULO CURTO DA NOTICIA]`;
- sanitizar caracteres inválidos, espaços duplicados, nomes vazios e tamanho excessivo;
- manter extensão correta e comportamento atual de exportação;
- confirmar se a data deve respeitar timezone do usuário/projeto e documentar a decisão;
- aplicar a regra em todos os pontos de exportação relevantes, não apenas no botão visível.

Testes obrigatórios: unitários para sanitização e seleção do nome; teste de exportação individual; teste de ZIP; teste de grupo News e notícia única; regressão para título vazio e caracteres especiais.

### TASK 2 — Imagens de preview no popup de templates

Objetivo: melhorar o popup/seletor de templates de carrossel com previews reais.

Regras:

- identificar o popup atual e manter sua interação, acessibilidade e responsividade;
- usar as imagens que o Rafael enviar, sem substituir silenciosamente por placeholders;
- mapear cada preview para o template correto e mostrar estado de carregamento/erro;
- manter seleção por clique/teclado, estado selecionado e indicação visual clara;
- evitar carregar imagens pesadas desnecessariamente;
- documentar no TODO os nomes/caminhos dos assets recebidos.

Se os assets ainda não estiverem disponíveis, prepare a integração com caminhos/contrato claros e deixe a task bloqueada apenas na etapa de validação visual final. Não marque como concluída sem confirmar os previews reais.

Testes obrigatórios: renderização do popup, seleção de cada template, acessibilidade básica, responsividade e verificação visual no browser.

### TASK 3 — Adicionar o novo template de carrossel

Objetivo: incorporar o novo template que será enviado pelo Rafael, respeitando o sistema atual de templates.

Regras:

- antes de codificar, estudar `lib/templates/template-01`, `lib/templates/template-02`, os componentes de slide, picker, wizard, sidebar, tipos e testes;
- definir nome estável, `SlideStyle`, spec/modelos, slots editáveis, imagens, defaults, fontes, dimensões e regras de overflow;
- integrar criação no wizard, popup de escolha, preview, editor, autosave, carregamento de carrossel existente e exportação;
- manter compatibilidade com carrosséis já salvos;
- não misturar valores de posição do slide com modelo visual quando o template tiver modelos fixos;
- criar testes específicos para spec, slots, defaults, render, overflow, persistência e export;
- usar os assets e a referência enviados pelo Rafael e registrar qualquer decisão visual.

Critério de aceite: é possível criar, editar, salvar, reabrir e exportar um carrossel completo usando o novo template, com os testes passando e sem regressão nos templates atuais.

### TASK 4 — Melhorar a geração de imagens com IA

Objetivo: analisar a implementação atual e evoluir o prompt/estratégia para produzir imagens mais atraentes, coerentes e úteis para carrosséis.

Antes de alterar:

- ler `app/api/generate-image/route.ts`, `lib/openai.ts`, `lib/generate-image-reference.ts`, `hooks/useGenerateCarouselImages.tsx` e os testes/documentos de rodadas anteriores;
- identificar modelo, parâmetros, prompt atual, contexto de marca, proporção, destino da imagem, tratamento de erros, créditos, cache e limites;
- separar claramente prompt de sistema/instruções, contexto editorial, direção de arte, composição, exclusões e formato de saída;
- considerar legibilidade e espaço negativo para texto, coerência entre slides, ausência de texto/logos/watermarks gerados, iluminação, assunto e adequação ao slot do template;
- preservar segurança, rate limit, custo, créditos e fallback.

Implementar uma melhoria mensurável e configurável, evitando apenas aumentar o prompt sem validar o resultado. Criar testes para montagem determinística do prompt, entradas incompletas, diferentes templates/alvos e tratamento de falhas. Fazer validação visual com um conjunto pequeno de casos representativos e registrar exemplos antes/depois quando possível.

### TASK 5 — Botão “Refinar com IA” para texto

Objetivo: permitir refinar o texto do carrossel inteiro, do slide selecionado ou de um campo/escopo definido pelo usuário.

Regras de produto:

- disponibilizar ação claramente identificada como `Refinar com IA`;
- oferecer escopos: carrossel inteiro, slide selecionado e, quando fizer sentido no editor, texto/campo selecionado;
- preservar estrutura do template, quantidade de slides, slots, limites de caracteres, hierarquia e idioma;
- mostrar confirmação/preview antes de sobrescrever ou oferecer desfazer;
- permitir instrução opcional do usuário, mantendo tom, público, marca e tema;
- tratar loading, cancelamento, erro, falta de créditos, conteúdo vazio e resposta inválida;
- nunca alterar imagens, estilos ou dados fora do escopo escolhido;
- persistir a alteração pelo fluxo existente de autosave e manter o estado consistente.

Regras técnicas:

- reutilizar ou extrair contratos de geração existentes, sem duplicar lógica;
- validar no servidor a entrada, autenticação, limites, créditos e formato estruturado da resposta;
- fazer parsing seguro, com fallback explícito quando a IA retornar JSON inválido;
- adicionar telemetria sem armazenar conteúdo sensível desnecessário.

Testes obrigatórios: contrato da API, cada escopo, preservação de slots, resposta inválida, erro, falta de créditos, confirmação/desfazer, autosave e regressões do editor.

### TASK 6 — Página Roadmap estilo Trello

Objetivo: criar uma página para usuários acompanharem sugestões e o andamento do produto.

Colunas:

- `Backlog`: sugestões dos usuários;
- `Faremos`: itens que os administradores decidiram fazer;
- `Estamos cozinhando`: itens em desenvolvimento;
- `Pronto`: itens concluídos.

Regras:

- criar rota/página integrada ao AppShell e navegação existente;
- mostrar cards responsivos, estados vazios, loading, erro e feedback de envio;
- usuário pode criar sugestão em `Backlog` por popup com título e descrição;
- validar tamanho, conteúdo vazio, rate limit e autenticação;
- definir se o usuário vê autor/data e como evitar exposição indevida de dados;
- somente administradores podem mover/editar status administrativo, se esse fluxo for implementado nesta entrega;
- usar persistência real e políticas de acesso coerentes com o Supabase existente;
- usar a imagem de referência enviada pelo Rafael como direção visual, sem copiar conteúdo não fornecido.

Se drag-and-drop não estiver especificado, priorizar criação, leitura e status seguro; não inventar uma experiência administrativa complexa. Documentar claramente o que é público e o que é admin.

Testes obrigatórios: RLS/autorização, criação válida/inválida, estados das quatro colunas, loading/erro/vazio, responsividade e navegação.

### TASK 7 — Página Trending e criação de conteúdo a partir de notícia

Objetivo: criar uma página com notícias recentes e fluxo direto para gerar carrossel ou News.

Filtros:

- `Hoje`;
- `Esta semana`;
- `Este mês`;
- filtro por tema.

Cada card deve exibir:

- badge com o site de origem, por exemplo `CNN Brasil`;
- título;
- breve descrição;
- link clicável `Ler completo`;
- botão `Criar conteúdo`.

Fluxo de `Criar conteúdo`:

1. abrir popup para escolher `Gerar Carrossel` ou `Gerar Notícia`;
2. encaminhar a notícia selecionada e seus metadados de fonte para o fluxo escolhido;
3. permitir escolher o template adequado;
4. para Gerar Notícia, se o usuário ainda não tiver template de News criado, encaminhar para a tela de criação de template;
5. nessa tela, mostrar `Salvar Template`;
6. depois de salvar com sucesso, trocar o CTA para `Criar Notícia`;
7. ao clicar, gerar a notícia usando a notícia originalmente selecionada, sem perder o contexto;
8. tratar retorno, loading, erro, cancelamento, notícia removida/indisponível e ausência de templates.

Antes de implementar, resolver e documentar a fonte de notícias: API aprovada, RSS permitido ou outra fonte compatível. Não fazer scraping frágil ou violar termos de uso. Definir cache, atualização, timeout, rate limit, paginação, deduplicação, timezone, normalização de fonte, link canônico e fallback. Não chamar diretamente uma fonte externa do browser se isso expuser segredo ou causar CORS.

Regras editoriais e de segurança:

- preservar link e atribuição da fonte;
- não reproduzir matéria integralmente; usar título/descrição/conteúdo permitido e respeitar limites de uso;
- sanitizar HTML/URLs e validar domínios/protocolos;
- não aceitar conteúdo arbitrário do cliente para executar no servidor;
- manter créditos, autenticação e limites existentes para geração.

Testes obrigatórios: filtros temporais e por tema, normalização de notícia, estados de API/cache/erro, cards, popup, encaminhamento para carrossel, fluxo sem template de News, salvar template e troca para `Criar Notícia`, preservação da notícia selecionada, segurança de URL e validação de autenticação.

## Política de assets enviados pelo Rafael

Quando o Rafael enviar novo template, previews ou referência visual:

- armazenar os assets no local compatível com o projeto;
- verificar formato, dimensões, peso e nomes;
- não sobrescrever asset existente sem confirmar que é a substituição correta;
- atualizar o mapeamento do TODO;
- executar validação visual após a integração;
- se o asset estiver incompleto, registrar exatamente o que falta e não mascarar com uma conclusão falsa.

## Definição global de pronto

Uma task só pode ser marcada como concluída quando:

- o comportamento foi implementado de ponta a ponta;
- os tipos compilam e os testes relevantes passam;
- `npm test` e `npm run build` foram executados quando aplicável;
- o fluxo foi verificado visualmente no browser quando houver UI;
- não existem regressões conhecidas nos fluxos atuais;
- segurança, autenticação, créditos, persistência e estados de erro foram tratados;
- `TODO` e `TODO RAFAEL` foram atualizados com evidências;
- o diff foi revisado e não contém mudanças fora do escopo.

No encerramento, não diga apenas que “foi implementado”. Informe o que realmente foi entregue, o que foi testado, quais assets/decisões foram usados e quais pendências dependem de material ou decisão do Rafael.

---

## Instrução inicial do primeiro ciclo

Comece apenas pela TASK 0. Não implemente ainda nenhuma feature. Faça a auditoria, atualize/crie os dois TODOs, execute o baseline e devolva o mini-relatório da TASK 0. Aguarde a confirmação do orquestrador antes de iniciar a TASK 1.

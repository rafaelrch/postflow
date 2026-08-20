# FATIA 2 — Clientes (+ dois consertos na Visão geral)

Você é o Codex, e daqui pra frente é você quem implementa este painel — design e
backend. Continue na branch `feat/admin-dashboard-f1`.

Leia antes: `AGENTS.md` (Next.js 16.2.10 tem breaking changes — consulte
`node_modules/next/dist/docs/`), `docs/admin-dashboard-analise.md` (inventário
real do banco, é a fonte de verdade sobre o que existe), `lib/admin-metrics.ts`,
`lib/admin-auth.ts`, `app/admin/admin.css`.

---

## PARTE A — dois consertos antes de começar a fatia nova

### A1. Um card que falha não pode derrubar a tela inteira

Hoje `loadAdminOverview` faz `Promise.all` de ~21 consultas e qualquer erro
estoura tudo: o Rafael viu "O painel não carregou" no lugar de 18 números certos
e 3 avisos. Num painel de leitura isso está errado.

Troque por resultados independentes (`Promise.allSettled` ou equivalente): cada
métrica vira sucesso **ou** falha isolada, e o card que falhou mostra "não deu
pra ler" com opção de tentar de novo, enquanto o resto exibe o valor.

**Não** substitua número que falhou por zero, traço mudo ou valor antigo. Um
card que falhou tem que dizer que falhou — zero é uma afirmação sobre o negócio.
A tela inteira só cai se a própria autorização falhar.

### A2. Renovações previstas estão escondendo o que não sabem

O filtro é `current_period_end >= agora`, o que exclui **em silêncio** as
assinaturas ativas com `current_period_end` nulo (existiu uma migration de
backfill em 14/08 justamente por isso). O número é um piso e a tela não avisa.

Conte também as ativas sem `current_period_end` e mostre no rodapé do card algo
como "N assinatura(s) sem data de renovação — não entram nesta conta". Em zero,
não mostre nada. É o mesmo tratamento que já existe para o teto de leads em
checkout, que está certo.

---

## PARTE B — a aba Clientes

Rota `/admin/clientes`, com `requireAdminPage()`. Tire o badge "Em breve" do
menu só desta seção.

### O que o Rafael precisa fazer nesta tela

1. Achar UM cliente rápido, pelo e-mail, quando ele abre um chamado. É o uso
   mais frequente e tem que ser o mais fácil.
2. Ver a lista inteira de quem paga, com o estado de cada um.
3. Achar os grupos que pedem ação: quem pagou e não criou conta, quem está com
   cancelamento agendado, quem zerou os créditos, quem não terminou o onboarding.

### Busca

Campo de busca em destaque, por e-mail (e por nome). Debounce, termo preservado
na URL. Colar um e-mail inteiro tem que achar a pessoa — inclusive quem **pagou
e ainda não tem conta**, que existe só em `subscriptions.email` e não tem perfil
nenhum. Esse caso é justamente quando o cliente está gritando por suporte.

### Colunas — só o que existe de verdade hoje

Nome · E-mail · Cadastro · Onboarding · Plano · Status da assinatura · Valor ·
Próxima renovação ou fim do acesso · Cancelamento agendado · Créditos
(saldo/limite) · Conteúdo existente (carrosséis, notícias, agendamentos).

**Proibido nesta fatia**, porque não há instrumentação e o dado não existe:
"online agora", "última atividade", "exportações", "créditos consumidos no
ciclo" como histórico. Não aproxime, não invente proxy. Isso é a Fatia 4/5.

O rótulo de conteúdo é "existente hoje", nunca "total criado" — registros
apagados sumiram do banco.

### Filtros

Mensal · anual · ativa · past_due · unpaid · cancelada · cancelamento agendado ·
onboarding incompleto · sem conteúdo · créditos zerados · pagou e não criou
conta. Combináveis, preservados na URL, com contador do resultado.

### Detalhe do cliente

Clicar abre painel lateral (ou página) com: resumo da conta, assinatura, créditos,
contagem de conteúdo, e a linha do tempo do que dá pra reconstruir (lead →
checkout → pagamento → conta vinculada → onboarding → primeiro conteúdo).

**Nunca exiba conteúdo privado do cliente** — nada de título de carrossel, texto
de slide, prompt ou legenda. Só metadados e contagens. Se aparecer texto que o
cliente escreveu, está errado.

### Como buscar os dados — a parte difícil

O e-mail mora em `auth.users`, o resto em Postgres. **Não** liste todos os
usuários do Auth para cruzar em memória: funciona com 2 clientes e quebra com
2000, e é exatamente o tipo de coisa que ninguém percebe até doer.

Pagine, ordene e filtre **no Postgres**. Se precisar de view ou RPC, ela é
server-only: `security_invoker` nas views expostas; função `security definer`
com `revoke execute from public/anon/authenticated` e `search_path` fixo. Não
exponha tabela ou view nova ao Data API sem necessidade. Índices para os
filtros e a ordenação. `service_role` só depois do `requireAdmin` passar.

Documente no código a escolha que fez e por quê.

### Interface

Mesma linguagem minimalista do `admin.css`: borda de 1px, canto suave, sem
sombra dura, ícones lucide, `tabular-nums`, status como pill discreta com cor
só quando significa algo (âmbar/vermelho para past_due, unpaid, cancelamento
agendado). Tabela com header fixo, linhas compactas, skeleton, empty state
("nenhum cliente com esses filtros" ≠ "nenhum cliente"), erro com tentar de novo.
Sem rolagem horizontal da página — se a tabela for larga, ela rola dentro do
próprio container. Dark e light. Somente leitura: nenhum botão que altere dado.

---

## Testes

Autorização da nova rota (visitante 401, usuário comum 403). Busca por e-mail
achando quem não tem conta. Cada filtro. Paginação (página 2 não repete nem pula
registro). Ordenação estável com valores iguais. Cliente sem assinatura e
assinatura sem cliente não quebram a linha. Card que falha não derruba a tela
(A1). Contagem de assinaturas sem `current_period_end` (A2).

Baseline: 98 arquivos, 1392 testes, 0 falha, com
`npx vitest run --exclude "**/.claude/worktrees/**"`. `tsc --noEmit` limpo.
Nenhum teste existente afrouxado.

## Entrega

Commits na branch `feat/admin-dashboard-f1`. **Sem push, sem merge.**
Um servidor de dev já roda na porta 3000 — **não suba outro**, servidor duplicado
já serviu código velho e gerou erro fantasma nesta sessão. Se precisar reiniciar,
mate o que existe antes.

Verificação visual no portal, medindo de verdade (`getBoundingClientRect`,
`scrollWidth`), não presença no DOM. Se o portal cair no login, peça o login ao
Rafael e marque a medição como PENDENTE — nunca contorne autenticação, nunca
estime.

Reporte com `maestri ask "Orquestrador" "<relatório>"`: arquivos, migrations
necessárias, resultado real de testes e tsc (números), decisão de como paginou
os dados, o que ficou de fora e por quê.

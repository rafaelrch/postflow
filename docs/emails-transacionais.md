# E-mails transacionais (Supabase Auth + Resend)

Hoje os e-mails que o cliente recebe são os **default do Supabase Auth**: em inglês,
sem marca, com o remetente `noreply@mail.app.supabase.io`. O mais crítico é o de
confirmação de cadastro — ele é o primeiro contato de quem **acabou de pagar**
(`app/api/asaas/signup-intent/route.ts` cria o usuário e dispara a confirmação; o
link cai em `/definir-senha`).

Os templates novos estão em `supabase/email-templates/`. São HTML puros, colados à
mão no dashboard. Não há deploy automático: **editar o arquivo não muda nada em
produção** enquanto o conteúdo não for colado no painel.

---

## 1. Os seis templates e seus assuntos

| Arquivo | Template no dashboard | Assunto (Subject) |
| --- | --- | --- |
| `confirmacao-cadastro.html` | Confirm signup | `Ative seu acesso ao Creatools` |
| `convite.html` | Invite user | `Você foi convidado para o Creatools` |
| `magic-link.html` | Magic Link | `Seu link de acesso ao Creatools` |
| `trocar-email.html` | Change Email Address | `Confirme seu novo e-mail` |
| `recuperar-senha.html` | Reset Password | `Redefina sua senha do Creatools` |
| `reautenticacao.html` | Reauthentication | `Seu código de confirmação` |

---

## 2. Passo a passo: colar no dashboard

Faça um template por vez. Nada aqui é destrutivo, mas o painel salva na hora — o
próximo e-mail já sai com o conteúdo novo.

1. Abra o projeto no [supabase.com/dashboard](https://supabase.com/dashboard).
2. Menu lateral: **Authentication** → **Emails** (em projetos mais antigos:
   *Authentication → Email Templates*).
3. No topo da página há uma aba por template. Comece por **Confirm signup**.
4. Campo **Subject heading** (ou *Subject*): apague o texto em inglês e cole o
   assunto da tabela acima. É texto puro, sem HTML.
5. Campo **Message body**: mude o editor para a aba **Source** / `</>` (se estiver
   no modo visual, ele reescreve o HTML e quebra o layout). Apague **todo** o
   conteúdo e cole o arquivo `.html` correspondente **inteiro**, incluindo a linha
   `<!DOCTYPE html>`.
6. Clique em **Save changes**.
7. Repita os passos 3–6 para os outros cinco templates, sempre casando arquivo ↔
   aba pela tabela acima.

### Como testar

- **Confirm signup / Magic Link / Reset Password**: faça o fluxo real com um e-mail
  seu (cadastro de teste, "esqueci minha senha") e confira no Gmail web, no app do
  Gmail e no Apple Mail.
- **Reauthentication**: confira que o código aparece grande e espaçado, e que
  **não** há botão nem link.
- **Change Email Address**: confira que o e-mail antigo e o novo aparecem no corpo.
- Em todos: clique no botão e confira que ele leva ao destino certo; depois copie a
  URL de texto que fica abaixo do botão e confira que é a mesma.

---

## 3. SMTP customizado (Resend) — obrigatório

Trocar o HTML **não basta**. Sem SMTP próprio, o Supabase continua mandando pelo
serviço compartilhado dele, e isso significa:

- **Remetente errado**: chega como `noreply@mail.app.supabase.io`, não como
  `Equipe Creatools <contato@creatools.com.br>`. Para quem acabou de pagar, isso
  parece golpe.
- **Limite de 2 e-mails por hora** no serviço default, para o projeto inteiro. Não
  é por usuário. Num dia com 3 cadastros, o terceiro cliente simplesmente **não
  recebe** o e-mail de ativação.
- **Entregabilidade**: o domínio compartilhado do Supabase não tem a reputação nem
  o SPF/DKIM do `creatools.com.br` (que já está verificado no Resend).

### Configuração

Precisa de uma API key do Resend com permissão de envio. Ela é um **segredo**: não
vai para o repositório, nem para commit, nem para esta doc. Pegue em
[resend.com/api-keys](https://resend.com/api-keys) e cole direto no painel.

No dashboard: **Project Settings** → **Authentication** → seção **SMTP Settings**
(em algumas versões: *Authentication → Emails → SMTP Settings*). Ligue
**Enable Custom SMTP** e preencha:

| Campo | Valor |
| --- | --- |
| Sender email | `contato@creatools.com.br` |
| Sender name | `Equipe Creatools` |
| Host | `smtp.resend.com` |
| Port number | `465` |
| Username | `resend` |
| Password | a API key do Resend (começa com `re_`) |

Salve e dispare um e-mail de teste (um "esqueci minha senha" resolve). Se não
chegar, olhe **Resend → Logs**: erro de autenticação aparece lá como falha de
credencial; erro de domínio aparece como remetente não verificado.

Depois de ligar o SMTP customizado, o limite de e-mails passa a ser o do plano do
Resend, e vale a pena revisar o **rate limit de e-mails** em
*Authentication → Rate Limits* (o default do Supabase segue baixo mesmo com SMTP
próprio).

---

## 4. Aviso: as variáveis são do Go template do Supabase

O que está entre chaves duplas nos HTML — `{{ .ConfirmationURL }}`, `{{ .Token }}`,
`{{ .Email }}`, `{{ .NewEmail }}` — é interpolado pelo **Supabase**, com sintaxe de
Go template. Não são variáveis nossas.

- **Não renomeie, não traduza, não mude a caixa.** `{{ .confirmationURL }}` ou
  `{{ .LinkDeConfirmacao }}` não são erro visível: o Supabase manda o e-mail com o
  campo **vazio**, e o cliente recebe um botão que não leva a lugar nenhum.
- **Não escape.** Se o editor visual do painel transformar `{{` em `&#123;&#123;`,
  a variável some. Por isso o passo 5 acima manda usar a aba **Source**.
- **Não invente outras.** As disponíveis são `ConfirmationURL`, `Token`,
  `TokenHash`, `SiteURL`, `Email` e `NewEmail`. Qualquer outra renderiza vazia.
- `{{ .Token }}` é o código de 6 dígitos (usado na reautenticação, sem link);
  `{{ .ConfirmationURL }}` é o link completo, e nos cinco templates com botão ela
  aparece **duas vezes** de propósito: no `href` e em texto para copiar e colar.
  Se mexer em uma, mexa na outra.

---

## 5. O template no Resend — o que ele é e o que ele NÃO é

Existe um template publicado no Resend: **"Creatools · Ative seu acesso"**
(alias `creatools-ative-seu-acesso`, variável `{{{CONFIRMATION_URL}}}`, remetente
`Equipe Creatools <contato@creatools.com.br>`). É o mesmo HTML do
`confirmacao-cadastro.html`, só com a sintaxe de variável do Resend.

**O Supabase Auth não consegue usar esse template.** Com SMTP customizado o
Supabase renderiza o HTML *dele* (o da seção 2) e entrega o resultado pronto pro
Resend, que só transporta. Template do Resend só entra em jogo em e-mail mandado
pela **API do Resend** pelo nosso código.

Então ele serve para: (a) preview e ajuste visual no dashboard do Resend, e
(b) e-mails que o **nosso código** manda pela API. Para tudo que sai do Auth
(confirmação de cadastro, recuperação de senha), **a fonte de verdade do que o
cliente recebe é o painel do Supabase**, seção 2. Se editar um, edite o outro.

### Quem usa este template hoje

O **aviso de pagamento órfão** — a única coisa no app que chama a API do Resend.

Quem paga entra numa corrida: a conta só nasce depois que o webhook do Asaas
confirma o pagamento, e a tela de `/cadastro` espera esse webhook por ~92s antes
de desistir. Se ele demorar mais (instabilidade do Asaas, nossa função fora do
ar, a fila deles pausada por 15 falhas seguidas), a pessoa **pagou e não
consegue criar a conta** — e, antes disto existir, ninguém era avisado.

Agora o webhook agenda este e-mail no Resend para dali a 15 minutos, com
`{{{CONFIRMATION_URL}}}` apontando para `/cadastro?t=<token do lead>`; se a
pessoa concluir o cadastro dentro da janela, o envio é **cancelado** e ela nunca
o recebe. Ver `lib/orphan-signup-notice.ts` para o raciocínio inteiro (inclusive
por que a decisão não pode ser tomada no instante do webhook).

O texto do template já servia sem uma vírgula de mudança — "Seu pagamento foi
confirmado. Falta um passo: criar a senha" descreve exatamente este caso.

⚠️ Ele NÃO pode ir pelo Supabase Auth: no instante em que precisa sair, o
usuário do Supabase **ainda não existe** (a assinatura está com `user_id` null).
Não há a quem o Auth mandaria e-mail.

⚠️ Exige `RESEND_API_KEY` nas env vars do app (Vercel, Preview **e**
Production). É uma chave DIFERENTE do SMTP da seção 3 no sentido de onde mora:
aquela vive dentro do painel do Supabase, esta no nosso app. Sem ela nada é
enviado — o webhook loga `missing_RESEND_API_KEY` e segue, sem quebrar o
registro do pagamento.

---

## 6. Decisões de design (para quem for editar o HTML)

- Layout 100% em `<table>`, CSS todo inline, largura máxima 600px, fluida no
  celular. Nada de `<style>`, flex, grid ou `background-image` — Gmail remove.
- A "sombra dura" brutalist do card é feita com borda assimétrica
  (2px em cima/esquerda, 5px embaixo/direita, todas `#0A0A0A`), em vez de células
  deslocadas: mesma leitura visual, sem risco de quebrar no Outlook.
- O botão é preto sólido (`#0A0A0A`) com borda sólida de 2px da mesma cor. Sombra
  deslocada num botão já preto não teria contraste, então ficou de fora.
- O coral `#E4572E` aparece **só** no filete de 4px no topo do card. Em nenhum
  outro lugar.
- A URL de texto abaixo do botão usa `word-break:break-all` para não estourar o
  card no celular.
- Logo: `https://www.creatools.com.br/ICON_SEMFUNDO.png`, 36×36. É a URL de
  produção. Se o arquivo sair do ar, os seis e-mails ficam com um alt quebrado —
  o texto "Creatools" ao lado é imagem-independente justamente por isso.

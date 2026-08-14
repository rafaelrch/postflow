-- 20260813_resolve_rate_limit.sql
--
-- Teto próprio para o passo de RESOLVE do cadastro pago.
--
-- ── O PROBLEMA ──────────────────────────────────────────────────────────────
--
-- Desde que a successUrl do checkout aponta direto para /cadastro, o comprador
-- chega ANTES do webhook do Asaas. A página passou a esperar por ele: pergunta,
-- vê que a assinatura ainda não existe, espera, pergunta de novo — hoje por
-- ~90s, com intervalo crescente.
--
-- Só que os dois passos da rota /api/asaas/signup-intent consumiam o MESMO
-- balde, consume_passwordless_rate, de 5 por minuto por (ip, referência). Com a
-- espera longa, quem estava no caminho CERTO estourava a própria cota e recebia
-- 429 — trocaríamos "não encontramos seu pagamento" por "tente mais tarde", que
-- é igualmente falso e mais confuso.
--
-- ── POR QUE DOIS BALDES E NÃO UM MAIOR ──────────────────────────────────────
--
-- Porque os dois passos têm risco diferente e merecem tetos diferentes:
--
--   • COMMIT (com senha): CRIA usuário em auth.users, grava senha e dispara
--     e-mail. Continua em consume_passwordless_rate, 5/min, intocado. Afrouxar
--     isto seria afrouxar a criação de contas.
--
--   • RESOLVE (sem senha): não escreve nada em auth, não envia e-mail. Lê a
--     assinatura e devolve o e-mail de quem pagou para um token HMAC que o
--     NOSSO servidor emitiu (lib/signup-token.ts). O custo real de abusar dele
--     é um SELECT e, quando a assinatura já está ativa, uma leitura na API do
--     Asaas. Um teto mais folgado aqui não afrouxa nenhum portão — o gate()
--     inteiro (estado da assinatura, releitura remota, trigger do banco)
--     continua valendo em cada chamada.
--
-- Se os dois dividissem o balde, cada espera longa comeria a cota do commit e o
-- comprador não conseguiria terminar o cadastro depois de esperar. Separar não
-- é conveniência: é o que faz a espera funcionar.
--
-- ── COMO OS BALDES FICAM SEPARADOS SEM TABELA NOVA ──────────────────────────
--
-- As mesmas duas tabelas de contagem, com o ref_hash em OUTRO namespace: a rota
-- manda sha256('resolve:' || leadId) no resolve e sha256(leadId) no commit.
-- Chaves diferentes ⇒ linhas diferentes ⇒ contadores independentes. Nenhuma
-- tabela nova, nenhuma coluna nova, e consume_passwordless_rate segue byte a
-- byte como está.
--
-- ── OS NÚMEROS ──────────────────────────────────────────────────────────────
--
-- A janela de espera do cliente é ~92s em 6 tentativas (0s, 4s, 12s, 27s, 52s,
-- 92s). No pior alinhamento com a janela de 1 minuto do contador, 5 delas caem
-- no mesmo minuto; some o botão manual e sobra folga com 15. O teto por token
-- (30) é o dobro, para caber a mesma pessoa em duas abas ou trocando de rede
-- sem passar de um limite que ainda é um limite.
--
-- Idempotente: pode rodar mais de uma vez sem estrago.

begin;

-- Genérica no limite, para não precisar de uma função nova a cada balde. As
-- tabelas e o formato da janela são os mesmos de consume_passwordless_rate.
create or replace function public.consume_rate_window(
  p_ip_hash text,
  p_ref_hash text,
  p_ip_limit int,
  p_ref_limit int
) returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_start timestamptz := date_trunc('minute', now());
  v_count int;
  v_global int;
begin
  insert into public.passwordless_rate_limits(ip_hash, ref_hash, window_start, count)
       values (p_ip_hash, p_ref_hash, v_start, 1)
  on conflict (ip_hash, ref_hash, window_start)
    do update set count = passwordless_rate_limits.count + 1
    returning count into v_count;

  insert into public.passwordless_ref_rate_limits(ref_hash, window_start, count)
       values (p_ref_hash, v_start, 1)
  on conflict (ref_hash, window_start)
    do update set count = passwordless_ref_rate_limits.count + 1
    returning count into v_global;

  return v_count <= p_ip_limit and v_global <= p_ref_limit;
end; $$;

-- Mesmo padrão das outras: ninguém logado chama isto direto; só a service role,
-- de dentro da rota de servidor.
revoke all on function public.consume_rate_window(text, text, int, int) from public, anon, authenticated;
grant execute on function public.consume_rate_window(text, text, int, int) to service_role;

commit;

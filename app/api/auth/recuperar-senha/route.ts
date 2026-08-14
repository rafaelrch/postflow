import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { appUrl } from '@/lib/app-url';
import { rateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * Pedido de recuperação de senha: dispara o e-mail com o link de redefinição.
 *
 * ⚠️ A RESPOSTA É SEMPRE A MESMA, exista a conta ou não. Não é preciosismo:
 * uma resposta diferente para "e-mail não encontrado" transforma esta rota num
 * verificador de clientes — dá para varrer uma lista de endereços e descobrir
 * quem é cliente do Creatools. Por isso não há ramo de erro por e-mail
 * inexistente aqui, nem sequer no log.
 *
 * O disparo em si é do Supabase (resetPasswordForEmail), que já sabe não mandar
 * e-mail para endereço sem conta. Nós nem perguntamos se existe: perguntar
 * criaria justamente o ramo que não queremos ter.
 */

/** Resposta única. Um objeto só, para não haver como divergir sem querer. */
const RESPOSTA_UNICA = {
  ok: true,
  message: 'Se existir uma conta com esse e-mail, enviamos o link de redefinição.',
} as const;

/**
 * Dois baldes, e cada um cobre um abuso diferente:
 *
 *   • por IP — impede alguém de varrer uma lista de endereços a partir de uma
 *     origem só.
 *   • por E-MAIL — impede usar o formulário para encher a caixa de entrada de
 *     UMA pessoa a partir de vários IPs. Sem este, trocar de rede burlaria o
 *     limite e o alvo receberia dezenas de e-mails nossos (e a cota do Resend
 *     iria junto).
 *
 * O balde por e-mail é criado exista a conta ou não — se só existisse para
 * conta real, o próprio 429 viraria o vazamento que a resposta única evita.
 */
const LIMITE_POR_IP = { limit: 5, windowMs: 15 * 60_000 };
const LIMITE_POR_EMAIL = { limit: 3, windowMs: 60 * 60_000 };

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  // E-mail sem formato de e-mail não vira chamada ao Supabase — mas a resposta
  // continua sendo a mesma de sempre, para não separar "inválido" de "não
  // existe" aos olhos de quem sonda.
  const pareceEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const porIp = rateLimit(`recuperar-senha:ip:${clientIp(req)}`, LIMITE_POR_IP);
  if (!porIp.ok) return recusaPorExcesso(porIp.retryAfterSec);

  if (pareceEmail) {
    const porEmail = rateLimit(`recuperar-senha:email:${email}`, LIMITE_POR_EMAIL);
    if (!porEmail.ok) return recusaPorExcesso(porEmail.retryAfterSec);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (supabaseUrl && anonKey) {
      // Cliente isolado, sem persistir sessão: esta rota não tem (nem deve ter)
      // usuário logado, e o que ela faz é só pedir o e-mail ao Supabase.
      const supabase = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      // redirectTo por appUrl(), NUNCA escrito à mão: em produção a env é
      // obrigatória e a função falha alto se apontar para localhost. Link de
      // redefinição para o domínio errado é conta inacessível.
      //
      // ⚠️ Esta URL precisa estar em Supabase → Authentication → URL
      // Configuration → Redirect URLs. Sem isso o link cai no Site URL e a
      // pessoa não consegue redefinir. Ver TAREFAS-RAFAEL.
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: appUrl('/redefinir-senha'),
      });
      // Falha do provedor é registrada SEM o e-mail e sem mudar a resposta:
      // quem pediu não pode descobrir nada pelo que voltou.
      if (error) console.error('[recuperar-senha] envio_falhou');
    } else {
      console.error('[recuperar-senha] supabase_nao_configurado');
    }
  }

  return NextResponse.json(RESPOSTA_UNICA);
}

function recusaPorExcesso(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      code: 'rate_limited',
      message: 'Muitos pedidos seguidos. Aguarde alguns minutos e tente de novo.',
    },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  );
}

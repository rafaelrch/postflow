import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { appUrl } from '@/lib/app-url';
import { rateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// Resposta GENÉRICA e ÚNICA para sucesso: idêntica quer o e-mail seja novo ou
// já exista. Não revela se a conta existe (anti-enumeração).
const okBody = () => NextResponse.json({ ok: true });
const generic = { error: 'Não foi possível iniciar o cadastro.' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Mesma política do fluxo pago (AuthForm/definir-senha usam minLength 6). Não
// inventamos política nova nem enfraquecemos a existente.
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 200;

/**
 * Cadastro GRÁTIS (sem pagamento). O usuário já escolhe e-mail + senha aqui; a
 * conta nasce NÃO confirmada (email_confirm:false) e SÓ pode logar depois de
 * clicar no link de confirmação. Cria via service-role com o marcador
 * signup_kind='free' (lido pelo trigger BEFORE INSERT). NÃO toca em
 * subscriptions e NÃO concede 'pro': entitlement vem do default do banco. É um
 * caminho SEPARADO do pago — não o enfraquece.
 */
export async function POST(req: NextRequest) {
  // Rate limit por IP ANTES de qualquer trabalho — corta abuso trivial de uma
  // origem (caveat serverless documentado em lib/rate-limit.ts).
  const rl = rateLimit(`free-signup:${clientIp(req)}`, { limit: 5, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json(generic, { status: 429 });

  const origin = req.headers.get('origin');
  if (!origin || origin !== appUrl()) return NextResponse.json(generic, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = body.email?.trim().toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  // Validação de formato (independe de a conta existir → não vaza enumeração).
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json(generic, { status: 400 });
  }
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return NextResponse.json(generic, { status: 400 });
  }

  try {
    const admin = createAdminSupabaseClient();

    // A senha escolhida entra JÁ na criação. email_confirm:false garante que a
    // conta não confirmada NÃO loga (com "Confirm email" ligado no Supabase).
    // signup_kind='free' vai em user_metadata (raw_user_meta_data) porque é o
    // ÚNICO metadado legível no BEFORE INSERT do trigger. origin='free_signup'
    // marca a conta como grátis (service-role, não editável pelo cliente).
    // Nenhum dos dois linka assinatura.
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { signup_kind: 'free' },
      app_metadata: { origin: 'free_signup' },
    });

    // Conta já existe: NÃO revela (anti-enumeração). Não altera a senha do
    // registro existente. Ainda tenta reenviar a confirmação (best-effort) para
    // o dono legítimo poder concluir.
    const alreadyExists =
      created.error
      && (created.error.code === 'email_exists' || created.error.code === 'user_already_exists');
    if (created.error && !alreadyExists) {
      // Falha real de criação: resposta genérica, sem vazar o motivo.
      return okBody();
    }

    // Entitlement 'free' EXPLÍCITO no ATO da criação — não no fim do onboarding.
    // Antes, profiles (e portanto o entitlement) só nascia ao concluir o
    // onboarding, deixando a conta free sem linha de plano. Idempotente e
    // best-effort: on conflict do nothing (nunca rebaixa um pro existente) e
    // uma falha aqui não quebra o cadastro — o trigger/backfill do banco
    // (migration 20260726) é a garantia authoritative. NUNCA concede 'pro'.
    const newUserId = created.data?.user?.id;
    if (!created.error && newUserId) {
      await admin
        .from('user_entitlements')
        .upsert({ user_id: newUserId, plan: 'free' }, { onConflict: 'user_id', ignoreDuplicates: true });
    }

    // Confirmação de signup: ao confirmar, o usuário cai no LOGIN e entra com a
    // senha que ele mesmo escolheu (fluxo free NÃO passa mais por /definir-senha).
    // Usa client anônimo só para o e-mail.
    const mailClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    await mailClient.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: appUrl('/login') },
    });

    return okBody();
  } catch {
    // Falha fechada e silenciosa: mesma resposta de sucesso, sem vazar estado.
    return okBody();
  }
}

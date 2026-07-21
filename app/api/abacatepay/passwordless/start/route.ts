import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { getCheckout } from '@/lib/abacatepay';
import { appUrl } from '@/lib/app-url';
import { resolveEmail, upsertSubscription } from '../../../../../lib/abacatepay-sync';
import { rateLimit, clientIp } from '../../../../../lib/rate-limit';

export const runtime = 'nodejs';
const generic = { error: 'Não foi possível iniciar o cadastro.' };

export async function POST(req: NextRequest) {
  const rl = rateLimit(`passwordless-start:${clientIp(req)}`, { limit: 5, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json(generic, { status: 429 });
  const origin = req.headers.get('origin');
  if (!origin || origin !== appUrl()) return NextResponse.json(generic, { status: 403 });
  const body = await req.json().catch(() => ({})) as { checkout_ref?: string };
  const ref = body.checkout_ref?.trim();
  if (!ref || !/^[A-Za-z0-9_-]{8,160}$/.test(ref)) return NextResponse.json(generic, { status: 400 });
  try {
    const admin = createAdminSupabaseClient();
    const trustedIp = req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip')?.trim() || 'unknown';
    const ipHash = createHash('sha256').update(trustedIp).digest('hex');
    const refHash = createHash('sha256').update(ref).digest('hex');
    const { data: mapping } = await admin.from('abacatepay_checkout_refs').select('checkout_id').eq('ref_hash',refHash).is('consumed_at', null).gt('expires_at',new Date().toISOString()).maybeSingle();
    if (!mapping?.checkout_id) return NextResponse.json(generic, { status: 403 });
    const limited = await admin.rpc('consume_passwordless_rate', { p_ip_hash: ipHash, p_ref_hash: refHash });
    if (limited.error || limited.data === false) return NextResponse.json(generic, { status: 429 });
    const checkout = await getCheckout(mapping.checkout_id);
    if (checkout.status !== 'PAID' || checkout.frequency !== 'SUBSCRIPTION') return NextResponse.json(generic, { status: 403 });
    const email = await resolveEmail(checkout);
    if (!email) return NextResponse.json(generic, { status: 403 });
    await upsertSubscription(checkout, email, null, { linkUser: false });
    const { data: row } = await admin.from('subscriptions').select('id').eq('id', checkout.id).eq('provider','abacatepay').is('user_id',null).maybeSingle();
    if (!row?.id) return NextResponse.json(generic, { status: 403 });
    const created = await admin.auth.admin.createUser({ email, email_confirm: false, app_metadata: { origin: 'paid_passwordless' } });
    if (created.error && created.error.code !== 'email_exists' && created.error.code !== 'user_already_exists') return NextResponse.json(generic, { status: 403 });
    const prepared = await admin.rpc('prepare_paid_signup_intent', { p_subscription_id: row.id, p_email: email });
    if (prepared.error || !prepared.data || !['pending', 'claimed'].includes((prepared.data as { state?: string }).state ?? '')) return NextResponse.json(generic, { status: 403 });
    const otpClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: otpError } = await otpClient.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (otpError) return NextResponse.json(generic, { status: 403 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(generic, { status: 403 });
  }
}

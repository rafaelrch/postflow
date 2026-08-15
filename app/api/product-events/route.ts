import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { validateProductEvent } from '@/lib/product-events';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const limit = rateLimit(`product-event:${user.id}:${clientIp(request)}`, { limit: 120, windowMs: 60_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: 'Muitos eventos' }, {
      status: 429,
      headers: { 'retry-after': String(limit.retryAfterSec) },
    });
  }

  let input: unknown;
  try { input = await request.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  const event = validateProductEvent(input);
  if (!event) return NextResponse.json({ error: 'Evento inválido' }, { status: 400 });

  const { error } = await createAdminSupabaseClient().from('product_events').insert({
    user_id: user.id,
    event_name: event.eventName,
    feature: event.feature,
    session_id: event.sessionId,
    properties: event.properties,
  });
  if (error) {
    console.error('[product-events route]', error);
    return NextResponse.json({ error: 'Falha ao registrar evento' }, { status: 503 });
  }
  return new NextResponse(null, { status: 204 });
}

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error } = await supabase.from('carousels').select('id').limit(1);

  if (error?.code === 'PGRST205' || error?.message?.includes('does not exist')) {
    return NextResponse.json({ ok: false, error: 'Tabelas ainda não existem. Execute o SQL no Supabase.' });
  }

  return NextResponse.json({ ok: true });
}

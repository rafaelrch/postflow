import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const requiredTables = [
    'profiles',
    'projects',
    'carousels',
    'slides',
    'news_entries',
    'templates',
    'assets',
    'scheduled_posts',
    'content_relations',
  ];

  const missing: string[] = [];

  for (const table of requiredTables) {
    const { error } = await supabase.from(table).select('id').limit(1);
    if (error?.code === 'PGRST205' || error?.message?.includes('does not exist')) {
      missing.push(table);
    } else if (error) {
      return NextResponse.json({
        ok: false,
        error: `Erro ao verificar ${table}: ${error.message}`,
      });
    }
  }

  if (missing.length > 0) {
    return NextResponse.json({
      ok: false,
      error: `Tabelas ausentes: ${missing.join(', ')}. Execute o SQL completo no Supabase.`,
      missing,
    });
  }

  const { error: profileColumnsError } = await supabase
    .from('profiles')
    .select('phone, brand_name, instagram_handle, news_instagram_handle, twitter_handle, brand_palette, brand_logo_url, brand_story, audience_pains, onboarding_completed')
    .limit(1);

  if (profileColumnsError) {
    return NextResponse.json({
      ok: false,
      error: `Colunas de onboarding ausentes em profiles: ${profileColumnsError.message}. Execute o SQL atualizado no Supabase.`,
    });
  }

  return NextResponse.json({ ok: true });
}

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { safeNextPath } from '@/lib/safe-next-path';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  // `next` vem da URL e é atacável: sem normalizar, ?next=https://evil.com
  // redirecionaria para fora do domínio logo após a confirmação de e-mail.
  const next = safeNextPath(requestUrl.searchParams.get('next'));

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    // Sem essa checagem, um code expirado/já usado/adulterado seguia para o
    // destino como se a confirmação tivesse dado certo — o usuário só
    // descobria ao ser jogado de volta pro /login pelo proxy, sem explicação.
    if (error) {
      const loginUrl = new URL('/login', requestUrl.origin);
      loginUrl.searchParams.set('authError', 'invalid_code');
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}

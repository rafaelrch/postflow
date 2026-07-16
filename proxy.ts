import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const protectedPrefixes = ['/dashboard', '/generator', '/agenda', '/news', '/twitter', '/setup', '/onboarding', '/conta'];
const authPrefixes = ['/login', '/cadastro'];

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getSession lê o JWT do cookie sem round-trip ao Supabase (getUser fazia
  // uma chamada de rede em TODA navegação) e só vai à rede para renovar o
  // token quando ele expira. O redirect daqui é só UX — a segurança real dos
  // dados é o RLS, que valida a assinatura do JWT no próprio Postgres.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const pathname = request.nextUrl.pathname;
  const isProtected = protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const isAuthRoute = authPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = request.nextUrl.searchParams.get('next') || '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  // Só as rotas que precisam de auth/redirect — landing, preços e /api não
  // pagam a latência do proxy (as rotas de API validam a sessão por conta
  // própria via createServerSupabaseClient).
  matcher: [
    '/dashboard/:path*',
    '/generator/:path*',
    '/agenda/:path*',
    '/news/:path*',
    '/twitter/:path*',
    '/setup/:path*',
    '/onboarding/:path*',
    '/conta/:path*',
    '/login',
    '/cadastro',
  ],
};

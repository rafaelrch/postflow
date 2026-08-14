import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// /configuracoes entra junto com /conta: a página migrou para lá, e uma sem a
// outra deixaria a tela nova aberta a visitante sem sessão.
const protectedPrefixes = ['/dashboard', '/generator', '/agenda', '/news', '/twitter', '/setup', '/onboarding', '/conta', '/configuracoes'];

/**
 * Rotas de auth: quem JÁ está logado é mandado para o app.
 *
 * ⚠️ /redefinir-senha NÃO ENTRA AQUI — nem aqui nem em protectedPrefixes. As
 * duas listas quebrariam a redefinição de senha, cada uma do seu jeito:
 *
 *   • como rota PROTEGIDA — o Supabase manda a sessão no FRAGMENTO da URL
 *     (#access_token…), que nunca chega ao servidor. O proxy veria um visitante
 *     anônimo e mandaria para o login antes de qualquer JS ler o fragmento, com
 *     o link do e-mail já queimado. Foi assim que este projeto se mordeu uma
 *     vez, no /definir-senha.
 *   • como rota de AUTH — quem clicasse no link estando logado (sessão velha em
 *     outra aba) seria expulso para /dashboard sem nunca ver o formulário.
 *
 * /recuperar-senha fica fora pelo mesmo espírito: é a saída de quem NÃO
 * consegue entrar, e não pode depender de estado de sessão nenhum.
 */
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
    '/configuracoes/:path*',
    '/login',
    '/cadastro',
  ],
};

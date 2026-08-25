'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  Calendar03Icon,
  ClapperboardIcon,
  LayoutGridIcon,
  MapIcon,
  NewspaperIcon,
  Settings01Icon,
  ShieldCheckIcon,
  SidebarLeft01Icon,
  SidebarRight01Icon,
  SwatchIcon as HugeSwatchIcon,
} from '@hugeicons/core-free-icons';
import {
  ArrowLeftOnRectangle,
  CalendarDays as AnimatedCalendarDays,
  Cog6Tooth,
  Map as AnimatedMap,
  Moon as AnimatedMoon,
  Newspaper as AnimatedNewspaper,
  Squares2x2,
  Sun as AnimatedSun,
  Swatch as AnimatedSwatch,
} from '@/lib/animated-heroicons';
import {
  type AnimatedHeroiconComponent,
  useNativeHoverAnimation,
} from '@/lib/animated-heroicons';
import { cn } from '@/lib/utils';
import { REELS_ENABLED } from '@/lib/feature-flags';
import { useTheme } from '@/components/ThemeProvider';
import { createClient } from '@/lib/supabase';
import NavPending from '@/components/ui/NavPending';
import { useCreditsStore } from '@/hooks/useCreditsStore';

interface NavItem {
  href: string;
  label: string;
  icon: IconSvgElement;
  animatedIcon?: AnimatedHeroiconComponent;
  /** Rotas extras que mantêm o item ativo (além do próprio href). */
  match?: string[];
}

const navItems: NavItem[] = [
  { href: '/dashboard',  label: 'Carrosséis',  icon: LayoutGridIcon, animatedIcon: Squares2x2, match: ['/generator'] },
  { href: '/news',       label: 'Notícias',     icon: NewspaperIcon, animatedIcon: AnimatedNewspaper },
  // Reels fica fora da navegação enquanto a chave estiver desligada. O item
  // continua declarado aqui — religar é só voltar REELS_ENABLED pra true.
  ...(REELS_ENABLED
    ? [{ href: '/reels', label: 'Reels', icon: ClapperboardIcon } as NavItem]
    : []),
  { href: '/agenda',     label: 'Agenda',       icon: Calendar03Icon, animatedIcon: AnimatedCalendarDays },
  { href: '/onboarding', label: 'Onboarding',   icon: HugeSwatchIcon, animatedIcon: AnimatedSwatch },
  // `match: ['/conta']` mantém o item aceso no instante entre clicar num link
  // antigo de /conta e o redirect levar para /configuracoes/assinatura.
  { href: '/configuracoes', label: 'Configurações', icon: Settings01Icon, animatedIcon: Cog6Tooth, match: ['/conta'] },
  // Roadmap é o ÚLTIMO, depois de Configurações — ordem pedida pelo Rafael
  // (21/08). Não é uma tela de trabalho do dia: é para onde se vai quando falta
  // alguma coisa no produto.
  { href: '/roadmap',    label: 'Roadmap',      icon: MapIcon, animatedIcon: AnimatedMap },
];

function SidebarNavItem({
  item,
  pathname,
  collapsed,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
}) {
  const { iconRef, onMouseEnter, onMouseLeave } = useNativeHoverAnimation();
  const { href, label, icon: Icon, animatedIcon: AnimatedIcon, match } = item;
  const routes = [href, ...(match ?? [])];
  const isActive = routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        'relative flex items-center rounded-[10px] text-[13.5px] font-medium',
        collapsed ? 'justify-center h-11 w-11 mx-auto' : 'gap-3 px-3 py-2.5',
        isActive ? 'brand-card interactive' : ''
      )}
      style={{
        background: isActive ? 'white' : 'transparent',
        color: isActive ? 'black' : 'var(--ink-dim)',
        border: isActive ? '1.5px solid black' : '1.5px solid transparent',
        boxShadow: isActive ? '3px 3px 0 0 black' : 'none',
      }}
    >
      {AnimatedIcon ? (
        <AnimatedIcon ref={iconRef} size={16} className="w-4 h-4 shrink-0" aria-hidden />
      ) : (
        <HugeiconsIcon icon={Icon} className="w-4 h-4 shrink-0" aria-hidden />
      )}
      {!collapsed && <span className="flex-1">{label}</span>}
      <NavPending />
    </Link>
  );
}

/**
 * `isAdmin` chega calculado do servidor (app/(app)/layout.tsx) porque a regra
 * mora em `ADMIN_EMAILS`, que é env de servidor e NÃO pode virar bundle.
 *
 * ⚠️ ESCONDER O ITEM NÃO É CONTROLE DE ACESSO. /admin é protegido no servidor,
 * em cada página (`requireAdminPage`) e cada route handler (`requireAdmin`):
 * quem não está na allowlist toma 403 digitando a URL, com ou sem atalho. Este
 * item é conveniência — o Rafael cansou de digitar /admin na barra de endereço.
 *
 * O default `false` fecha: renderizado sem a prop (teste antigo, uso novo fora
 * da shell), o atalho não aparece.
 */
export default function AppSidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  // Terceiro caso de fallback: a URL existe mas a imagem não carrega (link
  // quebrado, bucket sem permissão). Sem isto o círculo ficaria vazio ou com o
  // ícone de imagem quebrada — pior que a inicial.
  const [photoFailed, setPhotoFailed] = useState(false);
  // Rótulo do plano (Anual/Mensal) derivado da assinatura ativa. Com o plano
  // gratuito removido, a assinatura é a única fonte: não há mais a tabela
  // user_entitlements nem o estado 'free'.
  const [planLabel, setPlanLabel] = useState<string | null>(null);
  const credits = useCreditsStore((s) => s.balance);
  const fetchCredits = useCreditsStore((s) => s.fetch);
  const [collapsed, setCollapsed] = useState(false);
  const signOutAnimation = useNativeHoverAnimation();
  const themeAnimation = useNativeHoverAnimation();

  // No editor (/generator) a sidebar entra colapsada por padrão pra dar espaço
  // ao canvas. Isso NÃO grava no localStorage — a preferência das outras páginas
  // fica intacta e o botão de expandir continua funcionando (colapso efêmero).
  const isGenerator = pathname === '/generator' || pathname.startsWith('/generator/');

  useEffect(() => {
    try {
      if (localStorage.getItem('sidebar_collapsed') === '1') setCollapsed(true);
    } catch { /* localStorage unavailable */ }
  }, []);

  // Ao entrar no editor, força o colapso (sem persistir).
  useEffect(() => {
    if (isGenerator) setCollapsed(true);
  }, [isGenerator]);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      // Só persiste fora do editor, pra não sobrescrever a preferência global.
      if (!isGenerator) {
        try { localStorage.setItem('sidebar_collapsed', next ? '1' : '0'); } catch {}
      }
      return next;
    });
  };

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    supabase.auth.getSession().then(({ data }: { data: { session: { user: { id: string; email?: string; user_metadata?: { name?: string } } } | null } }) => {
      const user = data.session?.user;
      if (!user || !active) return;

      setUserEmail(user.email || '');
      const metaName = user.user_metadata?.name?.trim();
      if (metaName) setUserName(metaName);

      supabase
        .from('profiles')
        .select('name, brand_name, photo_url')
        .eq('id', user.id)
        .single()
        .then(({ data: profile }: { data: { name: string | null; brand_name: string | null; photo_url: string | null } | null }) => {
          if (!active) return;
          const resolved = profile?.name?.trim() || metaName || profile?.brand_name?.trim() || '';
          if (resolved) setUserName(resolved);
          // A coluna tem default '' — string vazia cai na inicial igual a null.
          const photo = profile?.photo_url?.trim() || '';
          setPhotoUrl(photo);
          setPhotoFailed(false);
        });

      supabase
        .from('user_active_subscription')
        .select('plan_interval')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }: { data: { plan_interval: string | null } | null }) => {
          if (active && data?.plan_interval) setPlanLabel(data.plan_interval === 'year' ? 'Anual' : 'Mensal');
        });

      fetchCredits();
    });

    return () => {
      active = false;
    };
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  const initial = (userName || userEmail || '?').trim().charAt(0).toUpperCase();
  /** Foto só aparece com URL preenchida E carregada; caso contrário, inicial. */
  const showPhoto = photoUrl !== '' && !photoFailed;

  // No ESTÚDIO a navegação global sai de cena: o editor é tela cheia de duas
  // colunas, e o que este trilho carregava migrou para dentro dele — logo e
  // "Voltar para Dashboard" no painel do editor, créditos e toggle de tema na
  // barra superior. Depois de TODOS os hooks, nunca antes: o retorno é
  // condicional, a ordem dos hooks não pode ser.
  if (isGenerator) return null;

  return (
    <aside
      className={cn(
        'shrink-0 h-screen flex flex-col border-r relative transition-[width] duration-200 ease-out',
        collapsed ? 'w-[76px]' : 'w-[240px]'
      )}
      style={{
        background: 'var(--paper-2)',
        borderColor: 'var(--line)',
      }}
    >
      {/* Brand */}
      <div
        className={cn(
          'h-24 flex items-center border-b relative',
          collapsed ? 'justify-center px-2' : 'px-5'
        )}
        style={{ borderColor: 'var(--line)' }}
      >
        <Link
          href="/dashboard"
          className={cn('flex items-center group', collapsed ? '' : 'w-full')}
          aria-label="Creatools"
        >
          {collapsed ? (
            <Image
              src="/ICON_SEMFUNDO.png"
              alt="Creatools"
              width={48}
              height={48}
              priority
              className="h-10 w-10 object-contain dark:invert"
            />
          ) : (
            <Image
              src="/LOGO_SEMFUNDO.png"
              alt="Creatools"
              width={268}
              height={80}
              priority
              className="h-20 w-auto object-contain dark:invert"
            />
          )}
        </Link>

        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
          title={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
          className="absolute top-1/2 -translate-y-1/2 -right-3 z-10 grid place-items-center w-6 h-6 rounded-full transition-colors hover:opacity-100 opacity-80"
          style={{
            background: 'var(--paper-2)',
            border: '1.5px solid var(--line-strong, var(--line))',
            color: 'var(--ink-dim)',
          }}
        >
          {collapsed ? (
            <HugeiconsIcon icon={SidebarRight01Icon} className="w-3.5 h-3.5" aria-hidden />
          ) : (
            <HugeiconsIcon icon={SidebarLeft01Icon} className="w-3.5 h-3.5" aria-hidden />
          )}
        </button>
      </div>

      {/* Nav */}
      <nav
        className={cn(
          'flex-1 overflow-y-auto py-5 flex flex-col gap-0.5',
          collapsed ? 'px-2' : 'px-3'
        )}
      >
        {navItems.map((item) => (
          <SidebarNavItem key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
        ))}
      </nav>

      {/* Footer: theme toggle */}
      <div
        className={cn('shrink-0 py-3 border-t', collapsed ? 'px-2' : 'px-3')}
        style={{ borderColor: 'var(--line)' }}
      >
        {/* O badge é a identidade de quem está logado, então aponta para a aba
            "Conta" — não para a de assinatura, que é o item de navegação. */}
        <Link
          href="/configuracoes/conta"
          className={cn(
            'flex items-center mb-2 rounded-[10px] transition-colors hover:border-[var(--ink)]',
            collapsed ? 'justify-center p-1.5' : 'gap-3 px-2 py-2.5'
          )}
          style={{ background: 'var(--paper)', border: '1.5px solid var(--line)' }}
          title={collapsed ? `Conta — ${userName || 'Usuário'}` : 'Ver conta e assinatura'}
        >
          <span
            className="grid place-items-center w-8 h-8 rounded-full shrink-0 overflow-hidden font-semibold text-[13px]"
            style={{
              background: 'var(--ink)',
              color: 'var(--paper)',
            }}
            aria-hidden
          >
            {showPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt=""
                data-testid="sidebar-avatar-photo"
                className="h-full w-full object-cover"
                onError={() => setPhotoFailed(true)}
              />
            ) : (
              initial
            )}
          </span>
          {!collapsed && (
            <div className="flex flex-col min-w-0 leading-tight">
              <span
                className="text-[13px] font-semibold truncate"
                style={{ color: 'var(--ink)' }}
                title={userName || 'Usuário'}
              >
                {userName || 'Usuário'}
              </span>
              <span
                className="text-[11px] truncate"
                style={{ color: 'var(--ink-dim)' }}
                title={userEmail}
              >
                {userEmail || '—'}
              </span>
              {planLabel ? (
                <span className="mt-1.5 flex items-center gap-1.5">
                  <span className="chip filled text-[9px] py-[1px] px-[6px]">{planLabel}</span>
                  {credits !== null && (
                    <span className="font-mono text-[10px]" style={{ color: 'var(--ink-dim)' }}>
                      {credits} créditos
                    </span>
                  )}
                </span>
              ) : null}
            </div>
          )}
        </Link>
        {/* Atalho para o painel — a volta ("Voltar ao produto", em /admin)
            já existia; esta é a ida. Visual do PRODUTO, não do admin: o painel
            tem linguagem própria em app/admin/admin.css e ela não atravessa
            para cá. */}
        {isAdmin && (
          <Link
            href="/admin"
            data-testid="sidebar-admin-link"
            className={cn('brand-btn ghost w-full mb-2', collapsed ? 'justify-center' : 'justify-start')}
            style={{ padding: '9px 12px', color: 'var(--ink-dim)' }}
            title={collapsed ? 'Painel administrativo' : undefined}
            aria-label="Painel administrativo"
          >
             <HugeiconsIcon icon={ShieldCheckIcon} className="w-4 h-4" aria-hidden />
            {!collapsed && <span>Painel admin</span>}
          </Link>
        )}
        <button
          onClick={handleSignOut}
          onMouseEnter={signOutAnimation.onMouseEnter}
          onMouseLeave={signOutAnimation.onMouseLeave}
          className={cn('brand-btn ghost w-full mb-2', collapsed ? 'justify-center' : 'justify-start')}
          style={{ padding: '9px 12px', color: 'var(--ink-dim)' }}
          title={collapsed ? 'Sair' : undefined}
          aria-label="Sair"
        >
           <ArrowLeftOnRectangle ref={signOutAnimation.iconRef} size={16} className="w-4 h-4" aria-hidden />
          {!collapsed && <span>Sair</span>}
        </button>
        <button
          onClick={toggleTheme}
          onMouseEnter={themeAnimation.onMouseEnter}
          onMouseLeave={themeAnimation.onMouseLeave}
          className={cn('brand-btn outline w-full', collapsed ? 'justify-center' : 'justify-between')}
          style={{ padding: '9px 12px' }}
          title={collapsed ? (theme === 'light' ? 'Tema escuro' : 'Tema claro') : undefined}
          aria-label={theme === 'light' ? 'Tema escuro' : 'Tema claro'}
        >
          {collapsed ? (
             theme === 'light' ? (
                <AnimatedMoon ref={themeAnimation.iconRef} size={16} className="w-4 h-4" aria-hidden />
             ) : (
                <AnimatedSun ref={themeAnimation.iconRef} size={16} className="w-4 h-4" aria-hidden />
             )
          ) : (
            <>
              <span className="flex items-center gap-2">
                 {theme === 'light' ? (
                    <AnimatedMoon ref={themeAnimation.iconRef} size={16} className="w-4 h-4" aria-hidden />
                 ) : (
                    <AnimatedSun ref={themeAnimation.iconRef} size={16} className="w-4 h-4" aria-hidden />
                 )}
                <span>{theme === 'light' ? 'Tema escuro' : 'Tema claro'}</span>
              </span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

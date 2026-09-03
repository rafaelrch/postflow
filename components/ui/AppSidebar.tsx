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
  PlusIcon,
  Refresh01Icon,
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
import { useCreditsStore } from '@/hooks/useCreditsStore';
import { toastManager } from '@/components/ui/toast';
import WorkspaceSetupModal, { type WorkspaceSetupData } from '@/components/onboarding/WorkspaceSetupModal';
import { notifyWorkspaceChanged, prepareWorkspaceChange } from '@/lib/workspace-events';
import {
  WorkspaceContent,
  WorkspaceTrigger,
  Workspaces,
  type Workspace,
} from '@/components/ui/workspaces';

interface NavItem {
  href: string;
  label: string;
  icon: IconSvgElement;
  animatedIcon?: AnimatedHeroiconComponent;
  /** Rotas extras que mantêm o item ativo (além do próprio href). */
  match?: string[];
}

type SidebarWorkspace = Workspace & {
  slug: string;
  role: string;
  status: string;
  workspaceStatus?: string;
  avatar_url?: string;
  logo?: string;
};

type WorkspaceListResponse = {
  state?: string;
  activeWorkspace?: { id?: unknown } | null;
  workspaces?: Array<{
    workspaceId?: unknown;
    name?: unknown;
    slug?: unknown;
    avatar_url?: unknown;
    status?: unknown;
    role?: unknown;
    workspaceStatus?: unknown;
  }>;
  error?: unknown;
};

function getWorkspaceError(body: WorkspaceListResponse | { error?: unknown } | null, fallback: string) {
  return typeof body?.error === 'string' && body.error.trim() ? body.error : fallback;
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
  const [workspaces, setWorkspaces] = useState<SidebarWorkspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | undefined>();
  const [workspaceState, setWorkspaceState] = useState<'loading' | 'ready' | 'workspace_required' | 'error'>('loading');
  const [workspaceLoadError, setWorkspaceLoadError] = useState('');
  const [workspaceActionError, setWorkspaceActionError] = useState('');
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState<string | null>(null);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
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

  const loadWorkspaces = async () => {
    setWorkspaceState('loading');
    setWorkspaceLoadError('');
    setWorkspaceActionError('');
    setWorkspaces([]);
    setActiveWorkspaceId(undefined);
    try {
      const response = await fetch('/api/workspaces', {
        headers: { Accept: 'application/json' },
      });
      const body = await response.json().catch(() => null) as WorkspaceListResponse | null;
      if (!response.ok) throw new Error(getWorkspaceError(body, 'Não foi possível carregar os workspaces.'));

      const allowedWorkspaces = (body?.workspaces ?? [])
        .filter((workspace) => workspace.status === 'active' && (workspace.workspaceStatus ?? 'active') === 'active')
        .filter((workspace): workspace is typeof workspace & { workspaceId: string; name: string } =>
          typeof workspace.workspaceId === 'string' && typeof workspace.name === 'string' && workspace.name.trim().length > 0,
        )
        .map((workspace) => ({
          id: workspace.workspaceId,
          name: workspace.name,
          slug: typeof workspace.slug === 'string' ? workspace.slug : '',
          role: typeof workspace.role === 'string' ? workspace.role : 'viewer',
          status: 'active',
          workspaceStatus: 'active',
          logo: typeof workspace.avatar_url === 'string' ? workspace.avatar_url : '',
        }));
      setWorkspaces(allowedWorkspaces);

      const serverActiveId = typeof body?.activeWorkspace?.id === 'string'
        ? body.activeWorkspace.id
        : undefined;
      const resolvedActiveId = allowedWorkspaces.some((workspace) => workspace.id === serverActiveId)
        ? serverActiveId
        : allowedWorkspaces[0]?.id;
      setActiveWorkspaceId(resolvedActiveId);
      setWorkspaceState(allowedWorkspaces.length > 0 ? 'ready' : 'workspace_required');
    } catch (error) {
      setWorkspaceState('error');
      setWorkspaceLoadError(error instanceof Error ? error.message : 'Não foi possível carregar os workspaces.');
    }
  };

  useEffect(() => {
    void loadWorkspaces();
  }, []);

  const handleWorkspaceChange = async (workspace: SidebarWorkspace) => {
    if (switchingWorkspaceId || workspace.id === activeWorkspaceId) return;

    setSwitchingWorkspaceId(workspace.id);
    setWorkspaceActionError('');
    try {
      if (!(await prepareWorkspaceChange(workspace.id))) {
        throw new Error('Salve as alterações antes de trocar de workspace.');
      }
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspace.id)}/switch`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      const body = await response.json().catch(() => null) as { workspaceId?: unknown; error?: unknown } | null;
      if (!response.ok || body?.workspaceId !== workspace.id) {
        throw new Error(getWorkspaceError(body, 'Não foi possível trocar o workspace.'));
      }
      setActiveWorkspaceId(workspace.id);
      setWorkspaceState('ready');
      await notifyWorkspaceChanged(workspace.id);
      router.refresh();
    } catch (error) {
      setWorkspaceActionError(error instanceof Error ? error.message : 'Não foi possível trocar o workspace.');
    } finally {
      setSwitchingWorkspaceId(null);
    }
  };

  const handleCreateWorkspace = async (setup: WorkspaceSetupData) => {
    if (creatingWorkspace) return;
    const name = setup.name.trim();
    setCreatingWorkspace(true);
    setWorkspaceActionError('');
    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(setup),
      });
      const body = await response.json().catch(() => null) as { workspace?: { id?: unknown; name?: unknown; slug?: unknown; avatar_url?: unknown }; error?: unknown } | null;
      const created = body?.workspace;
      if (!response.ok || typeof created?.id !== 'string' || typeof created.name !== 'string') {
        throw new Error(getWorkspaceError(body, 'Não foi possível criar o workspace.'));
      }

      const createdWorkspace: SidebarWorkspace = {
        id: created.id,
        name: created.name,
        slug: typeof created.slug === 'string' ? created.slug : '',
        role: 'owner',
        status: 'active',
        workspaceStatus: 'active',
        avatar_url: typeof created.avatar_url === 'string' ? created.avatar_url : '',
        logo: typeof created.avatar_url === 'string' ? created.avatar_url : '',
      };
      setWorkspaces((current) => [...current.filter((workspace) => workspace.id !== createdWorkspace.id), createdWorkspace]);

      const switchResponse = await fetch(`/api/workspaces/${encodeURIComponent(createdWorkspace.id)}/switch`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      const switchBody = await switchResponse.json().catch(() => null) as { workspaceId?: unknown; error?: unknown } | null;
      if (!switchResponse.ok || switchBody?.workspaceId !== createdWorkspace.id) {
        throw new Error('Workspace criado, mas não foi possível ativá-lo.');
      }

      setActiveWorkspaceId(createdWorkspace.id);
      setWorkspaceState('ready');
      setCreateWorkspaceOpen(false);
      await notifyWorkspaceChanged(createdWorkspace.id);
      router.refresh();
    } catch (error) {
      setWorkspaceActionError(error instanceof Error ? error.message : 'Não foi possível criar o workspace.');
    } finally {
      setCreatingWorkspace(false);
    }
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
    const signOut = supabase.auth.signOut();

    try {
      await toastManager.promise(signOut, {
        loading: {
          title: 'Saindo...',
          description: 'Encerrando sua sessão.',
        },
        success: {
          title: 'Sessão encerrada',
          description: 'Até logo!',
        },
        error: (error) => ({
          title: 'Não foi possível sair',
          description: error instanceof Error ? error.message : 'Tente novamente.',
        }),
      });
    } catch {
      // O toast informa o erro; sem sucesso, a sessão permanece nesta tela.
    }
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

      {/* Workspace */}
      <div
        className={cn('shrink-0 border-b py-3', collapsed ? 'px-2' : 'px-3')}
        style={{ borderColor: 'var(--line)' }}
      >
        {workspaceState === 'loading' ? (
          <div data-testid="workspace-loading" className="text-muted-foreground px-3 py-2 text-sm">
            Carregando workspaces...
          </div>
        ) : workspaces.length > 0 ? (
          <Workspaces
            workspaces={workspaces}
            selectedWorkspaceId={activeWorkspaceId}
            onWorkspaceChange={handleWorkspaceChange}
          >
            <WorkspaceTrigger
              data-testid="workspace-switcher-trigger"
              disabled={Boolean(switchingWorkspaceId)}
            />
            <WorkspaceContent>
              <button
                type="button"
                data-testid="workspace-create-action"
                onClick={() => {
                  setWorkspaceActionError('');
                  setCreateWorkspaceOpen(true);
                }}
                className="text-muted-foreground flex w-full items-center justify-start gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <HugeiconsIcon icon={PlusIcon} className="h-5 w-5" aria-hidden />
                Criar workspace
              </button>
            </WorkspaceContent>
          </Workspaces>
        ) : (
          <button
            type="button"
            data-testid="workspace-switcher-trigger"
            onClick={() => {
              setWorkspaceActionError('');
              setCreateWorkspaceOpen(true);
            }}
            className="text-muted-foreground flex h-12 w-full items-center justify-start rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            Criar workspace
          </button>
        )}
        {workspaceLoadError ? (
          <div className="mt-2 flex items-center gap-2 text-xs text-[var(--danger)]" data-testid="workspace-error" role="alert">
            <span className="min-w-0 flex-1">Não foi possível carregar os workspaces.</span>
            <button
              type="button"
              data-testid="workspace-retry"
              onClick={() => void loadWorkspaces()}
              className="shrink-0 rounded-[var(--radius-sm)] p-1 hover:bg-[var(--accent-soft)]"
              aria-label="Tentar carregar workspaces novamente"
              title="Tentar novamente"
            >
              <HugeiconsIcon icon={Refresh01Icon} className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ) : null}
        {workspaceActionError && !createWorkspaceOpen ? (
          <p className="mt-2 text-xs text-[var(--danger)]" data-testid="workspace-action-error" role="alert">
            {workspaceActionError}
          </p>
        ) : null}
      </div>

      <WorkspaceSetupModal
        open={createWorkspaceOpen}
        loading={creatingWorkspace}
        error={workspaceActionError}
        onClose={() => {
          if (!creatingWorkspace) setCreateWorkspaceOpen(false);
        }}
        onSubmit={handleCreateWorkspace}
      />

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

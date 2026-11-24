import { lazy, Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useResolvedRouteTitle } from '@/hooks/usePageTitle';
import { Menu, UserCircle, LogOut, ArrowLeft } from 'lucide-react';
// UserCircle continua importado porque o MobileTabletHeader (tablet >=lg) ainda
// usa o atalho pro perfil. No DesktopSidebarHeader o avatar/perfil vive dentro
// do dropdown do sidebar, então o botão duplicado foi removido (v1.9.22 polish).
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { localizeAppPath, resolveAppSlug } from '@/lib/i18n/appRouteSlugs';
import { useNavigationPreference } from '@/hooks/useNavigationPreference';
import { useNavThemePreference } from '@/hooks/useNavThemePreference';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useLogoInk } from '@/hooks/useLogoInk';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useIsMobile } from '@/hooks/use-mobile';
import { AppViewport } from './AppViewport';
import { AppRouteTransition } from './AppRouteTransition';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useCanonicalAppRoute } from '@/hooks/useCanonicalAppRoute';
import { Sidebar } from './Sidebar';
import { TopNavbar } from './TopNavbar';
import { MobileSidebar } from './MobileSidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { SystemFooter } from './SystemFooter';
import { VersionUpdateNotification } from '@/components/pwa/VersionUpdateNotification';
import { NotificationsBell } from '@/components/notifications/NotificationsBell';
import { PushActivationInvite } from '@/components/notifications/PushActivationInvite';
import { AdminNotificationBell } from '@/components/admin/AdminNotificationBell';
import { AppLanguageSwitcher } from '@/components/i18n/AppLanguageSwitcher';
import { HeaderClock } from '@/components/layout/HeaderClock';
import { SystemNoticeBanners } from '@/components/notices/SystemNoticeBanners';
import { PlatformNpsSurvey } from '@/components/nps/PlatformNpsSurvey';
import { SubscriptionRenewalBanner } from '@/components/billing/SubscriptionRenewalBanner';
import { TasksDrawer } from '@/components/tasks/TasksDrawer';
import { DailyTasksPopup } from '@/components/tasks/DailyTasksPopup';
import { DomiflixLearningReminder } from '@/components/domiflix/DomiflixLearningReminder';
import { OVERLAY_PRIORITY, useOverlaySlot } from '@/contexts/OverlayCoordinatorContext';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import logoDark from '@/assets/logo-dark.png';
import logoGreen from '@/assets/logo-horizontal-verde.png';
import { getContrastingLogoSurfaceTone } from '@/utils/logoInk';
import { PageRecoveryBoundary } from '@/components/errors/PageRecoveryBoundary';

const DomiflixIntroGate = lazy(() => import('@/components/domiflix/DomiflixIntroGate').then((module) => ({ default: module.DomiflixIntroGate })));

const TABLET_MAX_WIDTH = 1280; // tablet vai até 1279px; ≥1280 é desktop.

function DomiflixIntroGateFallback() {
  const isActiveOverlay = useOverlaySlot(true, {
    id: 'domiflix-intro-loading',
    priority: OVERLAY_PRIORITY.critical,
  });

  return isActiveOverlay
    ? <div className="fixed inset-0 z-[10000] bg-[#111]" aria-label="Carregando tutorial inicial" />
    : null;
}

/**
 * `AppLayout` — shell de navegação principal do Dominex.
 *
 * Decisão de qual shell renderizar:
 * - Admin (super_admin + vendedores Auctus) → sempre Sidebar + light mode forçado.
 * - Mobile (<1024px) → header simples com logo + MobileBottomNav fixo no rodapé.
 * - Tablet (1024-1279px) → header com botão Menu (abre MobileSidebar em Sheet)
 *   + MobileBottomNav visível.
 * - Desktop (≥1280px) → Sidebar OU TopNavbar conforme `useNavigationPreference`.
 *
 * Mantém:
 * - `VersionUpdateNotification` (PWA update banner).
 * - `useKeyboardShortcuts(true)` (atalhos globais).
 * - Lógica de `isAdminUser` forçando light mode (preservada do layout antigo).
 * - `useWhiteLabel` (logo + cores).
 * - `SystemFooter` no desktop, abaixo do `<main />`.
 */
export function AppLayout() {
  const { navigationStyle } = useNavigationPreference();
  // Menu escuro por padrão (Fase 2). Mantém `data-nav-theme` no <html> em sync
  // com a preferência do usuário (localStorage) enquanto o shell está montado.
  useNavThemePreference();
  const { isAdminUser, user, profile } = useAuth();
  const isMobile = useIsMobile();
  const [isTablet, setIsTablet] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= 1024 && window.innerWidth < TABLET_MAX_WIDTH;
  });

  // Estado compartilhado do drawer de tarefas — permite que o DailyTasksPopup
  // abra o drawer via callback sem precisar de context/portais extras.
  const [tasksDrawerOpen, setTasksDrawerOpen] = useState(false);

  useKeyboardShortcuts(true);
  // Canoniza a URL da tela pro slug do idioma do usuário (bookmark de outro
  // idioma redireciona; troca de idioma re-mapeia). Só age em rotas do registro.
  useCanonicalAppRoute();

  // Restyle sóbrio ESCOPADO AO APP (Fase 1). Liga o atributo `data-app` no <html>
  // enquanto o shell logado está montado. O bloco `[data-app] { … }` do index.css
  // re-declara os tokens sóbrios (CTA preto, cantos retos) SÓ aqui — a landing
  // pública fica intacta (verde/arredondada). Cobre também os portais Radix, que
  // renderizam no body mas herdam as vars do <html>.
  useEffect(() => {
    document.documentElement.setAttribute('data-app', '');
    return () => document.documentElement.removeAttribute('data-app');
  }, []);

  // Tablet = 1024 ≤ w < 1280. Mobile já é coberto por `useIsMobile`.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => {
      setIsTablet(window.innerWidth >= 1024 && window.innerWidth < TABLET_MAX_WIDTH);
    };
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Admin sempre light mode + sidebar — regra preservada do AppLayout antigo.
  useEffect(() => {
    if (isAdminUser) {
      document.documentElement.classList.remove('dark');
    }
  }, [isAdminUser]);

  const forceSidebar = isAdminUser;
  const useTopbar = !forceSidebar && navigationStyle === 'topbar';

  // Mobile (<1024) e tablet (1024-1279) compartilham o shell mobile/tablet.
  const isCompactViewport = isMobile || isTablet;

  return (
    <>
      {!isAdminUser && user && <Suspense fallback={<DomiflixIntroGateFallback />}><DomiflixIntroGate /></Suspense>}
      {!isAdminUser && user && <PlatformNpsSurvey />}
      <VersionUpdateNotification />
      {!isAdminUser && user && <PushActivationInvite />}
      {/* Popup diário de tarefas (1x/dia, BRT). Só para usuários não-admin. */}
      {!isAdminUser && user && (
        <DailyTasksPopup
          userId={user.id}
          onOpenDrawer={() => setTasksDrawerOpen(true)}
        />
      )}
      {/* O TasksDrawer é renderizado uma única vez no AppLayout e controlado via
          estado compartilhado — o trigger visível nos headers reaproveita o mesmo
          componente. O drawer em si vive aqui para não duplicar. */}
      {!isAdminUser && (
        <TasksDrawer
          open={tasksDrawerOpen}
          onOpenChange={setTasksDrawerOpen}
        />
      )}
      <ResponsiveAppShell
        isCompactViewport={isCompactViewport}
        useTopbar={useTopbar}
        isAdminUser={isAdminUser}
        ownerKey={`${user?.id ?? 'anonymous'}:${profile?.company_id ?? 'no-company'}`}
      />
    </>
  );
}

// ============================================================
// Wrapper de transição entre rotas — fade-in suave + scroll-to-top
// ============================================================
function LayoutSystemFooter({ mobile = false }: { mobile?: boolean }) {
  const { pathname } = useLocation();
  // O posto de venda usa a altura para itens e recebimento; as demais telas
  // mantêm o rodapé institucional do app.
  if (resolveAppSlug(pathname) === 'pdvSale') return null;
  return mobile ? <div className="mt-6 pb-2"><SystemFooter /></div> : (
    <footer className="h-[52px] shrink-0 border-t px-4 flex items-center justify-center"><SystemFooter /></footer>
  );
}

/**
 * Header fixo do desktop sidebar shell.
 *
 * Antes desta Onda UI-3 o desktop sidebar ia direto pro `<main>`, sem um
 * header próprio — o sino de notificações só aparecia no `TopbarShell` e nos
 * shells mobile/tablet. CEO pediu (2026-05-23) que o sino seja visível em
 * **todo** desktop, espelhando o pattern do EcoSistema.
 *
 * Layout (altura ~64px):
 * - Esquerda: `SidebarTrigger` (colapsa/expande sidebar).
 * - Direita: `NotificationsBell` + Perfil + Sair (com tooltips). O dropdown
 *   completo de conta continua dentro do Sidebar; aqui só os atalhos rápidos.
 */
function DesktopSidebarHeader() {
  const navigate = useNavigate();
  const { user, isAdminUser, signOut } = useAuth();
  const { settings } = useCompanySettings();
  const { locale } = useAppLocaleContext();
  const accountT = MESSAGES[locale].app.shell.account;

  if (!user) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background px-4 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <SidebarTrigger className="h-9 w-9" />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <HeaderClock />
          {/* Seletor de idioma pessoal — SÓ no header desktop (no mobile a troca
              fica em Configurações → Regional). */}
          <AppLanguageSwitcher />
          <NotificationsBell />

          {/* Botão de perfil removido — já existe no avatar do sidebar (dropdown).
              Evita duplicidade visual no header desktop. */}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-destructive hover:bg-destructive hover:text-white"
                onClick={signOut}
                aria-label={accountT.logout}
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{accountT.logout}</TooltipContent>
          </Tooltip>
        </div>
      </header>
    </TooltipProvider>
  );
}

// O conteúdo permanece montado ao alternar tamanho de tela ou estilo de menu.
function ResponsiveAppShell({ isCompactViewport, useTopbar, isAdminUser, ownerKey }: {
  isCompactViewport: boolean; useTopbar: boolean; isAdminUser: boolean; ownerKey: string;
}) {
  const location = useLocation();
  const { locale } = useAppLocaleContext();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { setScrolled(false); }, [location.pathname, isCompactViewport]);

  const handleRefresh = async () => {
    if (document.querySelector('[data-state="open"]')) return;
    // O gesto explícito continua tendo o efeito de F5; só a troca visual de
    // shell deixa de remontar a tela e perder formulários em andamento.
    window.location.reload();
  };
  const mode = isCompactViewport ? 'compact' : useTopbar ? 'topbar' : 'sidebar';
  const homePath = isAdminUser
    ? '/admin/empresas'
    : localizeAppPath('/dashboard', locale);
  return <AppViewport
    mode={mode}
    sidebar={<Sidebar />}
    header={isCompactViewport ? <MobileTabletHeader isAdminUser={isAdminUser} scrolled={scrolled} /> : useTopbar ? <TopNavbar /> : <DesktopSidebarHeader />}
    subscriptionNotice={<SubscriptionRenewalBanner />}
    notices={<><DomiflixLearningReminder /><SystemNoticeBanners scope="global" /></>}
    desktopFooter={<LayoutSystemFooter />}
    mobileFooter={<LayoutSystemFooter mobile />}
    bottomNavigation={<MobileBottomNav />}
    onRefresh={handleRefresh}
    onScroll={event => setScrolled(event.currentTarget.scrollTop > 48)}
    scrollResetKey={`${ownerKey}:${location.pathname}`}
  >
    <AppRouteTransition ownerKey={ownerKey}>
      <PageRecoveryBoundary
        homePath={homePath}
        resetKey={`${ownerKey}:${location.pathname}`}
      >
        <Outlet />
      </PageRecoveryBoundary>
    </AppRouteTransition>
  </AppViewport>;
}

function MobileTabletHeader({ isAdminUser, scrolled }: { isAdminUser: boolean; scrolled: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { logoUrl, enabled: whiteLabelEnabled, isLoading: logoLoading } = useWhiteLabel();
  const logoInk = useLogoInk(!isAdminUser && whiteLabelEnabled ? logoUrl : null);
  const logoSurfaceTone = !isAdminUser && whiteLabelEnabled && logoUrl
    ? getContrastingLogoSurfaceTone(logoInk) ?? undefined
    : undefined;
  const { locale } = useAppLocaleContext();
  const accountT = MESSAGES[locale].app.shell.account;
  const [sheetOpen, setSheetOpen] = useState(false);
  const routeTitle = useResolvedRouteTitle();

  // Fecha o sheet ao mudar de rota.
  useEffect(() => {
    setSheetOpen(false);
  }, [location.pathname]);

  const adminTarget = isAdminUser ? '/admin/empresas' : localizeAppPath('/dashboard', locale);
  // Esconde back na home (não tem pra onde voltar) e em rotas técnico (fluxo próprio).
  const homePaths = [localizeAppPath('/dashboard', locale), '/admin/empresas'];
  const showBackButton =
    !homePaths.includes(location.pathname) &&
    !location.pathname.startsWith('/os-tecnico/') &&
    window.history.length > 1;

  // Cross-fade logo ↔ título: só troca quando há título mapeado E já rolou.
  // Rotas sem título (ex.: /clientes/123) mantêm o logo sempre visível.
  const showTitleSwap = scrolled && routeTitle !== '';

  // O tablet (≥lg) tem botão Menu visível. Mobile usa só o bottom nav.
  // (lg breakpoint do tailwind = 1024px, mesmo do MOBILE_BREAKPOINT.)
  return (
    <header
      data-tenant-logo-surface={logoSurfaceTone}
      className="tenant-logo-surface sticky top-0 z-10 flex items-center justify-between border-b bg-background px-4 py-3 transition-colors duration-300"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      {/* Lado esquerdo: back arrow no mobile, Menu hamburger no tablet+ */}
      <div className="flex items-center gap-2 min-w-10">
        {showBackButton && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 lg:hidden"
            onClick={() => navigate(-1)}
            aria-label={accountT.backAria}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 hidden lg:flex">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" data-nav-surface className="w-72 p-0 bg-background">
            <MobileSidebar />
          </SheetContent>
        </Sheet>
      </div>

      {/* Miolo central: cross-fade LOGO ↔ TÍTULO ao rolar (iOS large-title colapsável).
          LOGO e TÍTULO ficam no mesmo ponto — o título é absolute sobre o container do logo.
          Quando a rota não tem título mapeado (routeTitle === ''), o logo permanece sempre
          visível e o span do título fica vazio/oculto para não engolir a logo num void. */}
      <div className="flex-1 flex justify-center">
        <div className="relative flex items-center justify-center">
          {/* LOGO — fluxo normal, visível parado no topo */}
          <div
            className={cn(
              'flex items-center justify-center transition-opacity duration-200',
              showTitleSwap ? 'opacity-0' : 'opacity-100',
            )}
          >
            {logoLoading ? (
              <div className="h-10 w-32 rounded bg-muted animate-pulse" />
            ) : (
              <>
                {/* Tema via CSS (dark:hidden / hidden dark:block): sempre correto e sem
                    depender de re-render. Em tema claro o logo-dark (texto escuro) fica
                    visível; em escuro, o verde (texto branco). logoUrl (white-label) cobre ambos. */}
                <img
                  src={logoUrl || logoDark}
                  alt="Dominex"
                  className="h-10 w-auto max-h-[44px] cursor-pointer object-contain dark:hidden"
                  onClick={() => navigate(adminTarget)}
                />
                <img
                  src={logoUrl || logoGreen}
                  alt="Dominex"
                  className="h-10 w-auto max-h-[44px] cursor-pointer object-contain hidden dark:block"
                  onClick={() => navigate(adminTarget)}
                />
              </>
            )}
          </div>

          {/* TÍTULO — overlay absoluto centralizado, visível ao rolar.
              pointer-events-none para não bloquear cliques na logo abaixo. */}
          <span
            className={cn(
              'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-bold text-lg tracking-tight text-foreground transition-all duration-200 pointer-events-none',
              showTitleSwap
                ? 'opacity-100'
                : 'opacity-0 translate-y-[calc(-50%+0.25rem)]',
            )}
          >
            {routeTitle}
          </span>
        </div>
      </div>

      {/* Lado direito: sino sempre visível (mobile/tablet/desktop); atalhos extras só em tablet+ */}
      <div className="flex items-center gap-1 justify-end">
        {user && (
          <>
            {isAdminUser ? <AdminNotificationBell /> : <NotificationsBell />}
            {/* Atalhos compactos só em tablet: no mobile (<lg) o bottom nav é o caminho. */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hidden lg:flex"
              onClick={() => navigate(isAdminUser ? '/admin/configuracoes' : localizeAppPath('/perfil', locale))}
              title={isAdminUser ? accountT.adminSettings : accountT.myProfile}
            >
              <UserCircle className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hidden lg:flex text-destructive hover:bg-destructive hover:text-white"
              onClick={signOut}
              title={accountT.logout}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </header>
  );
}

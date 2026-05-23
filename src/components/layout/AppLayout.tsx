import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Menu, UserCircle, LogOut, ArrowLeft } from 'lucide-react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigationPreference } from '@/hooks/useNavigationPreference';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobilePullToRefresh } from '@/components/mobile/MobilePullToRefresh';
import { useQueryClient } from '@tanstack/react-query';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { Sidebar } from './Sidebar';
import { TopNavbar } from './TopNavbar';
import { MobileSidebar } from './MobileSidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { SystemFooter } from './SystemFooter';
import { VersionUpdateNotification } from '@/components/pwa/VersionUpdateNotification';
import { NotificationsBell } from '@/components/notifications/NotificationsBell';
import logoDark from '@/assets/logo-dark.png';
import logoGreen from '@/assets/logo-horizontal-verde.png';

const TABLET_MAX_WIDTH = 1280; // tablet vai até 1279px; ≥1280 é desktop.

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
  const { isAdminUser } = useAuth();
  const isMobile = useIsMobile();
  const [isTablet, setIsTablet] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= 1024 && window.innerWidth < TABLET_MAX_WIDTH;
  });

  useKeyboardShortcuts(true);

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
      <VersionUpdateNotification />
      {isCompactViewport ? (
        <MobileTabletShell isAdminUser={isAdminUser} />
      ) : useTopbar ? (
        <TopbarShell />
      ) : (
        <SidebarShell />
      )}
    </>
  );
}

// ============================================================
// Wrapper de transição entre rotas — fade-in suave + scroll-to-top
// ============================================================
function RouteTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  // Scroll-to-top em qualquer container scrollável quando muda de rota
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
    document.querySelectorAll('main, [data-scroll-container]').forEach((el) => {
      (el as HTMLElement).scrollTop = 0;
    });
  }, [location.pathname]);

  return (
    <div key={location.pathname} className="animate-in fade-in duration-200 min-w-0 max-w-full">
      {children}
    </div>
  );
}

// ============================================================
// SHELL: desktop sidebar (modo padrão)
// ============================================================
function SidebarShell() {
  return (
    <SidebarProvider>
      <div className="flex h-[100dvh] w-full max-w-full">
        <Sidebar />
        <SidebarInset className="flex flex-col min-w-0 max-w-full overflow-hidden">
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 min-w-0 max-w-full">
            <RouteTransition>
              <Outlet />
            </RouteTransition>
          </main>
          <footer className="border-t px-4 h-[52px] flex-shrink-0 flex items-center justify-center">
            <SystemFooter />
          </footer>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

// ============================================================
// SHELL: desktop topbar (modo alternativo)
// ============================================================
function TopbarShell() {
  return (
    <div className="flex min-h-screen w-full max-w-full flex-col min-w-0">
      <TopNavbar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 min-w-0 max-w-full">
        <RouteTransition>
          <Outlet />
        </RouteTransition>
      </main>
      <footer className="border-t px-4 h-[52px] flex items-center justify-center">
        <SystemFooter />
      </footer>
    </div>
  );
}

// ============================================================
// SHELL: mobile/tablet (header simples + MobileBottomNav + pull-to-refresh)
// ============================================================
function MobileTabletShell({ isAdminUser }: { isAdminUser: boolean }) {
  const queryClient = useQueryClient();
  const handleRefresh = async () => {
    // Aguarda refetch real das queries ativas (não só invalida silenciosamente).
    await queryClient.refetchQueries({ type: 'active' });
  };

  return (
    <div className="flex h-[100dvh] w-full max-w-full flex-col">
      <MobileTabletHeader isAdminUser={isAdminUser} />
      <MobilePullToRefresh
        onRefresh={handleRefresh}
        className="flex-1 overflow-x-hidden min-w-0 max-w-full"
      >
        <main className="p-4 pb-28">
          <RouteTransition>
            <Outlet />
          </RouteTransition>
          <div className="mt-6 pb-2">
            <SystemFooter />
          </div>
        </main>
      </MobilePullToRefresh>
      <MobileBottomNav />
    </div>
  );
}

function MobileTabletHeader({ isAdminUser }: { isAdminUser: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { logoUrl, isLoading: logoLoading } = useWhiteLabel();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Fecha o sheet ao mudar de rota.
  useEffect(() => {
    setSheetOpen(false);
  }, [location.pathname]);

  const adminTarget = isAdminUser ? '/admin/dashboard' : '/dashboard';
  // Esconde back na home (não tem pra onde voltar) e em rotas técnico (fluxo próprio).
  const homePaths = ['/dashboard', '/admin/dashboard'];
  const showBackButton =
    !homePaths.includes(location.pathname) &&
    !location.pathname.startsWith('/os-tecnico/') &&
    window.history.length > 1;

  // O tablet (≥lg) tem botão Menu visível. Mobile usa só o bottom nav.
  // (lg breakpoint do tailwind = 1024px, mesmo do MOBILE_BREAKPOINT.)
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-background px-4">
      {/* Lado esquerdo: back arrow no mobile, Menu hamburger no tablet+ */}
      <div className="flex items-center gap-2 min-w-10">
        {showBackButton && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 lg:hidden"
            onClick={() => navigate(-1)}
            aria-label="Voltar"
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
          <SheetContent side="left" className="w-72 p-0 bg-background">
            <MobileSidebar />
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex-1 flex justify-center">
        {logoLoading ? (
          <div className="h-10 w-32 rounded bg-muted animate-pulse" />
        ) : (
          <img
            src={logoUrl || (document.documentElement.classList.contains('dark') ? logoGreen : logoDark)}
            alt="Dominex"
            className="h-10 w-auto max-h-[44px] cursor-pointer object-contain"
            onClick={() => navigate(adminTarget)}
          />
        )}
      </div>

      {/* Lado direito: sino sempre visível (mobile/tablet/desktop); atalhos extras só em tablet+ */}
      <div className="flex items-center gap-1 justify-end">
        {user && (
          <>
            <NotificationsBell />
            {/* Atalhos compactos só em tablet: no mobile (<lg) o bottom nav é o caminho. */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hidden lg:flex"
              onClick={() => navigate(isAdminUser ? '/admin/configuracoes' : '/perfil')}
              title={isAdminUser ? 'Configurações do Admin' : 'Meu Perfil'}
            >
              <UserCircle className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hidden lg:flex text-destructive hover:bg-destructive hover:text-white"
              onClick={signOut}
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </header>
  );
}

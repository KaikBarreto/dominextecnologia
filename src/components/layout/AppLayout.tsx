import { SidebarProvider, SidebarInset, useSidebar } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { TopbarLayout } from './TopbarLayout';
import { SystemFooter } from './SystemFooter';
import { Outlet, useNavigate } from 'react-router-dom';
import { PanelLeftClose, PanelLeft, Menu, UserCircle, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { Button } from '@/components/ui/button';
import { useNavigationPreference } from '@/hooks/useNavigationPreference';
import { useIsMobile } from '@/hooks/use-mobile';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import logoDark from '@/assets/logo-dark.png';
import logoGreen from '@/assets/logo-horizontal-verde.png';
import { VersionUpdateNotification } from '@/components/pwa/VersionUpdateNotification';

function HeaderContent() {
  const { roles } = useAuth();
  const { toggleSidebar, isMobile, state } = useSidebar();
  const { isLoading: logoLoading } = useWhiteLabel();
  const navigate = useNavigate();
  const isSuperAdmin = roles.includes('super_admin');
  const adminTarget = isSuperAdmin ? '/admin/dashboard' : '/dashboard';

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background px-4">
      {/* Left: sidebar toggle */}
      <div className="flex items-center gap-2 w-10">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleSidebar}>
          {isMobile ? (
            <Menu className="h-5 w-5" />
          ) : state === 'expanded' ? (
            <PanelLeftClose className="h-5 w-5" />
          ) : (
            <PanelLeft className="h-5 w-5" />
          )}
        </Button>
      </div>

      {/* Center: logo (mobile only) */}
      {isMobile && (
        <div className="flex-1 flex justify-center">
          {logoLoading ? (
            <div className="h-6 w-24 rounded bg-muted animate-pulse" />
          ) : (
            <img src={document.documentElement.classList.contains('dark') ? logoGreen : logoDark} alt="Dominex" className="h-6 w-auto cursor-pointer" onClick={() => navigate(adminTarget)} />
          )}
        </div>
      )}

      {/* Right: empty spacer to balance layout */}
      <div className="w-10" />
    </header>
  );
}

function SidebarAppLayout() {
  return (
    <SidebarProvider>
      <div className="flex h-[100dvh] w-full max-w-full">
        <AppSidebar />
        <SidebarInset className="flex flex-col min-w-0 max-w-full overflow-hidden">
          <HeaderContent />
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 min-w-0 max-w-full">
            <div className="min-w-0 max-w-full">
              <Outlet />
            </div>
          </main>
          <footer className="border-t px-4 h-[52px] flex-shrink-0 flex items-center justify-center">
            <SystemFooter />
          </footer>
          {/* Spacer for fixed MobileNav */}
          <div className="h-[52px] flex-shrink-0 md:hidden" />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function TopbarAppLayout() {
  const { user, signOut, roles } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { isLoading: logoLoading } = useWhiteLabel();
  const isSuperAdmin = roles.includes('super_admin');
  const adminTarget = isSuperAdmin ? '/admin/dashboard' : '/dashboard';

  // On mobile, fallback to sidebar layout
  if (isMobile) {
    return <SidebarAppLayout />;
  }

  return (
    <div className="flex min-h-screen w-full max-w-full flex-col min-w-0">
      <TopbarLayout />
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background px-4 lg:hidden">
        {logoLoading ? (
          <div className="h-6 w-24 rounded bg-muted animate-pulse" />
        ) : (
          <img src={logoDark} alt="Dominex" className="h-6 w-auto cursor-pointer" onClick={() => navigate(adminTarget)} />
        )}
        <div className="flex items-center gap-1">
          {user && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => navigate(isSuperAdmin ? '/admin/configuracoes' : '/perfil')}
                title={isSuperAdmin ? 'Configurações do Admin' : 'Meu Perfil'}
              >
                <UserCircle className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive hover:text-white" onClick={signOut} title="Sair">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </header>
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 min-w-0 max-w-full">
        <div className="min-w-0 max-w-full">
          <Outlet />
        </div>
      </main>
      <footer className="border-t px-4 h-[52px] flex items-center justify-center">
        <SystemFooter />
      </footer>
    </div>
  );
}

export function AppLayout() {
  const { navigationStyle } = useNavigationPreference();
  const { roles } = useAuth();
  const isSuperAdmin = roles.includes('super_admin');
  useKeyboardShortcuts(true);

  return (
    <>
      <VersionUpdateNotification />
      {isSuperAdmin ? <SidebarAppLayout /> : navigationStyle === 'topbar' ? <TopbarAppLayout /> : <SidebarAppLayout />}
    </>
  );
}

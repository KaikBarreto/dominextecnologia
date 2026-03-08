import { SidebarProvider, SidebarInset, useSidebar } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { SystemFooter } from './SystemFooter';
import { Outlet, useNavigate } from 'react-router-dom';
import { Snowflake, LogOut, Menu, UserCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

function HeaderContent() {
  const { user, signOut } = useAuth();
  const { toggleSidebar, isMobile } = useSidebar();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-2">
        {isMobile && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleSidebar}>
            <Menu className="h-5 w-5" />
          </Button>
        )}
        {isMobile && (
          <div className="flex items-center gap-2">
            <Snowflake className="h-5 w-5 text-primary" />
            <span className="font-semibold">Sistema</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        {user && (
          <>
            <span className="text-sm text-muted-foreground hidden sm:inline mr-1">{user.email}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => navigate('/perfil')}
              title="Meu Perfil"
            >
              <UserCircle className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:bg-destructive hover:text-white"
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

export function AppLayout() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <SidebarInset className="flex flex-col">
          <HeaderContent />
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <Outlet />
          </main>
          <footer className="border-t px-4 h-[52px] flex items-center justify-center">
            <SystemFooter />
          </footer>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

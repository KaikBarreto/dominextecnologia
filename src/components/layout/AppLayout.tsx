import { SidebarProvider, SidebarInset, useSidebar } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { SystemFooter } from './SystemFooter';
import { Outlet } from 'react-router-dom';
import { Snowflake, LogOut, Menu } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

function HeaderContent() {
  const { profile, signOut } = useAuth();
  const { toggleSidebar, isMobile } = useSidebar();

  const initials = profile?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

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
            <span className="font-semibold">Glacial Cold</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {profile && (
          <>
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={profile.avatar_url || undefined} alt={profile.full_name} />
                <AvatarFallback className="bg-primary text-white text-xs font-bold">{initials}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium hidden sm:inline">{profile.full_name}</span>
            </div>
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
          <footer className="border-t px-4 py-3">
            <SystemFooter />
          </footer>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

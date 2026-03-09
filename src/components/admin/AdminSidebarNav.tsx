import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  Building2,
  LayoutDashboard,
  CreditCard,
  Wallet,
  Settings,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import logoWhiteHorizontal from '@/assets/logo-white-horizontal.png';
import logoHorizontalVerde from '@/assets/logo-horizontal-verde.png';

const ADMIN_MENU_ITEMS = [
  { label: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Empresas', path: '/admin/empresas', icon: Building2 },
  { label: 'Assinaturas', path: '/admin/assinaturas', icon: CreditCard },
  { label: 'Financeiro', path: '/admin/financeiro', icon: Wallet },
  { label: 'Configurações', path: '/configuracoes', icon: Settings },
];

export function AdminSidebarNav() {
  const { profile } = useAuth();

  const initials = profile?.full_name
    ?.split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

  return (
    <div className="flex h-full flex-col bg-background border-r border-border">
      {/* Logo */}
      <div className="h-14 flex items-center justify-center border-b border-border bg-white dark:bg-sidebar">
        <img src={logoHorizontalVerde} alt="Logo" className="h-8 w-auto hidden dark:block" />
        <img src={logoWhiteHorizontal} alt="Logo" className="h-8 w-auto dark:hidden" />
      </div>

      {/* Admin label */}
      <div className="flex items-center justify-center py-2 border-b border-border">
        <span className="text-xs font-semibold text-destructive">Painel Administrativo</span>
      </div>

      {/* Profile */}
      <div className="p-4 pb-3 border-b border-border">
        {profile ? (
          <div className="flex items-center gap-3">
            <Avatar className="h-11 w-11 shrink-0">
              <AvatarImage src={profile.avatar_url || undefined} alt={profile.full_name} />
              <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-sidebar-foreground truncate">{profile.full_name}</p>
              <Badge className="bg-destructive text-destructive-foreground font-semibold text-[10px] px-1.5 py-0 mt-0.5 hover:bg-destructive">
                ADMIN
              </Badge>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 animate-pulse">
            <div className="h-11 w-11 rounded-full bg-muted shrink-0" />
            <div className="min-w-0 space-y-2">
              <div className="h-4 w-28 bg-muted rounded" />
              <div className="h-3 w-20 bg-muted rounded" />
            </div>
          </div>
        )}
      </div>

      {/* Menu */}
      <div className="flex-1 overflow-y-auto px-4 pt-2">
        <nav className="space-y-0.5">
          {ADMIN_MENU_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/admin/dashboard'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold tracking-[0.01em] transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-primary hover:text-primary-foreground'
                )
              }
            >
              <item.icon className="h-[20px] w-[20px] shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

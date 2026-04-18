import { NavLink, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  Building2,
  LayoutDashboard,
  CreditCard,
  Wallet,
  Settings,
  UserCircle,
  GraduationCap,
  LogOut,
  ChevronsUpDown,
  MessageCircle,
  Target,
  Briefcase,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useAuth } from '@/contexts/AuthContext';
import logoWhiteHorizontal from '@/assets/logo-white-horizontal.png';
import logoHorizontalVerde from '@/assets/logo-horizontal-verde.png';

const ADMIN_MENU_ITEMS: { label: string; path: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { label: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'CRM', path: '/admin/crm', icon: Target },
  { label: 'Empresas', path: '/admin/empresas', icon: Building2 },
  { label: 'Vendedores', path: '/admin/vendedores', icon: Briefcase },
  { label: 'Assinaturas', path: '/admin/assinaturas', icon: CreditCard },
  { label: 'Financeiro', path: '/admin/financeiro', icon: Wallet },
  { label: 'Configurações', path: '/admin/configuracoes', icon: Settings },
];

const WHATSAPP_SUPPORT_URL = 'https://wa.me/5521966885044';

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={cn("h-4 w-4 fill-current shrink-0", className)}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

export function AdminSidebarNav() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

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

      {/* Footer: User Menu */}
      <div className="border-t border-border p-2">
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50">
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.full_name} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-sm font-semibold text-sidebar-foreground truncate leading-tight">
                  {profile?.full_name?.split(' ').slice(0, 2).join(' ')}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">Administrador</p>
              </div>
              <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" sideOffset={8} className="w-56 p-0">
            <div className="px-3 py-3 border-b">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.full_name} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{profile?.full_name}</p>
                  <Badge className="bg-destructive text-destructive-foreground font-semibold text-[10px] px-1.5 py-0 mt-0.5 hover:bg-destructive">
                    ADMIN
                  </Badge>
                </div>
              </div>
            </div>

            <div className="py-1">
              <button onClick={() => navigate('/perfil')} className="flex w-full items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors">
                <UserCircle className="h-4 w-4 shrink-0" />
                <span>Dados Pessoais</span>
              </button>
              <button onClick={() => navigate('/configuracoes')} className="flex w-full items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors">
                <Settings className="h-4 w-4 shrink-0" />
                <span>Configurações</span>
              </button>
              <a href={WHATSAPP_SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="flex w-full items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-[#25D366] hover:text-white transition-colors">
                <WhatsAppIcon />
                <span>Suporte</span>
              </a>
            </div>

            <div className="border-t py-1">
              <button onClick={signOut} className="flex w-full items-center gap-3 px-3 py-2 text-sm text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors">
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Sair</span>
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

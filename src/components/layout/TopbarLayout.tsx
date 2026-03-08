import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, ClipboardList, Calendar, Users, UsersRound, Package,
  DollarSign, FileText, Settings, UserCircle, TrendingUp, Wrench,
  ChevronDown, GraduationCap, LogOut, Menu, Briefcase, CreditCard, Building2,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS } from '@/hooks/useUsers';
import logoDark from '@/assets/logo-dark.png';
import logoWhite from '@/assets/logo-white.png';

interface MenuItem {
  title: string;
  icon: any;
  path?: string;
  screenKey?: string;
  children?: { title: string; icon: any; path: string; screenKey?: string }[];
}

const menuItems: MenuItem[] = [
  { title: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', screenKey: 'screen:dashboard' },
  {
    title: 'Serviços',
    icon: Wrench,
    children: [
      { title: 'Ordens de Serviço', icon: ClipboardList, path: '/ordens-servico', screenKey: 'screen:service_orders' },
      { title: 'Serviços', icon: Wrench, path: '/servicos', screenKey: 'screen:services' },
      { title: 'Equipes', icon: UsersRound, path: '/equipes' },
      { title: 'Questionários', icon: FileText, path: '/questionarios', screenKey: 'screen:questionnaires' },
      { title: 'PMOC', icon: FileText, path: '/pmoc', screenKey: 'screen:pmoc' },
    ],
  },
  { title: 'Agenda', icon: Calendar, path: '/agenda', screenKey: 'screen:schedule' },
  { title: 'Clientes', icon: Users, path: '/clientes', screenKey: 'screen:customers' },
  { title: 'Equipamentos', icon: Package, path: '/equipamentos', screenKey: 'screen:equipment' },
  { title: 'CRM', icon: TrendingUp, path: '/crm', screenKey: 'screen:crm' },
  { title: 'Estoque', icon: Package, path: '/estoque', screenKey: 'screen:inventory' },
  { title: 'Financeiro', icon: DollarSign, path: '/financeiro', screenKey: 'screen:finance' },
  { title: 'Funcionários', icon: Briefcase, path: '/funcionarios' },
  { title: 'Assinatura', icon: CreditCard, path: '/assinatura' },
];

const userMenuPaths = ['/usuarios', '/tutoriais', '/configuracoes'];

export function TopbarLayout() {
  const { profile, roles, hasScreenAccess, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const filterByAccess = <T extends { screenKey?: string }>(items: T[]): T[] =>
    items.filter(item => !item.screenKey || hasScreenAccess(item.screenKey));

  const visibleItems = filterByAccess(menuItems).filter(item => {
    if (item.path && userMenuPaths.includes(item.path)) return false;
    if (item.children) {
      const visibleChildren = filterByAccess(item.children);
      return visibleChildren.length > 0;
    }
    return true;
  });

  const roleLabel = roles.length > 0 ? ROLE_LABELS[roles[0] as keyof typeof ROLE_LABELS] : 'Usuário';
  const initials = profile?.full_name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?';

  const isSubmenuActive = (children?: MenuItem['children']) =>
    children?.some(c => location.pathname === c.path) ?? false;

  return (
    <header className="hidden lg:flex h-14 items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4">
      <div className="flex items-center gap-6 min-w-0 flex-1">
        <img
          src={logoDark}
          alt="Dominex"
          className="h-7 shrink-0 cursor-pointer dark:hidden"
          onClick={() => navigate('/dashboard')}
        />
        <img
          src={logoWhite}
          alt="Dominex"
          className="h-7 shrink-0 cursor-pointer hidden dark:block"
          onClick={() => navigate('/dashboard')}
        />

        <nav className="flex items-center gap-1">
          {visibleItems.map((item) => {
            if (item.children) {
              const visibleChildren = filterByAccess(item.children);
              const hasActiveChild = isSubmenuActive(visibleChildren);

              return (
                <DropdownMenu key={item.title}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className={cn(
                        'h-10 px-3 text-[13px] font-semibold gap-1.5 transition-colors group',
                        'hover:bg-primary hover:text-primary-foreground',
                        'data-[state=open]:bg-primary data-[state=open]:text-primary-foreground',
                        hasActiveChild && 'bg-primary text-primary-foreground'
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.title}
                      <ChevronDown className="h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" sideOffset={8} className="min-w-[200px]">
                    {visibleChildren.map((child) => (
                      <DropdownMenuItem
                        key={child.path}
                        onClick={() => navigate(child.path)}
                        className={cn(
                          'cursor-pointer flex items-center gap-2.5 px-3 py-2 text-[13px]',
                          'hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
                          location.pathname === child.path && 'bg-primary/10 font-medium'
                        )}
                      >
                        <child.icon className="h-4 w-4 shrink-0" />
                        <span>{child.title}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            }

            return (
              <NavLink
                key={item.path}
                to={item.path!}
                className={({ isActive }) => cn(
                  'inline-flex items-center justify-center h-10 px-3 text-[13px] font-semibold rounded-md transition-colors gap-1.5',
                  'hover:bg-primary hover:text-primary-foreground',
                  isActive && 'bg-primary text-primary-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate('/configuracoes')} title="Configurações">
          <Settings className="h-4 w-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.full_name} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-3 py-2.5 border-b bg-muted/30">
              <p className="text-sm font-medium truncate">{profile?.full_name}</p>
              <Badge className="bg-primary text-primary-foreground font-semibold text-[10px] px-1.5 py-0 mt-1 hover:bg-primary">
                {roleLabel}
              </Badge>
            </div>
            <DropdownMenuItem onClick={() => navigate('/perfil')} className="cursor-pointer">
              <UserCircle className="h-4 w-4 mr-2" /> Meu Perfil
            </DropdownMenuItem>
            {hasScreenAccess('screen:users') && (
              <DropdownMenuItem onClick={() => navigate('/usuarios')} className="cursor-pointer">
                <Users className="h-4 w-4 mr-2" /> Usuários
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => navigate('/tutoriais')} className="cursor-pointer">
              <GraduationCap className="h-4 w-4 mr-2" /> Tutoriais
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={signOut}
              className="cursor-pointer text-destructive hover:!bg-destructive hover:!text-destructive-foreground focus:!bg-destructive focus:!text-destructive-foreground"
            >
              <LogOut className="h-4 w-4 mr-2" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

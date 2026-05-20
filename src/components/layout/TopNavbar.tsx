import { memo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  Calendar,
  Users,
  Package,
  DollarSign,
  FileText,
  Settings as SettingsIcon,
  UserCircle,
  TrendingUp,
  Wrench,
  ChevronDown,
  GraduationCap,
  Briefcase,
  CreditCard,
  Building2,
  Map,
  Target,
  FolderOpen,
  Boxes,
  ScrollText,
  Clock,
  History,
  CalendarClock,
  Landmark,
  FileBarChart,
  LogOut,
  Sun,
  Moon,
  HelpCircle,
  Clapperboard,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyModules, type ModuleCode } from '@/hooks/useCompanyModules';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { ROLE_LABELS } from '@/hooks/useUsers';
import { HelpCenterDrawer } from '@/components/layout/HelpCenterDrawer';
import { AccountSwitcherDropdown } from './AccountSwitcherDropdown';
import { cn } from '@/lib/utils';

interface MenuItem {
  title: string;
  icon: any;
  path?: string;
  screenKey?: string;
  moduleKey?: ModuleCode;
  children?: { title: string; icon: any; path: string; screenKey?: string; moduleKey?: ModuleCode }[];
}

const tenantMenuItems: MenuItem[] = [
  { title: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', screenKey: 'screen:dashboard' },
  { title: 'Agenda', icon: Calendar, path: '/agenda', screenKey: 'screen:schedule' },
  {
    title: 'Operacional',
    icon: Wrench,
    children: [
      { title: 'Ordens de Serviço', icon: ClipboardList, path: '/ordens-servico', screenKey: 'screen:service_orders' },
      { title: 'Ponto Eletrônico', icon: Clock, path: '/ponto', moduleKey: 'rh' },
      { title: 'Mapa e Rastreamento', icon: Map, path: '/mapa-ao-vivo' },
    ],
  },
  { title: 'Orçamentos', icon: FileText, path: '/orcamentos', screenKey: 'screen:quotes' },
  {
    title: 'Gestão',
    icon: FolderOpen,
    children: [
      { title: 'Clientes', icon: Users, path: '/clientes', screenKey: 'screen:customers' },
      { title: 'Serviços', icon: Wrench, path: '/servicos', screenKey: 'screen:services' },
      { title: 'Equipamentos', icon: Boxes, path: '/equipamentos', screenKey: 'screen:equipment' },
      { title: 'Estoque', icon: Package, path: '/estoque', screenKey: 'screen:inventory' },
      { title: 'Funcionários', icon: Briefcase, path: '/funcionarios', screenKey: 'screen:employees', moduleKey: 'rh' },
      { title: 'Contratos', icon: ScrollText, path: '/contratos', screenKey: 'screen:contracts' },
    ],
  },
  { title: 'CRM', icon: TrendingUp, path: '/crm', screenKey: 'screen:crm', moduleKey: 'crm' },
  {
    title: 'Financeiro',
    icon: DollarSign,
    screenKey: 'screen:finance',
    children: [
      { title: 'Visão Geral', icon: LayoutDashboard, path: '/financeiro', screenKey: 'screen:finance' },
      { title: 'Movimentações', icon: History, path: '/financeiro/movimentacoes', screenKey: 'screen:finance' },
      { title: 'Contas a Pagar/Receber', icon: CalendarClock, path: '/financeiro/contas', screenKey: 'screen:finance', moduleKey: 'finance_advanced' },
      { title: 'Contas e Cartões', icon: Landmark, path: '/financeiro/caixas-bancos', screenKey: 'screen:finance', moduleKey: 'finance_advanced' },
      { title: 'DRE - Resultado', icon: FileBarChart, path: '/financeiro/dre', screenKey: 'screen:finance', moduleKey: 'finance_advanced' },
      { title: 'Configurações', icon: SettingsIcon, path: '/financeiro/configuracoes', screenKey: 'screen:finance' },
    ],
  },
];

const adminMenuItems: (MenuItem & { masterOnly?: boolean })[] = [
  { title: 'Dashboard', icon: LayoutDashboard, path: '/admin/dashboard', screenKey: 'admin_dashboard' },
  { title: 'CRM', icon: Target, path: '/admin/crm', screenKey: 'admin_crm' },
  { title: 'Empresas', icon: Building2, path: '/admin/empresas', screenKey: 'admin_empresas' },
  { title: 'Vendedores', icon: Briefcase, path: '/admin/vendedores', screenKey: 'admin_vendedores' },
  { title: 'Financeiro', icon: DollarSign, path: '/admin/financeiro', screenKey: 'admin_financeiro' },
  { title: 'Domiflix', icon: Clapperboard, path: '/admin/domiflix', masterOnly: true },
];

const WHATSAPP_SUPPORT_URL = 'https://wa.me/5521966885044';

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={cn('h-4 w-4 fill-current shrink-0', className)}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

/**
 * Barra de navegação superior (modo alternativo do desktop).
 *
 * Diferente do Sidebar:
 * - Itens com submenu viram DropdownMenu na barra (hover-open).
 * - Logo full à esquerda, perfil + menu de conta à direita.
 * - O AccountSwitcher stub aparece dentro do dropdown do perfil (não inline na barra).
 * - Visível só em xl: (≥1280px). Abaixo disso, o header mobile/tablet entra em ação.
 */
export const TopNavbar = memo(() => {
  const { user, profile, roles, hasScreenAccess, hasAdminScreenAccess, isAdminUser, signOut } = useAuth();
  const { hasModule } = useCompanyModules();
  const { logoUrl, defaultLogoDark, defaultLogoWhite, isLoading: logoLoading } = useWhiteLabel();
  const location = useLocation();
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
    return 'light';
  });

  const applyTheme = (next: 'light' | 'dark') => {
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('theme', next);
  };

  const isSuperAdmin = roles.includes('super_admin');

  const filterByAccess = <T extends { screenKey?: string; moduleKey?: ModuleCode }>(items: T[]): T[] => {
    return items.filter((item) => {
      if (item.screenKey && !hasScreenAccess(item.screenKey)) return false;
      if (item.moduleKey && !hasModule(item.moduleKey)) return false;
      return true;
    });
  };

  const filteredAdminMenu = isSuperAdmin
    ? adminMenuItems
    : adminMenuItems.filter((item) => !item.masterOnly && item.screenKey && hasAdminScreenAccess(item.screenKey));

  const visibleItems = isAdminUser
    ? filteredAdminMenu
    : filterByAccess(tenantMenuItems)
        .map((item) => (item.children ? { ...item, children: filterByAccess(item.children) } : item))
        .filter((item) => !item.children || item.children.length > 0);

  const roleLabel = isAdminUser
    ? (isSuperAdmin ? 'Administrador Auctus' : 'Administrador')
    : roles.length > 0
      ? ROLE_LABELS[roles[0] as keyof typeof ROLE_LABELS]
      : 'Usuário';

  const initials = profile?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

  const firstName = profile?.full_name?.split(' ')[0] || 'Usuário';

  const isSubmenuActive = (children?: MenuItem['children']) =>
    children?.some((c) => c.path && (location.pathname === c.path || location.pathname.startsWith(c.path + '/'))) ?? false;

  const adminHomePath = filteredAdminMenu[0]?.path ?? '/admin/dashboard';
  const logoTarget = isAdminUser ? adminHomePath : '/dashboard';

  return (
    <>
      <TooltipProvider delayDuration={200}>
        <header className="hidden xl:flex h-14 items-center justify-between border-b border-border bg-background px-4">
          <div className="flex items-center gap-6 min-w-0 flex-1">
            {logoLoading ? (
              <div className="h-7 w-28 rounded bg-muted animate-pulse shrink-0" />
            ) : logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo"
                className="max-h-9 w-auto shrink-0 cursor-pointer object-contain"
                onClick={() => navigate(logoTarget)}
              />
            ) : (
              <>
                <img
                  src={defaultLogoDark}
                  alt="Dominex"
                  className="h-7 shrink-0 cursor-pointer dark:hidden"
                  onClick={() => navigate(logoTarget)}
                />
                <img
                  src={defaultLogoWhite}
                  alt="Dominex"
                  className="h-7 shrink-0 cursor-pointer hidden dark:block"
                  onClick={() => navigate(logoTarget)}
                />
              </>
            )}

            <nav className="flex items-center gap-1">
              {visibleItems.map((item) => {
                if (item.children) {
                  const visibleSubmenu = filterByAccess(item.children);
                  if (visibleSubmenu.length === 0) return null;
                  const hasActiveSubmenu = isSubmenuActive(visibleSubmenu);

                  return (
                    <DropdownMenu key={item.title}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          className={cn(
                            'h-10 px-3 text-[13px] font-semibold gap-1.5 transition-colors group',
                            'hover:bg-primary hover:text-primary-foreground',
                            'data-[state=open]:bg-primary data-[state=open]:text-primary-foreground',
                            hasActiveSubmenu && 'bg-primary text-primary-foreground'
                          )}
                        >
                          <item.icon className="h-4 w-4" />
                          {item.title}
                          <ChevronDown className="h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" sideOffset={8} className="min-w-[200px]">
                        {visibleSubmenu.map((child) => (
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
                    className={({ isActive }) =>
                      cn(
                        'inline-flex items-center justify-center h-10 px-3 text-[13px] font-semibold rounded-md transition-colors gap-1.5',
                        'hover:bg-primary hover:text-primary-foreground',
                        isActive && 'bg-primary text-primary-foreground'
                      )
                    }
                  >
                    <item.icon className="h-4 w-4" />
                    {item.title}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.full_name} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium text-foreground">{firstName}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 p-1.5">
                <div className="px-2 py-2 border-b mb-1">
                  <p className="text-sm font-medium truncate">{profile?.full_name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
                  <Badge className="bg-primary text-primary-foreground font-semibold text-[10px] px-1.5 py-0 mt-1 hover:bg-primary">
                    {roleLabel}
                  </Badge>
                </div>

                {/* AccountSwitcher stub (Fase 1) */}
                <div className="px-1 py-1">
                  <AccountSwitcherDropdown />
                </div>

                <DropdownMenuSeparator />

                {!isAdminUser && (
                  <>
                    <DropdownMenuItem onClick={() => navigate('/perfil')} className="cursor-pointer">
                      <UserCircle className="h-4 w-4 mr-2" /> Meu Perfil
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/assinatura')} className="cursor-pointer">
                      <CreditCard className="h-4 w-4 mr-2" /> Assinatura
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/domiflix')} className="cursor-pointer">
                      <GraduationCap className="h-4 w-4 mr-2" /> Domiflix
                    </DropdownMenuItem>
                  </>
                )}

                <DropdownMenuItem
                  onClick={() => navigate(isAdminUser ? '/admin/configuracoes' : '/configuracoes')}
                  className="cursor-pointer"
                >
                  <SettingsIcon className="h-4 w-4 mr-2" /> Configurações
                </DropdownMenuItem>

                {!isAdminUser && (
                  <>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="cursor-pointer">
                        <Sun className="h-4 w-4 mr-2" /> Tema
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent>
                          <DropdownMenuItem onClick={() => applyTheme('light')} className={cn('cursor-pointer', theme === 'light' && 'bg-accent')}>
                            <Sun className="h-4 w-4 mr-2" /> Claro
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => applyTheme('dark')} className={cn('cursor-pointer', theme === 'dark' && 'bg-accent')}>
                            <Moon className="h-4 w-4 mr-2" /> Escuro
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>

                    <DropdownMenuItem onClick={() => setHelpOpen(true)} className="cursor-pointer">
                      <HelpCircle className="h-4 w-4 mr-2" /> Central de Ajuda
                    </DropdownMenuItem>

                    <DropdownMenuItem asChild>
                      <a
                        href={WHATSAPP_SUPPORT_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cursor-pointer hover:!bg-success hover:!text-success-foreground focus:!bg-success focus:!text-success-foreground"
                      >
                        <WhatsAppIcon className="mr-2" /> Suporte
                      </a>
                    </DropdownMenuItem>
                  </>
                )}

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
      </TooltipProvider>

      <HelpCenterDrawer open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
});

TopNavbar.displayName = 'TopNavbar';

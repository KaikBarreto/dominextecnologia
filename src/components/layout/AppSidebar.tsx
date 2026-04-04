import {
  LayoutDashboard,
  ClipboardList,
  Calendar,
  Users,
  UsersRound,
  Package,
  DollarSign,
  FileText,
  Settings,
  UserCircle,
  TrendingUp,
  Wrench,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  GraduationCap,
  Briefcase,
  CreditCard,
  Building2,
  MapPin,
  Map,
  FolderOpen,
  Boxes,
  ScrollText,
  Clock,
  History,
  CalendarClock,
  Landmark,
  Tag,
  FileBarChart,
  LogOut,
  MessageCircle,
  ChevronsUpDown,
} from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sidebar, SidebarContent, useSidebar } from '@/components/ui/sidebar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS } from '@/hooks/useUsers';
import { cn } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useCompanyModules, type ModuleCode } from '@/hooks/useCompanyModules';
import iconePreto from '@/assets/icone_preto.png';
import iconeBranco from '@/assets/icone_branco.png';
import iconeVerde from '@/assets/icone_verde.png';
import logoWhiteHorizontal from '@/assets/logo-white-horizontal.png';
import logoHorizontalVerde from '@/assets/logo-horizontal-verde.png';

interface MenuItem {
  title: string;
  icon: any;
  path?: string;
  screenKey?: string;
  moduleKey?: ModuleCode;
  children?: { title: string; icon: any; path: string; screenKey?: string; moduleKey?: ModuleCode }[];
}

const menuItems: MenuItem[] = [
  { title: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', screenKey: 'screen:dashboard' },
  { title: 'Agenda', icon: Calendar, path: '/agenda', screenKey: 'screen:schedule' },
  {
    title: 'Operacional',
    icon: Wrench,
    children: [
      { title: 'Ordens de Serviço', icon: ClipboardList, path: '/ordens-servico', screenKey: 'screen:service_orders' },
      { title: 'Orçamentos', icon: FileText, path: '/orcamentos', screenKey: 'screen:quotes' },
      { title: 'Ponto Eletrônico', icon: Clock, path: '/ponto', moduleKey: 'rh' },
      { title: 'Serviços', icon: Wrench, path: '/servicos', screenKey: 'screen:services' },
      { title: 'Mapa e Rastreamento', icon: Map, path: '/mapa-ao-vivo' },
    ],
  },
  {
    title: 'Gestão',
    icon: FolderOpen,
    children: [
      { title: 'Clientes', icon: Users, path: '/clientes', screenKey: 'screen:customers' },
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
      { title: 'Caixas e Bancos', icon: Landmark, path: '/financeiro/caixas-bancos', screenKey: 'screen:finance', moduleKey: 'finance_advanced' },
      { title: 'Categorias', icon: Tag, path: '/financeiro/categorias', screenKey: 'screen:finance' },
      { title: 'DRE - Resultado', icon: FileBarChart, path: '/financeiro/dre', screenKey: 'screen:finance', moduleKey: 'finance_advanced' },
    ],
  },
];

const adminMenuItems: MenuItem[] = [
  { title: 'Dashboard', icon: LayoutDashboard, path: '/admin/dashboard' },
  { title: 'Empresas', icon: Building2, path: '/admin/empresas' },
  { title: 'Assinaturas', icon: CreditCard, path: '/admin/assinaturas' },
  { title: 'Financeiro', icon: DollarSign, path: '/admin/financeiro' },
];

const WHATSAPP_SUPPORT_URL = 'https://wa.me/5500000000000';
const ICON_SIZE = "h-[20px] w-[20px] shrink-0";

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={cn("h-4 w-4 fill-current shrink-0", className)}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

export function AppSidebar() {
  const { user, profile, roles, hasScreenAccess, signOut } = useAuth();
  const { hasModule } = useCompanyModules();
  const { logoUrl, iconUrl, enabled: wlEnabled, defaultLogoDark, isLoading: logoLoading } = useWhiteLabel();
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const navigate = useNavigate();
  const [openMenus, setOpenMenus] = useState<string[]>(() => {
    return menuItems
      .filter(item => item.children?.some(c => c.path && (location.pathname === c.path || location.pathname.startsWith(c.path + '/'))))
      .map(item => item.title);
  });
  const menuScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (collapsed && menuScrollRef.current) {
      menuScrollRef.current.scrollTop = 0;
    }
  }, [collapsed]);

  const isSuperAdmin = roles.includes('super_admin');

  const filterByAccess = <T extends { screenKey?: string; moduleKey?: ModuleCode }>(items: T[]): T[] => {
    return items.filter(item => {
      if (item.screenKey && !hasScreenAccess(item.screenKey)) return false;
      if (item.moduleKey && !hasModule(item.moduleKey)) return false;
      return true;
    });
  };

  const activeMenu = isSuperAdmin ? adminMenuItems : filterByAccess(menuItems).map(item => {
    if (item.children) {
      return { ...item, children: filterByAccess(item.children) };
    }
    return item;
  }).filter(item => !item.children || item.children.length > 0);
  const filteredMenu = activeMenu;

  const isSubmenuActive = (children?: MenuItem['children']) =>
    children?.some((c) => c.path && (location.pathname === c.path || location.pathname.startsWith(c.path + '/'))) ?? false;

  const toggleMenu = (label: string) => {
    setOpenMenus((prev) =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    );
  };

  const roleLabel = isSuperAdmin ? 'Administrador' : (roles.length > 0 ? ROLE_LABELS[roles[0] as keyof typeof ROLE_LABELS] : 'Usuário');
  const initials = profile?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

  const handleCollapsedParentClick = (title: string) => {
    setOpenMenus(prev => prev.includes(title) ? prev : [...prev, title]);
    toggleSidebar();
  };

  const userMenuItems = [
    { label: 'Perfil', icon: UserCircle, action: () => navigate('/perfil') },
    { label: 'Assinatura', icon: CreditCard, action: () => navigate('/assinatura') },
    { label: 'Tutoriais', icon: GraduationCap, action: () => navigate('/tutoriais') },
    { label: 'Configurações', icon: Settings, action: () => navigate('/configuracoes'), screenKey: 'screen:settings' },
  ];

  const visibleUserMenuItems = userMenuItems.filter(item => !item.screenKey || hasScreenAccess(item.screenKey));

  return (
    <Sidebar collapsible="icon" className="border-r border-border bg-background">
      <div className="relative h-full">
      <SidebarContent className="flex h-full flex-col p-0 overflow-hidden">

        {/* ── Logo ── */}
        <NavLink
          to="/dashboard"
          className="h-14 flex items-center justify-center border-b border-border shrink-0 overflow-hidden bg-white dark:bg-sidebar"
        >
          {logoLoading ? (
            collapsed
              ? <div className="h-7 w-7 rounded bg-muted animate-pulse" />
              : <div className="h-8 w-28 rounded bg-muted animate-pulse" />
          ) : collapsed
            ? (wlEnabled
                ? (iconUrl
                    ? <img src={iconUrl} alt="Icon" className="h-7 w-7 object-contain" />
                    : null)
                : <>
                    <img src={iconePreto} alt="Logo" className="h-7 w-7 object-contain dark:hidden" />
                    <img src={iconeVerde} alt="Logo" className="h-7 w-7 object-contain hidden dark:block" />
                  </>
              )
            : <>
                <img src={logoUrl || defaultLogoDark} alt="Logo" className="h-8 w-auto mx-auto dark:hidden" />
                <img src={logoUrl || logoHorizontalVerde} alt="Logo" className="h-8 w-auto mx-auto hidden dark:block" />
              </>
          }
        </NavLink>

        {/* ── Menu ── */}
        <div ref={menuScrollRef} className={cn("flex-1 overflow-y-auto pt-2", collapsed ? "px-1.5" : "px-4")}>
          <nav className="space-y-0.5">
            {filteredMenu.map((item) => {
              if (item.children) {
                const visibleChildren = filterByAccess(item.children);
                if (visibleChildren.length === 0) return null;

                if (collapsed) {
                  const hasActiveChild = isSubmenuActive(visibleChildren);
                  return (
                    <button
                      key={item.title}
                      title={item.title}
                      onClick={() => handleCollapsedParentClick(item.title)}
                      className={cn(
                        'flex w-full items-center justify-center rounded-lg py-2.5 transition-colors',
                        hasActiveChild
                          ? 'bg-primary text-primary-foreground'
                          : 'text-sidebar-foreground hover:bg-primary hover:text-primary-foreground'
                      )}
                    >
                      <item.icon className={ICON_SIZE} />
                    </button>
                  );
                }

                const hasActiveSubmenu = isSubmenuActive(visibleChildren);
                return (
                  <Collapsible
                    key={item.title}
                    open={openMenus.includes(item.title)}
                    onOpenChange={() => toggleMenu(item.title)}
                  >
                    <CollapsibleTrigger
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-[13px] font-semibold tracking-[0.01em] transition-colors',
                        hasActiveSubmenu
                          ? 'bg-primary text-primary-foreground'
                          : 'text-sidebar-foreground hover:bg-primary hover:text-primary-foreground'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <item.icon className={ICON_SIZE} />
                        <span>{item.title}</span>
                      </div>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 transition-transform',
                          (openMenus.includes(item.title) || hasActiveSubmenu) && 'rotate-180'
                        )}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="ml-3 mt-0.5 space-y-0.5 border-l border-border/40 pl-3 overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 duration-200">
                      {visibleChildren.map((child, index) => (
                        <NavLink
                          key={child.path}
                          to={child.path}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-normal transition-all duration-200',
                              isActive
                                ? 'bg-primary text-primary-foreground font-medium'
                                : 'text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:font-medium'
                            )
                          }
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <child.icon className="h-4 w-4" />
                          <span>{child.title}</span>
                        </NavLink>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                );
              }

              return (
                <NavLink
                  key={item.path}
                  to={item.path!}
                  title={collapsed ? item.title : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center rounded-lg py-2.5 text-[13px] font-semibold tracking-[0.01em] transition-colors',
                      collapsed
                        ? 'justify-center'
                        : 'gap-3 px-3',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-sidebar-foreground hover:bg-primary hover:text-primary-foreground'
                    )
                  }
                >
                  <item.icon className={ICON_SIZE} />
                  {!collapsed && <span>{item.title}</span>}
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* ── Footer: User Menu ── */}
        <div className={cn("border-t border-border shrink-0", collapsed ? "p-1.5" : "p-2")}>
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  'flex w-full items-center rounded-lg transition-colors hover:bg-muted/50',
                  collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2.5'
                )}
              >
                <Avatar className={cn("shrink-0", collapsed ? "h-8 w-8" : "h-9 w-9")}>
                  <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.full_name} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">{initials}</AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <>
                    <div className="min-w-0 flex-1 text-left">
                      <p className="text-sm font-semibold text-sidebar-foreground truncate leading-tight">
                        {profile?.full_name?.split(' ').slice(0, 2).join(' ')}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">{roleLabel}</p>
                    </div>
                    <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  </>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={8}
              className="w-56 p-0"
            >
              {/* User info header */}
              <div className="px-3 py-3 border-b">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.full_name} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{profile?.full_name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
                    <Badge className="bg-primary text-primary-foreground font-semibold text-[10px] px-1.5 py-0 mt-0.5 hover:bg-primary">
                      {roleLabel}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Menu items */}
              <div className="py-1">
                {visibleUserMenuItems.map((item) => (
                  <button
                    key={item.label}
                    onClick={item.action}
                    className="flex w-full items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                ))}
                <a
                  href={WHATSAPP_SUPPORT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-[#25D366] hover:text-white transition-colors"
                >
                  <WhatsAppIcon />
                  <span>Suporte</span>
                </a>
              </div>

              {/* Logout */}
              <div className="border-t py-1">
                <button
                  onClick={signOut}
                  className="flex w-full items-center gap-3 px-3 py-2 text-sm text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  <span>Sair</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </SidebarContent>

      </div>
    </Sidebar>
  );
}

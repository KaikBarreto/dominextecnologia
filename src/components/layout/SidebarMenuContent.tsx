import {
  LayoutDashboard,
  ClipboardList,
  Calendar,
  Users,
  Package,
  DollarSign,
  FileText,
  Receipt,
  Settings as SettingsIcon,
  User,
  TrendingUp,
  Wrench,
  ChevronDown,
  Briefcase,
  CreditCard,
  Building2,
  Map,
  Target,
  FolderOpen,
  Boxes,
  ScrollText,
  Clock,
  FileBarChart,
  CalendarClock,
  History as HistoryIcon,
  LogOut,
  ChevronsUpDown,
  Sun,
  Moon,
  HelpCircle,
  Clapperboard,
  HeartPulse,
  Newspaper,
  Video,
  Crown,
} from 'lucide-react';
import { OperacionalIcon, AreaTecnicoIcon } from '@/components/icons/MenuIcons';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { localizeAppPath } from '@/lib/i18n/appRouteSlugs';
import { translateMenuLabel } from '@/components/layout/shellLabels';
import { useCompanyModules, type ModuleCode } from '@/hooks/useCompanyModules';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { segmentHasTechTools } from '@/config/technicianArea';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { HelpCenterDrawer } from '@/components/layout/HelpCenterDrawer';
import { AccountSwitcherDropdown } from '@/components/account-switcher/AccountSwitcherDropdown';
import { getRandomWhatsAppNumber } from '@/components/landing/whatsappNumbers';
import { podeAcessarDomiflixAdmin } from '@/lib/adminDomiflixAccess';
import iconePreto from '@/assets/icone_preto.png';
import iconeVerde from '@/assets/icone_verde.png';
import logoHorizontalVerde from '@/assets/logo-horizontal-verde.png';

interface MenuItem {
  title: string;
  icon: any;
  path?: string;
  screenKey?: string;
  moduleKey?: ModuleCode;
  requiresSegment?: string;
  /** Gate dedicado: libera só se o segmento da empresa tem Área do Técnico™. */
  requiresTechTools?: boolean;
  children?: { title: string; icon: any; path: string; screenKey?: string; moduleKey?: ModuleCode; requiresSegment?: string }[];
}

// Estrutura preservada do AppSidebar antigo do Dominex — não inventar itens novos.
const tenantMenuItems: MenuItem[] = [
  { title: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', screenKey: 'screen:dashboard' },
  { title: 'Agenda', icon: Calendar, path: '/agenda', screenKey: 'screen:schedule' },
  {
    title: 'Operacional',
    icon: OperacionalIcon,
    children: [
      { title: 'Ordens de Serviço', icon: ClipboardList, path: '/ordens-servico', screenKey: 'screen:service_orders' },
      { title: 'Mapa e Rastreamento', icon: Map, path: '/mapa-ao-vivo' },
    ],
  },
  { title: 'Área do Técnico™', icon: AreaTecnicoIcon, path: '/area-tecnico', screenKey: 'screen:technician_tools', requiresTechTools: true },
  { title: 'Orçamentos', icon: FileText, path: '/orcamentos', screenKey: 'screen:quotes' },
  {
    title: 'Gestão',
    icon: FolderOpen,
    children: [
      { title: 'Serviços', icon: Wrench, path: '/servicos', screenKey: 'screen:services' },
      { title: 'Clientes', icon: Users, path: '/clientes', screenKey: 'screen:customers' },
      { title: 'Equipamentos', icon: Boxes, path: '/equipamentos', screenKey: 'screen:equipment' },
      { title: 'Contratos', icon: ScrollText, path: '/contratos', screenKey: 'screen:contracts', moduleKey: 'contracts' },
      { title: 'Funcionários', icon: Briefcase, path: '/funcionarios', screenKey: 'screen:employees', moduleKey: 'rh' },
      { title: 'Estoque', icon: Package, path: '/estoque', screenKey: 'screen:inventory' },
      // 'Responsáveis Técnicos' removido do menu (Onda UI-1). A tela e a rota
      // `/responsaveis-tecnicos` continuam acessíveis por URL direta até o
      // quick-create vir pelo modal de contrato (parallel work — Cliente PMOC).
    ],
  },
  { title: 'CRM', icon: TrendingUp, path: '/crm', screenKey: 'screen:crm', moduleKey: 'crm' },
  {
    title: 'Financeiro',
    icon: DollarSign,
    children: [
      // Mesma permissão de tela (screen:finance) em todos — não é módulo novo.
      // "Contas a Pagar/Receber" exige finance_advanced (mesmo gate que antes
      // escondia a aba dentro da página); Relatório (Visão Geral + DRE) e
      // Movimentações são base. A aba DRE dentro do Relatório é gateada inline.
      { title: 'Visão Geral', icon: FileBarChart, path: '/financeiro/relatorio', screenKey: 'screen:finance' },
      { title: 'Movimentações Financeiras', icon: HistoryIcon, path: '/financeiro/movimentacoes', screenKey: 'screen:finance' },
      { title: 'Contas a Pagar/Receber', icon: CalendarClock, path: '/financeiro/contas', screenKey: 'screen:finance', moduleKey: 'finance_advanced' },
      // Notas Fiscais (NFS-e) — gate duplo: módulo pago `nfe` (empresa) E permissão de tela dedicada (usuário).
      { title: 'Notas Fiscais', icon: Receipt, path: '/notas-fiscais', screenKey: 'screen:fiscal_notes', moduleKey: 'nfe' },
    ],
  },
];

const adminMenuItems: (MenuItem & { masterOnly?: boolean })[] = [
  { title: 'Dashboard', icon: LayoutDashboard, path: '/admin/dashboard', screenKey: 'admin_dashboard' },
  { title: 'CRM/Tarefas', icon: Target, path: '/admin/crm', screenKey: 'admin_crm' },
  { title: 'Empresas', icon: Building2, path: '/admin/empresas', screenKey: 'admin_empresas' },
  { title: 'Vendedores', icon: Briefcase, path: '/admin/vendedores', screenKey: 'admin_vendedores' },
  { title: 'Financeiro', icon: DollarSign, path: '/admin/financeiro', screenKey: 'admin_financeiro' },
  { title: 'Health Score', icon: HeartPulse, path: '/admin/health-score', screenKey: 'admin_health_score' },
  { title: 'Blog', icon: Newspaper, path: '/admin/blog', screenKey: 'admin_blog', masterOnly: true },
  { title: 'Domiflix', icon: Clapperboard, path: '/admin/domiflix', masterOnly: true },
];

// Número sorteado no CLIQUE (rodízio de números do suporte).
const getWhatsAppSupportUrl = () => `https://wa.me/${getRandomWhatsAppNumber()}`;
const ICON_SIZE = 'h-[20px] w-[20px] shrink-0';
// Box FIXO e idêntico pra TODO item no rail colapsado (folha, grupo, header,
// footer). `mx-auto` + tamanho fixo (h-10 w-10) garantem que o centro de cada
// box caia no MESMO eixo vertical do rail — independente da largura óptica do
// ícone (lucide tem viewBox 24, os custom OperacionalIcon/AreaTecnicoIcon
// não são quadrados) ou do tipo de item. `justify-center` num `w-full` deixava
// o centro deslocar quando a scrollbar aparecia / paddings divergiam → zigzag.
const COLLAPSED_ITEM = 'mx-auto flex h-10 w-10 items-center justify-center rounded-lg transition-colors';

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

/**
 * Conteúdo do sidebar — compartilhado entre o `<Sidebar />` desktop e o
 * `<MobileSidebar />` (sheet do tablet).
 *
 * Decide internamente entre menu de tenant e menu admin via `useAuth().isAdminUser`.
 * `useSidebar()` é opcional (try/catch) porque dentro do mobile sheet não há
 * `SidebarProvider` — nesse caso assumimos `expanded`.
 *
 * Rodapé: padrão EcoSistema — DropdownMenu (Perfil/Assinatura/Tema/Tutoriais
 * Domiflix/Ajuda/Suporte) + AccountSwitcherDropdown no fundo do dropdown.
 * Abaixo do dropdown, botões Configurações + Sair lado a lado.
 */
export function SidebarMenuContent() {
  const { user, profile, roles, hasScreenAccess, hasAdminScreenAccess, isAdminUser, signOut } = useAuth();
  const { locale } = useAppLocaleContext();
  const shellT = MESSAGES[locale].app.shell;
  const accountT = shellT.account;
  const tMenu = (title: string) => translateMenuLabel(title, shellT);
  // Localiza um path do app pro slug do idioma do usuário (raiz traduzida, resto
  // preservado). Paths fora do registro (admin, domiflix) voltam intactos.
  const L = (path: string) => localizeAppPath(path, locale);
  const { hasModule } = useCompanyModules();
  const { settings } = useCompanySettings();
  const { logoUrl, iconUrl, enabled: wlEnabled, defaultLogoDark, isLoading: logoLoading } = useWhiteLabel();
  const location = useLocation();
  const navigate = useNavigate();

  // useSidebar pode lançar fora do SidebarProvider (mobile sheet). Cai pra expanded.
  let collapsed = false;
  try {
    const ctx = useSidebar();
    collapsed = ctx.state === 'collapsed';
  } catch {
    collapsed = false;
  }

  const [openMenus, setOpenMenus] = useState<string[]>(() => {
    return tenantMenuItems
      .filter(item => item.children?.some(c => {
        if (!c.path) return false;
        const lp = localizeAppPath(c.path, locale);
        return location.pathname === lp || location.pathname.startsWith(lp + '/');
      }))
      .map(item => item.title);
  });
  const menuScrollRef = useRef<HTMLDivElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
    return 'light';
  });

  // ResizeObserver no trigger do rodapé — mede a altura em runtime pra que
  // o DropdownMenuContent receba `sideOffset={-profileTriggerHeight}` e fique
  // EXATAMENTE por cima do card de perfil. Cobre o trigger independente do
  // collapsed/expanded, presença de empresa, ou tamanho do nome.
  const profileTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [profileTriggerHeight, setProfileTriggerHeight] = useState(0);
  useLayoutEffect(() => {
    const el = profileTriggerRef.current;
    if (!el) return;
    setProfileTriggerHeight(el.offsetHeight);
    const ro = new ResizeObserver(() => {
      setProfileTriggerHeight(el.offsetHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [collapsed]);

  useEffect(() => {
    if (collapsed && menuScrollRef.current) {
      menuScrollRef.current.scrollTop = 0;
    }
  }, [collapsed]);

  const applyTheme = (next: 'light' | 'dark') => {
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('theme', next);
  };

  const isSuperAdmin = roles.includes('super_admin');
  const isCompanyAdmin = roles.includes('admin');
  const showLogoLoading = logoLoading && !isAdminUser;

  const filterByAccess = <T extends { screenKey?: string; moduleKey?: ModuleCode; requiresSegment?: string; requiresTechTools?: boolean }>(items: T[]): T[] => {
    return items.filter(item => {
      if (item.screenKey && !hasScreenAccess(item.screenKey)) return false;
      if (item.moduleKey && !hasModule(item.moduleKey)) return false;
      if (item.requiresSegment && settings?.segment !== item.requiresSegment) return false;
      if (item.requiresTechTools && !segmentHasTechTools(settings?.segment)) return false;
      return true;
    });
  };

  const filteredAdminMenu = (isSuperAdmin
    ? adminMenuItems
    : adminMenuItems.filter(item => !item.masterOnly && item.screenKey && hasAdminScreenAccess(item.screenKey))
  )
    // Gate temporário do Domiflix admin: restrito ao e-mail allowlistado
    // (defesa de UI; segurança real é RLS + guard de rota em App.tsx).
    // Aplicado por `path` pra independer de screenKey/masterOnly.
    .filter(item => item.path !== '/admin/domiflix' || podeAcessarDomiflixAdmin(user?.email));

  // Home do painel admin = Empresas (alinhado ao destino pós-login); cai no
  // primeiro item acessível se o usuário não tiver acesso a Empresas.
  const adminHomePath =
    filteredAdminMenu.find((m) => m.path === '/admin/empresas')?.path ??
    filteredAdminMenu[0]?.path ??
    '/admin/empresas';

  const activeMenu = isAdminUser
    ? filteredAdminMenu
    : filterByAccess(tenantMenuItems)
        .map(item => (item.children ? { ...item, children: filterByAccess(item.children) } : item))
        .filter(item => !item.children || item.children.length > 0);

  const isSubmenuActive = (children?: MenuItem['children']) =>
    children?.some((c) => {
      if (!c.path) return false;
      const lp = localizeAppPath(c.path, locale);
      return location.pathname === lp || location.pathname.startsWith(lp + '/');
    }) ?? false;

  const toggleMenu = (label: string) => {
    setOpenMenus((prev) => (prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]));
  };

  const profileName = profile?.full_name?.trim() || user?.email?.split('@')[0] || shellT.defaultUserName;
  const initials = profileName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

  return (
    <>
      <TooltipProvider delayDuration={200}>
        {/* Logo */}
        <NavLink
          to={isAdminUser ? adminHomePath : L('/dashboard')}
          className="relative h-16 flex items-center justify-center border-b border-border shrink-0 overflow-hidden bg-white dark:bg-sidebar px-2"
        >
          {showLogoLoading ? (
            collapsed
              ? <div className="h-7 w-7 rounded bg-muted animate-pulse" />
              : <div className="h-8 w-28 rounded bg-muted animate-pulse" />
          ) : (
            <>
              <div
                className={cn(
                  'absolute inset-0 flex items-center justify-center transition-opacity duration-500 ease-out',
                  collapsed ? 'opacity-100' : 'opacity-0 pointer-events-none'
                )}
              >
                {!isAdminUser && wlEnabled ? (
                  iconUrl ? <img src={iconUrl} alt="Icon" className="h-7 w-7 object-contain" /> : null
                ) : (
                  <>
                    <img src={iconePreto} alt="Logo" className="h-7 w-7 object-contain dark:hidden" />
                    <img src={iconeVerde} alt="Logo" className="h-7 w-7 object-contain hidden dark:block" />
                  </>
                )}
              </div>
              <div
                className={cn(
                  'absolute inset-0 flex items-center justify-center px-2 transition-opacity duration-500 ease-out',
                  collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
                )}
              >
                <img src={isAdminUser ? defaultLogoDark : logoUrl || defaultLogoDark} alt="Logo" className="max-h-11 w-auto max-w-full object-contain dark:hidden" />
                <img src={isAdminUser ? logoHorizontalVerde : logoUrl || logoHorizontalVerde} alt="Logo" className="max-h-11 w-auto max-w-full object-contain hidden dark:block" />
              </div>
            </>
          )}
        </NavLink>

        {isAdminUser && !collapsed && (
          <div className="flex items-center justify-center border-b border-border py-2 shrink-0">
            <span className="text-xs font-semibold text-destructive">{shellT.adminPanelLabel}</span>
          </div>
        )}

        {/* Lista de itens */}
        <div ref={menuScrollRef} className={cn('flex-1 overflow-y-auto pt-2', collapsed ? 'px-1.5' : 'px-4')}>
          <nav className="space-y-0.5">
            {activeMenu.map((item) => {
              if (item.children) {
                const visibleChildren = filterByAccess(item.children);
                if (visibleChildren.length === 0) return null;

                if (collapsed) {
                  const hasActiveChild = isSubmenuActive(visibleChildren);
                  return (
                    <Tooltip key={item.title}>
                      <TooltipTrigger asChild>
                        <button
                          title={tMenu(item.title)}
                          onClick={() => toggleMenu(item.title)}
                          className={cn(
                            COLLAPSED_ITEM,
                            hasActiveChild
                              ? 'bg-primary text-primary-foreground'
                              : 'text-sidebar-foreground hover:bg-primary hover:text-primary-foreground'
                          )}
                        >
                          <item.icon className={ICON_SIZE} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">{tMenu(item.title)}</TooltipContent>
                    </Tooltip>
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
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <item.icon className={ICON_SIZE} />
                        <span className="whitespace-nowrap overflow-hidden">{tMenu(item.title)}</span>
                      </div>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 transition-transform',
                          (openMenus.includes(item.title) || hasActiveSubmenu) && 'rotate-180'
                        )}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="ml-3 mt-0.5 space-y-0.5 border-l border-border/40 pl-3 overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 duration-200">
                      {visibleChildren.map((child) => (
                        <NavLink
                          key={child.path}
                          to={L(child.path)}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-200',
                              isActive
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-primary hover:text-primary-foreground'
                            )
                          }
                        >
                          <child.icon className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 truncate whitespace-nowrap">{tMenu(child.title)}</span>
                        </NavLink>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                );
              }

              if (collapsed) {
                return (
                  <Tooltip key={item.path}>
                    <TooltipTrigger asChild>
                      <NavLink
                        to={L(item.path!)}
                        title={tMenu(item.title)}
                        className={({ isActive }) =>
                          cn(
                            COLLAPSED_ITEM,
                            isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'text-sidebar-foreground hover:bg-primary hover:text-primary-foreground'
                          )
                        }
                      >
                        <item.icon className={ICON_SIZE} />
                      </NavLink>
                    </TooltipTrigger>
                    <TooltipContent side="right">{tMenu(item.title)}</TooltipContent>
                  </Tooltip>
                );
              }

              return (
                <NavLink
                  key={item.path}
                  to={L(item.path!)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg py-2.5 px-3 text-[13px] font-semibold tracking-[0.01em] transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-sidebar-foreground hover:bg-primary hover:text-primary-foreground'
                    )
                  }
                >
                  <item.icon className={ICON_SIZE} />
                  <span className="min-w-0 truncate whitespace-nowrap">{tMenu(item.title)}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* ============ FOOTER — Profile DropdownMenu + AccountSwitcher embaixo ============
            Padrão EcoSistema: card do avatar abre dropdown clássico
            (Perfil/Assinatura/Tema/Tutoriais Domiflix/Ajuda/Suporte). DENTRO do
            dropdown, no FUNDO, card horizontal envolvido pelo AccountSwitcherDropdown
            — click expande inline o próprio card revelando outras contas.
            Abaixo do DropdownMenu, botões Configurações + Sair (só no expanded). */}
        <div className={cn('border-t border-border shrink-0', collapsed ? 'p-1.5' : 'p-3')}>
          <div className={cn('flex flex-col', collapsed ? 'items-center gap-1' : 'gap-2')}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  ref={profileTriggerRef}
                  className={cn(
                    'min-w-0 flex items-center rounded-xl border border-border/60 hover:bg-muted/60 transition-colors text-left',
                    collapsed ? 'justify-center p-1.5' : 'w-full gap-3 px-2.5 py-2'
                  )}
                  aria-label={accountT.accountMenuAria}
                >
                  <Avatar className={cn('shrink-0', collapsed ? 'h-8 w-8' : 'h-9 w-9')}>
                    <AvatarImage src={profile?.avatar_url || undefined} alt={profileName} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  {!collapsed && (
                    <>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-[13px] font-semibold text-sidebar-foreground truncate leading-tight tracking-[0.01em]">
                            {profileName.split(' ').slice(0, 2).join(' ')}
                          </p>
                          {isCompanyAdmin && !isSuperAdmin && (
                            <Badge className="bg-green-600 hover:bg-green-600 text-white font-semibold text-[10px] px-1.5 py-0 gap-1 inline-flex">
                              <Crown className="h-2.5 w-2.5" />
                              MASTER
                            </Badge>
                          )}
                          {isSuperAdmin && (
                            <Badge className="bg-red-600 hover:bg-red-600 text-white font-semibold text-[10px] px-1.5 py-0">
                              ADMIN
                            </Badge>
                          )}
                        </div>
                        {user?.email && (
                          <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                            {user.email}
                          </p>
                        )}
                      </div>
                      <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    </>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side="top"
                /* Offset negativo dinâmico = dropdown desce EXATAMENTE a altura
                   do trigger (medida via ResizeObserver) e fica POR CIMA do
                   botão de avatar do rodapé. Cobre 100% independente do estado
                   collapsed, da presença de email, ou tamanho do nome. */
                sideOffset={-profileTriggerHeight}
                alignOffset={0}
                className="w-80 z-50 p-1.5"
              >
                {!isAdminUser && (
                  <>
                    <DropdownMenuItem
                      onClick={() => navigate(L('/perfil'))}
                      className="cursor-pointer text-[13px] font-semibold tracking-[0.01em] text-sidebar-foreground rounded-lg py-2.5 px-3 focus:bg-primary focus:text-primary-foreground hover:!bg-primary hover:!text-primary-foreground"
                    >
                      <User className="h-5 w-5 mr-3 shrink-0" />
                      {accountT.profile}
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => navigate(L('/assinatura'))}
                      className="cursor-pointer text-[13px] font-semibold tracking-[0.01em] text-sidebar-foreground rounded-lg py-2.5 px-3 focus:bg-primary focus:text-primary-foreground hover:!bg-primary hover:!text-primary-foreground"
                    >
                      <CreditCard className="h-5 w-5 mr-3 shrink-0" />
                      {accountT.subscription}
                    </DropdownMenuItem>

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="cursor-pointer text-[13px] font-semibold tracking-[0.01em] text-sidebar-foreground rounded-lg py-2.5 px-3 focus:bg-primary focus:text-primary-foreground data-[state=open]:bg-primary data-[state=open]:text-primary-foreground hover:!bg-primary hover:!text-primary-foreground">
                        {theme === 'dark' ? <Moon className="h-5 w-5 mr-3 shrink-0" /> : <Sun className="h-5 w-5 mr-3 shrink-0" />}
                        {accountT.theme}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent className="w-40 p-1.5">
                          <DropdownMenuItem
                            onClick={() => applyTheme('light')}
                            className="cursor-pointer text-[13px] font-semibold tracking-[0.01em] text-sidebar-foreground rounded-lg py-2.5 px-3 focus:bg-primary focus:text-primary-foreground hover:!bg-primary hover:!text-primary-foreground"
                          >
                            <Sun className="h-5 w-5 mr-3 shrink-0" />
                            {accountT.themeLight}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => applyTheme('dark')}
                            className="cursor-pointer text-[13px] font-semibold tracking-[0.01em] text-sidebar-foreground rounded-lg py-2.5 px-3 focus:bg-primary focus:text-primary-foreground hover:!bg-primary hover:!text-primary-foreground"
                          >
                            <Moon className="h-5 w-5 mr-3 shrink-0" />
                            {accountT.themeDark}
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>

                    <DropdownMenuSeparator />

                    {/* Tutoriais Domiflix — hover vermelho Netflix HARDCODED.
                        Independe de white-label (cor da marca Domiflix). */}
                    <DropdownMenuItem
                      onClick={() => navigate('/domiflix')}
                      className="cursor-pointer text-[13px] font-semibold tracking-[0.01em] text-sidebar-foreground rounded-lg py-2.5 px-3 focus:bg-[#E50914] focus:text-white hover:!bg-[#E50914] hover:!text-white"
                    >
                      <Video className="h-5 w-5 mr-3 shrink-0" />
                      {accountT.tutorials}
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => setHelpOpen(true)}
                      className="cursor-pointer text-[13px] font-semibold tracking-[0.01em] text-sidebar-foreground rounded-lg py-2.5 px-3 focus:bg-primary focus:text-primary-foreground hover:!bg-primary hover:!text-primary-foreground"
                    >
                      <HelpCircle className="h-5 w-5 mr-3 shrink-0" />
                      {accountT.helpCenter}
                    </DropdownMenuItem>

                    {/* Falar com o Suporte — hover verde WhatsApp HARDCODED.
                        Independe de white-label (cor da marca WhatsApp). */}
                    <DropdownMenuItem
                      onClick={() => window.open(getWhatsAppSupportUrl(), '_blank')}
                      className="cursor-pointer text-[13px] font-semibold tracking-[0.01em] text-sidebar-foreground rounded-lg py-2.5 px-3 focus:bg-[#25D366] focus:text-white hover:!bg-[#25D366] hover:!text-white"
                    >
                      <WhatsAppIcon className="h-5 w-5 mr-3 shrink-0 fill-current" />
                      {accountT.support}
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />
                  </>
                )}

                {/* Card horizontal no FUNDO — expansão INLINE via AccountSwitcherDropdown.
                    Mostra avatar + nome + badges (MASTER/ADMIN) + email + chevron.
                    Click expande o próprio card revelando outras contas salvas. */}
                <AccountSwitcherDropdown>
                  <div
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 rounded-md transition-colors text-left cursor-pointer"
                    aria-label={accountT.switchAccountAria}
                  >
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarImage src={profile?.avatar_url || undefined} alt={profileName} />
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-[13px] font-semibold text-foreground truncate leading-tight">
                          {profileName.split(' ').slice(0, 2).join(' ')}
                        </p>
                        {isCompanyAdmin && !isSuperAdmin && (
                          <Badge className="bg-green-600 hover:bg-green-600 text-white font-semibold text-[10px] px-1.5 py-0 gap-1 inline-flex">
                            <Crown className="h-2.5 w-2.5" />
                            MASTER
                          </Badge>
                        )}
                        {isSuperAdmin && (
                          <Badge className="bg-red-600 hover:bg-red-600 text-white font-semibold text-[10px] px-1.5 py-0">
                            ADMIN
                          </Badge>
                        )}
                      </div>
                      {user?.email && (
                        <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                          {user.email}
                        </p>
                      )}
                    </div>
                    <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </AccountSwitcherDropdown>
              </DropdownMenuContent>
            </DropdownMenu>

            {!collapsed && (
              <div className="flex gap-2 w-full">
                <button
                  type="button"
                  onClick={() => navigate(isAdminUser ? '/admin/configuracoes' : L('/configuracoes'))}
                  aria-label={accountT.settings}
                  className="flex-[3] h-9 flex items-center justify-center gap-2 rounded-md text-[13px] font-semibold text-sidebar-foreground hover:bg-gradient-to-r hover:from-gray-800 hover:to-gray-900 hover:text-white transition-colors duration-300"
                >
                  <SettingsIcon className="h-4 w-4 shrink-0" />
                  <span>{accountT.settings}</span>
                </button>
                <button
                  type="button"
                  onClick={() => signOut()}
                  aria-label={accountT.logout}
                  className="flex-[2] h-9 flex items-center justify-center gap-2 rounded-md text-[13px] font-semibold text-red-600 hover:bg-red-600 hover:text-white transition-colors"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  <span>{accountT.logout}</span>
                </button>
              </div>
            )}
            {collapsed && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => signOut()}
                    aria-label={accountT.logout}
                    className="h-8 w-8 flex items-center justify-center rounded-lg text-red-600 hover:bg-red-600 hover:text-white transition-colors"
                  >
                    <LogOut className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{accountT.logout}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </TooltipProvider>

      <HelpCenterDrawer open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}

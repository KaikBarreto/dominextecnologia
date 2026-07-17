import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  Calendar,
  Users,
  Package,
  DollarSign,
  FileText,
  Receipt,
  FileBarChart,
  CalendarClock,
  History as HistoryIcon,
  Settings as SettingsIcon,
  UserCircle,
  TrendingUp,
  Wrench,
  ChevronDown,
  ChevronsUpDown,
  Briefcase,
  CreditCard,
  Building2,
  Map,
  Target,
  FolderOpen,
  Boxes,
  ScrollText,
  Clock,
  LogOut,
  Sun,
  Moon,
  HelpCircle,
  Clapperboard,
  Crown,
  Video,
} from 'lucide-react';
import { OperacionalIcon, AreaTecnicoIcon } from '@/components/icons/MenuIcons';
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { useAuth } from '@/contexts/AuthContext';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { translateMenuLabel } from '@/components/layout/shellLabels';
import { useCompanyModules, type ModuleCode } from '@/hooks/useCompanyModules';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { segmentHasTechTools } from '@/config/technicianArea';
import { ROLE_LABELS } from '@/hooks/useUsers';
import { HelpCenterDrawer } from '@/components/layout/HelpCenterDrawer';
import { AccountSwitcherDropdown } from '@/components/account-switcher/AccountSwitcherDropdown';
import { SystemFooter } from '@/components/layout/SystemFooter';
import { getRandomWhatsAppNumber } from '@/components/landing/whatsappNumbers';
import { podeAcessarDomiflixAdmin } from '@/lib/adminDomiflixAccess';
import { cn } from '@/lib/utils';

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
      { title: 'Contratos', icon: ScrollText, path: '/contratos', screenKey: 'screen:contracts' },
      { title: 'Funcionários', icon: Briefcase, path: '/funcionarios', screenKey: 'screen:employees', moduleKey: 'rh' },
      { title: 'Estoque', icon: Package, path: '/estoque', screenKey: 'screen:inventory' },
    ],
  },
  { title: 'CRM', icon: TrendingUp, path: '/crm', screenKey: 'screen:crm', moduleKey: 'crm' },
  {
    title: 'Financeiro',
    icon: DollarSign,
    children: [
      { title: 'Visão Geral', icon: FileBarChart, path: '/financeiro/relatorio', screenKey: 'screen:finance' },
      { title: 'Movimentações Financeiras', icon: HistoryIcon, path: '/financeiro/movimentacoes', screenKey: 'screen:finance' },
      { title: 'Contas a Pagar/Receber', icon: CalendarClock, path: '/financeiro/contas', screenKey: 'screen:finance', moduleKey: 'finance_advanced' },
      { title: 'Notas Fiscais', icon: Receipt, path: '/notas-fiscais', screenKey: 'screen:fiscal_notes', moduleKey: 'nfe' },
    ],
  },
  // Configurações intencionalmente fora da lista — já existe botão dedicado
  // no footer do drawer (mesmo destino), evitando duplicidade visual.
];

const adminMenuItems: (MenuItem & { masterOnly?: boolean })[] = [
  { title: 'Dashboard', icon: LayoutDashboard, path: '/admin/dashboard', screenKey: 'admin_dashboard' },
  { title: 'CRM/Tarefas', icon: Target, path: '/admin/crm', screenKey: 'admin_crm' },
  { title: 'Empresas', icon: Building2, path: '/admin/empresas', screenKey: 'admin_empresas' },
  { title: 'Vendedores', icon: Briefcase, path: '/admin/vendedores', screenKey: 'admin_vendedores' },
  { title: 'Financeiro', icon: DollarSign, path: '/admin/financeiro', screenKey: 'admin_financeiro' },
  { title: 'Domiflix', icon: Clapperboard, path: '/admin/domiflix', masterOnly: true },
  // Configurações intencionalmente fora da lista — botão dedicado no footer.
];

// Número sorteado no CLIQUE (rodízio de números do suporte).
const getWhatsAppSupportUrl = () => `https://wa.me/${getRandomWhatsAppNumber()}`;

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={cn('h-5 w-5 fill-current shrink-0', className)}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

interface MoreMenuDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Bottom sheet do mobile com TODOS os itens que não cabem nos 5 slots do
 * `MobileBottomNav`. 3 seções verticais: header, lista (scrollable), footer.
 *
 * Decide internamente entre menu de tenant e menu admin (igual `SidebarMenuContent`).
 * Tema é toggle simples (Claro/Escuro) sem opção "Sistema" — alinhado com o
 * que o Dominex já fazia no AppSidebar antigo.
 */
export function MoreMenuDrawer({ open, onOpenChange }: MoreMenuDrawerProps) {
  const { locale } = useAppLocaleContext();
  const accountT = MESSAGES[locale].app.shell.account;
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[90vh] max-h-[90vh] bg-background border-0 rounded-t-2xl p-0">
        <VisuallyHidden asChild>
          <DrawerTitle>{accountT.menuTitle}</DrawerTitle>
        </VisuallyHidden>
        <VisuallyHidden asChild>
          <DrawerDescription>{accountT.menuDescription}</DrawerDescription>
        </VisuallyHidden>

        <div className="flex flex-col h-full min-h-0">
          <MoreMenuHeader />
          <MoreMenuList onClose={() => onOpenChange(false)} />
          <MoreMenuFooter onClose={() => onOpenChange(false)} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ============================================================
// HEADER — card com avatar + nome + badge + empresa
// ============================================================
function MoreMenuHeader() {
  const { user, profile, roles, isAdminUser } = useAuth();
  const { settings } = useCompanySettings();
  const { locale } = useAppLocaleContext();
  const shellT = MESSAGES[locale].app.shell;

  const profileName = profile?.full_name?.trim() || user?.email?.split('@')[0] || shellT.defaultUserName;
  const initials = profileName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

  const isSuperAdmin = roles.includes('super_admin');
  const roleLabel = isAdminUser
    ? (isSuperAdmin ? shellT.roles.auctusAdmin : shellT.roles.admin)
    : roles.length > 0
      ? ROLE_LABELS[roles[0] as keyof typeof ROLE_LABELS]
      : shellT.roles.user;

  const isCompanyAdmin = roles.includes('admin');

  return (
    <div className="shrink-0 px-4 pt-3 pb-3 border-b border-border bg-background">
      {/* Card horizontal envolvido por AccountSwitcherDropdown — click expande
          INLINE revelando outras contas (padrão EcoSistema). Substitui o card
          estático antigo + AccountSwitcherInline separado. */}
      <AccountSwitcherDropdown>
        <div
          className="w-full flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors cursor-pointer"
          aria-label={shellT.account.switchAccountAria}
        >
          <Avatar className="h-11 w-11 shrink-0">
            <AvatarImage src={profile?.avatar_url || undefined} alt={profileName} />
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground truncate leading-tight">
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
            {!isAdminUser && settings?.name && (
              <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                {settings.name}
              </p>
            )}
            {isAdminUser && (
              <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                {roleLabel}
              </p>
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>
      </AccountSwitcherDropdown>
    </div>
  );
}

// ============================================================
// LIST — itens do menu (filtrados) + atalhos da Conta
// ============================================================
function MoreMenuList({ onClose }: { onClose: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, hasScreenAccess, hasAdminScreenAccess, isAdminUser, roles } = useAuth();
  const { hasModule } = useCompanyModules();
  const { settings } = useCompanySettings();
  const { locale } = useAppLocaleContext();
  const shellT = MESSAGES[locale].app.shell;
  const accountT = shellT.account;
  const tMenu = (title: string) => translateMenuLabel(title, shellT);
  const [openMenus, setOpenMenus] = useState<string[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);

  const toggleMenu = (label: string) => {
    setOpenMenus((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]));
  };

  const isSuperAdmin = roles.includes('super_admin');

  const filterByAccess = <T extends { screenKey?: string; moduleKey?: ModuleCode; requiresSegment?: string; requiresTechTools?: boolean }>(items: T[]): T[] => {
    return items.filter((item) => {
      if (item.screenKey && !hasScreenAccess(item.screenKey)) return false;
      if (item.moduleKey && !hasModule(item.moduleKey)) return false;
      if (item.requiresSegment && settings?.segment !== item.requiresSegment) return false;
      if (item.requiresTechTools && !segmentHasTechTools(settings?.segment)) return false;
      return true;
    });
  };

  const filteredAdminMenu = (isSuperAdmin
    ? adminMenuItems
    : adminMenuItems.filter((item) => !item.masterOnly && item.screenKey && hasAdminScreenAccess(item.screenKey))
  )
    // Gate temporário do Domiflix admin: restrito ao e-mail allowlistado
    // (defesa de UI; segurança real é RLS + guard de rota em App.tsx).
    // Aplicado por `path` pra independer de screenKey/masterOnly.
    .filter((item) => item.path !== '/admin/domiflix' || podeAcessarDomiflixAdmin(user?.email));

  const visibleItems = isAdminUser
    ? filteredAdminMenu
    : filterByAccess(tenantMenuItems)
        .map((item) => (item.children ? { ...item, children: filterByAccess(item.children) } : item))
        .filter((item) => !item.children || item.children.length > 0);

  const handleNavigate = (path: string) => {
    onClose();
    navigate(path);
  };

  // `hoverVariant` controla a cor de hover de cada item:
  //   - "default":   hover verde primary (mesmo do active state)
  //   - "domiflix":  hover vermelho Netflix (#E50914) — hardcoded
  //   - "whatsapp":  hover verde WhatsApp (#25D366) — hardcoded
  type HoverVariant = 'default' | 'domiflix' | 'whatsapp';
  const accountShortcuts: Array<{
    icon: React.ElementType;
    label: string;
    onClick: () => void;
    hoverVariant?: HoverVariant;
  }> = isAdminUser
    ? []
    : [
        { icon: UserCircle, label: accountT.profile, onClick: () => handleNavigate('/perfil') },
        { icon: CreditCard, label: accountT.subscription, onClick: () => handleNavigate('/assinatura') },
        {
          icon: Video,
          label: accountT.tutorials,
          onClick: () => handleNavigate('/domiflix'),
          hoverVariant: 'domiflix',
        },
        {
          icon: HelpCircle,
          label: accountT.helpCenter,
          onClick: () => setHelpOpen(true),
        },
        {
          icon: WhatsAppIcon,
          label: accountT.support,
          onClick: () => {
            onClose();
            window.open(getWhatsAppSupportUrl(), '_blank');
          },
          hoverVariant: 'whatsapp',
        },
      ];

  const hoverClassFor = (variant: HoverVariant = 'default') => {
    switch (variant) {
      case 'domiflix':
        return 'hover:bg-[#E50914] hover:text-white';
      case 'whatsapp':
        return 'hover:bg-[#25D366] hover:text-white';
      case 'default':
      default:
        return 'hover:bg-primary hover:text-primary-foreground';
    }
  };

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {/* Lista principal */}
        <nav className="space-y-1">
          {visibleItems.map((item) => {
            // Item com submenu — Collapsible
            if (item.children) {
              const visibleSubmenu = filterByAccess(item.children);
              if (visibleSubmenu.length === 0) return null;

              const Icon = item.icon;
              const isOpen = openMenus.includes(item.title);
              const hasActiveSubmenu = visibleSubmenu.some(
                (s) => s.path && (location.pathname === s.path || location.pathname.startsWith(s.path + '/'))
              );

              return (
                <Collapsible key={item.title} open={isOpen} onOpenChange={() => toggleMenu(item.title)}>
                  <CollapsibleTrigger
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm font-semibold transition-colors',
                      hasActiveSubmenu
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground hover:bg-primary hover:text-primary-foreground'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 shrink-0" />
                      <span>{tMenu(item.title)}</span>
                    </div>
                    <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="ml-4 mt-1 space-y-0.5 border-l border-border pl-3 overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-top-1 data-[state=open]:slide-in-from-top-1 duration-200">
                    {visibleSubmenu.map((sub) => {
                      const SubIcon = sub.icon;
                      return (
                        <NavLink
                          key={sub.path}
                          to={sub.path!}
                          onClick={onClose}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                              isActive
                                ? 'bg-primary text-primary-foreground font-medium'
                                : 'text-muted-foreground hover:bg-primary hover:text-primary-foreground'
                            )
                          }
                        >
                          <SubIcon className="h-4 w-4 shrink-0" />
                          <span>{tMenu(sub.title)}</span>
                        </NavLink>
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>
              );
            }

            // Item simples (sem submenu)
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path!}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-primary hover:text-primary-foreground'
                  )
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span>{tMenu(item.title)}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Atalhos de Conta — só pra tenant */}
        {accountShortcuts.length > 0 && (
          <>
            <div className="my-4 border-t border-border" />
            <div className="px-1 pb-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-2">
                {accountT.section}
              </p>
              <nav className="space-y-1">
                {accountShortcuts.map((shortcut) => {
                  const Icon = shortcut.icon;
                  return (
                    <button
                      key={shortcut.label}
                      type="button"
                      onClick={shortcut.onClick}
                      className={cn(
                        'w-full flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-foreground transition-colors text-left',
                        hoverClassFor(shortcut.hoverVariant),
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="flex-1">{shortcut.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </>
        )}
      </div>

      <HelpCenterDrawer open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}

// ============================================================
// FOOTER — toggle tema + Configurações + Sair
// ============================================================
function MoreMenuFooter({ onClose }: { onClose: () => void }) {
  const { signOut, isAdminUser } = useAuth();
  const navigate = useNavigate();
  const { locale } = useAppLocaleContext();
  const accountT = MESSAGES[locale].app.shell.account;
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

  const handleLogout = async () => {
    onClose();
    await signOut();
  };

  const handleSettings = () => {
    onClose();
    navigate(isAdminUser ? '/admin/configuracoes' : '/configuracoes');
  };

  const themeOptions: Array<{ value: 'light' | 'dark'; icon: React.ElementType; label: string }> = [
    { value: 'light', icon: Sun, label: accountT.themeLight },
    { value: 'dark', icon: Moon, label: accountT.themeDark },
  ];

  return (
    <div className="shrink-0 border-t border-border bg-background px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
      <div className="flex items-end gap-2">
        {/* Toggle de tema — só pra usuários de tenant (admin é forçado light) */}
        {!isAdminUser && (
          <div className="w-28 shrink-0 flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80 px-0.5">
              {accountT.theme}
            </span>
            <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1">
              {themeOptions.map((opt) => {
                const Icon = opt.icon;
                const isActive = theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => applyTheme(opt.value)}
                    aria-label={`${accountT.theme} ${opt.label}`}
                    title={opt.label}
                    className={cn(
                      'flex-1 flex items-center justify-center rounded-lg py-2 transition-colors',
                      isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
            <span className="text-[10px] text-muted-foreground/70 px-0.5 leading-none">
              {themeOptions.find((o) => o.value === theme)?.label}
            </span>
          </div>
        )}

        <Button
          type="button"
          onClick={handleSettings}
          variant="outline"
          className="flex-1 h-11 px-3 gap-2 shrink mb-[14px]"
          aria-label={accountT.settings}
        >
          <SettingsIcon className="h-4 w-4 shrink-0" />
          <span className="text-sm font-semibold">{accountT.settings}</span>
        </Button>

        <Button
          type="button"
          onClick={handleLogout}
          variant="destructive"
          className="h-11 px-4 gap-2 shrink-0 mb-[14px]"
        >
          <LogOut className="h-4 w-4" />
          <span className="text-sm font-semibold">{accountT.logout}</span>
        </Button>
      </div>

      <div className="mt-2 pt-2 border-t border-border/60">
        <SystemFooter />
      </div>
    </div>
  );
}

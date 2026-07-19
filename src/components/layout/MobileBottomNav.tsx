import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  CalendarDays,
  Users,
  Menu,
  Target,
  Building2,
  Briefcase,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { localizeAppPath } from '@/lib/i18n/appRouteSlugs';
import { translateMenuLabel } from '@/components/layout/shellLabels';
import { MoreMenuDrawer } from './MoreMenuDrawer';

/** Keys de `app.shell.bottomNav` — rótulos CURTOS do bottom nav do tenant. */
type BottomNavKey = 'home' | 'serviceOrders' | 'schedule' | 'customers' | 'menu';

interface NavItem {
  icon: React.ElementType;
  /** Rótulo pt-br (fallback). Traduzido via `bottomNavKey` (tenant) ou o menu (admin). */
  label: string;
  /** Key do rótulo curto (bottom nav do tenant). Admin traduz `label` pelo menu. */
  bottomNavKey?: BottomNavKey;
  path?: string;
  action?: 'openMore';
  special?: boolean;
  /** Chave em admin_permissions (só itens admin). Sem chave = sempre visível. */
  screenKey?: string;
}

/**
 * Bottom nav mobile (<1024px) — 5 slots.
 *
 * Tenant (não-admin):
 *   Início | OS | Agenda(FAB) | Clientes | Menu
 *
 * Admin (painel master Auctus):
 *   Dashboard | CRM/Tarefas | Empresas(FAB) | Vendedores | Menu
 *
 * Customização-chave vs EcoSistema: o FAB central NÃO abre um arco de quick
 * actions. Vira botão simples que navega direto. Decisão do Kaik.
 *
 * O slot Menu (último) abre o `<MoreMenuDrawer />`, que já diferencia
 * admin/tenant internamente.
 */
const tenantNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Início', bottomNavKey: 'home', path: '/dashboard' },
  { icon: ClipboardList, label: 'OS', bottomNavKey: 'serviceOrders', path: '/ordens-servico' },
  { icon: CalendarDays, label: 'Agenda', bottomNavKey: 'schedule', path: '/agenda', special: true },
  { icon: Users, label: 'Clientes', bottomNavKey: 'customers', path: '/clientes' },
  { icon: Menu, label: 'Menu', bottomNavKey: 'menu', action: 'openMore' },
];

// Labels/paths/screenKeys/ícones espelham ADMIN_MENU_ITEMS de AdminSidebarNav.
// FAB central = Empresas (admin_empresas). O slot Menu nunca tem screenKey.
const adminNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/admin/dashboard', screenKey: 'admin_dashboard' },
  { icon: Target, label: 'CRM/Tarefas', path: '/admin/crm', screenKey: 'admin_crm' },
  { icon: Building2, label: 'Empresas', path: '/admin/empresas', special: true, screenKey: 'admin_empresas' },
  { icon: Briefcase, label: 'Vendedores', path: '/admin/vendedores', screenKey: 'admin_vendedores' },
  { icon: Menu, label: 'Menu', bottomNavKey: 'menu', action: 'openMore' },
];

const triggerHaptic = () => {
  if ('vibrate' in navigator) navigator.vibrate(10);
};

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdminUser, hasAdminScreenAccess } = useAuth();
  const { locale } = useAppLocaleContext();
  const shellT = MESSAGES[locale].app.shell;
  const [moreOpen, setMoreOpen] = useState(false);
  // Localiza o path do item pro slug do idioma do usuário (admin fica intacto).
  const L = (path: string) => localizeAppPath(path, locale);

  // Rótulo curto do tenant vem de `bottomNav`; o resto (admin) traduz pelo menu.
  const labelFor = (item: NavItem) =>
    item.bottomNavKey ? shellT.bottomNav[item.bottomNavKey] : translateMenuLabel(item.label, shellT);

  // Fecha o drawer ao trocar de rota.
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  const isActive = (path?: string) => {
    if (!path) return false;
    const lp = L(path);
    return location.pathname === lp || location.pathname.startsWith(lp + '/');
  };

  // Monta a lista de itens conforme o contexto.
  let navItems: NavItem[];
  if (isAdminUser) {
    // Segurança/permissão: vendedor com permissões admin parciais só vê as
    // telas a que tem acesso (mesma régua do AdminSidebarNav). O slot Menu não
    // tem screenKey, então sempre permanece.
    const filtered = adminNavItems
      .filter((item) => !item.screenKey || hasAdminScreenAccess(item.screenKey))
      .map((item) => ({ ...item })); // cópia: nunca mutar os objetos compartilhados
    // Fallback do FAB: se Empresas (o `special` original) foi filtrado por falta
    // de permissão, promovemos o primeiro item navegável que sobrou a FAB
    // central pra barra nunca ficar sem botão de destaque.
    const hasSpecial = filtered.some((item) => item.special);
    if (!hasSpecial) {
      const firstNav = filtered.find((item) => item.path);
      if (firstNav) firstNav.special = true;
    }
    navItems = filtered;
  } else {
    navItems = tenantNavItems;
  }

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-background border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="relative flex items-center justify-around px-0.5 py-2">
          {navItems.map((item) => {
            // FAB Agenda: botão grande, redondo, elevado.
            if (item.special) {
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    triggerHaptic();
                    navigate(L(item.path!));
                  }}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/30 active:scale-90 transition-transform -translate-y-4"
                  aria-label={labelFor(item)}
                >
                  <item.icon className="h-7 w-7 text-primary-foreground" />
                </button>
              );
            }

            // Slot "Menu" — abre MoreMenuDrawer
            if (item.action === 'openMore') {
              const moreActive = moreOpen;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    triggerHaptic();
                    setMoreOpen(true);
                  }}
                  className="flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl transition-all duration-200 active:scale-90"
                >
                  <div
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-300',
                      moreActive && 'bg-primary'
                    )}
                  >
                    <item.icon
                      className={cn(
                        'h-5 w-5 transition-all duration-300',
                        moreActive ? 'text-primary-foreground scale-110' : 'text-foreground'
                      )}
                    />
                  </div>
                  <span
                    className={cn(
                      'text-xs font-medium transition-all duration-300',
                      moreActive ? 'text-primary' : 'text-foreground'
                    )}
                  >
                    {labelFor(item)}
                  </span>
                </button>
              );
            }

            // Slots normais (Início, OS, Clientes)
            const active = isActive(item.path);
            return (
              <NavLink
                key={item.path}
                to={L(item.path!)}
                onClick={triggerHaptic}
                className="flex flex-col items-center justify-center gap-0.5 px-1.5 py-1.5 rounded-xl transition-all duration-200 active:scale-90"
              >
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-300',
                    active && 'bg-primary'
                  )}
                >
                  <item.icon
                    className={cn(
                      'h-5 w-5 transition-all duration-300',
                      active ? 'text-primary-foreground scale-110' : 'text-foreground'
                    )}
                  />
                </div>
                <span
                  className={cn(
                    'text-[10px] font-medium transition-all duration-300',
                    active ? 'text-primary' : 'text-foreground'
                  )}
                >
                  {labelFor(item)}
                </span>
                <div
                  className={cn(
                    'h-1 w-1 rounded-full bg-primary transition-all duration-300',
                    active ? 'opacity-100 scale-100' : 'opacity-0 scale-0'
                  )}
                />
              </NavLink>
            );
          })}
        </div>
      </nav>

      <MoreMenuDrawer open={moreOpen} onOpenChange={setMoreOpen} />
    </>
  );
}

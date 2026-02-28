import {
  LayoutDashboard,
  ClipboardList,
  Calendar,
  Users,
  Package,
  DollarSign,
  FileText,
  Settings,
  LogOut,
  UserCircle,
  TrendingUp,
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import logoDark from '@/assets/logo-dark.png';
import logoWhite from '@/assets/logo-white.png';

const mainMenuItems = [
  { title: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', roles: ['admin', 'gestor', 'tecnico', 'comercial', 'financeiro'] },
  { title: 'Ordens de Serviço', icon: ClipboardList, path: '/ordens-servico', roles: ['admin', 'gestor', 'tecnico'] },
  { title: 'Agenda', icon: Calendar, path: '/agenda', roles: ['admin', 'gestor', 'tecnico'] },
  { title: 'Clientes', icon: Users, path: '/clientes', roles: ['admin', 'gestor', 'comercial'] },
  { title: 'CRM', icon: TrendingUp, path: '/crm', roles: ['admin', 'gestor', 'comercial'] },
  { title: 'Estoque', icon: Package, path: '/estoque', roles: ['admin', 'gestor'] },
  { title: 'Financeiro', icon: DollarSign, path: '/financeiro', roles: ['admin', 'gestor', 'financeiro'] },
  { title: 'PMOC', icon: FileText, path: '/pmoc', roles: ['admin', 'gestor'] },
];

const secondaryMenuItems = [
  { title: 'Usuários', icon: UserCircle, path: '/usuarios', roles: ['admin'] },
  { title: 'Configurações', icon: Settings, path: '/configuracoes', roles: ['admin'] },
];

export function AppSidebar() {
  const { profile, roles, signOut, hasRole } = useAuth();
  const location = useLocation();

  const filterMenuByRole = (items: typeof mainMenuItems) => {
    if (roles.length === 0) return items;
    return items.filter((item) =>
      item.roles.some((role) => hasRole(role as any))
    );
  };

  const filteredMainMenu = filterMenuByRole(mainMenuItems);
  const filteredSecondaryMenu = filterMenuByRole(secondaryMenuItems);

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center justify-center px-4 py-4">
          {/* Show white logo on dark sidebar (default), dark logo would be for light sidebar */}
          <img 
            src={logoWhite} 
            alt="Glacial Cold Brasil" 
            className="h-10 w-auto"
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-widest text-sidebar-foreground/50 font-semibold mb-1">
            Menu Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredMainMenu.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={isActive 
                        ? 'bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground font-semibold'
                        : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                      }
                    >
                      <NavLink to={item.path}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {filteredSecondaryMenu.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs uppercase tracking-widest text-sidebar-foreground/50 font-semibold mb-1">
              Administração
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredSecondaryMenu.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        className={isActive 
                          ? 'bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground font-semibold'
                          : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                        }
                      >
                        <NavLink to={item.path}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={signOut}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {profile && (
          <div className="px-4 py-3">
            <p className="text-sm font-semibold text-sidebar-foreground">
              {profile.full_name}
            </p>
            <p className="text-xs text-sidebar-foreground/60">
              {roles.length > 0 ? roles.join(', ') : 'Sem perfil'}
            </p>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

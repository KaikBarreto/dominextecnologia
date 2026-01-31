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
  Snowflake,
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
import { cn } from '@/lib/utils';

const mainMenuItems = [
  {
    title: 'Dashboard',
    icon: LayoutDashboard,
    path: '/dashboard',
    roles: ['admin', 'gestor', 'tecnico', 'comercial', 'financeiro'],
  },
  {
    title: 'Ordens de Serviço',
    icon: ClipboardList,
    path: '/ordens-servico',
    roles: ['admin', 'gestor', 'tecnico'],
  },
  {
    title: 'Agenda',
    icon: Calendar,
    path: '/agenda',
    roles: ['admin', 'gestor', 'tecnico'],
  },
  {
    title: 'Clientes',
    icon: Users,
    path: '/clientes',
    roles: ['admin', 'gestor', 'comercial'],
  },
  {
    title: 'CRM',
    icon: TrendingUp,
    path: '/crm',
    roles: ['admin', 'gestor', 'comercial'],
  },
  {
    title: 'Estoque',
    icon: Package,
    path: '/estoque',
    roles: ['admin', 'gestor'],
  },
  {
    title: 'Financeiro',
    icon: DollarSign,
    path: '/financeiro',
    roles: ['admin', 'gestor', 'financeiro'],
  },
  {
    title: 'PMOC',
    icon: FileText,
    path: '/pmoc',
    roles: ['admin', 'gestor'],
  },
];

const secondaryMenuItems = [
  {
    title: 'Usuários',
    icon: UserCircle,
    path: '/usuarios',
    roles: ['admin'],
  },
  {
    title: 'Configurações',
    icon: Settings,
    path: '/configuracoes',
    roles: ['admin'],
  },
];

export function AppSidebar() {
  const { profile, roles, signOut, hasRole } = useAuth();
  const location = useLocation();

  const filterMenuByRole = (items: typeof mainMenuItems) => {
    if (roles.length === 0) return items; // Show all if no roles (for demo)
    return items.filter((item) =>
      item.roles.some((role) => hasRole(role as any))
    );
  };

  const filteredMainMenu = filterMenuByRole(mainMenuItems);
  const filteredSecondaryMenu = filterMenuByRole(secondaryMenuItems);

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary">
            <Snowflake className="h-6 w-6 text-sidebar-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-sidebar-foreground">
              Glacial Cold
            </span>
            <span className="text-xs text-sidebar-foreground/70">
              Brasil
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredMainMenu.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.path}
                  >
                    <NavLink to={item.path}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {filteredSecondaryMenu.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Administração</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredSecondaryMenu.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      asChild
                      isActive={location.pathname === item.path}
                    >
                      <NavLink to={item.path}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
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
            <p className="text-sm font-medium text-sidebar-foreground">
              {profile.full_name}
            </p>
            <p className="text-xs text-sidebar-foreground/70">
              {roles.length > 0 ? roles.join(', ') : 'Sem perfil'}
            </p>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

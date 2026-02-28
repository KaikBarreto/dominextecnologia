import { useState } from 'react';
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
  Wrench,
  ChevronDown,
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS } from '@/hooks/useUsers';
import logoDark from '@/assets/logo-dark.png';
import { cn } from '@/lib/utils';

interface MenuItem {
  title: string;
  icon: any;
  path?: string;
  roles: string[];
  children?: { title: string; icon: any; path: string; roles: string[] }[];
}

const menuItems: MenuItem[] = [
  { title: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', roles: ['admin', 'gestor', 'tecnico', 'comercial', 'financeiro'] },
  {
    title: 'Serviços',
    icon: Wrench,
    roles: ['admin', 'gestor', 'tecnico'],
    children: [
      { title: 'Ordens de Serviço', icon: ClipboardList, path: '/ordens-servico', roles: ['admin', 'gestor', 'tecnico'] },
      { title: 'PMOC', icon: FileText, path: '/pmoc', roles: ['admin', 'gestor'] },
    ],
  },
  { title: 'Agenda', icon: Calendar, path: '/agenda', roles: ['admin', 'gestor', 'tecnico'] },
  { title: 'Clientes', icon: Users, path: '/clientes', roles: ['admin', 'gestor', 'comercial'] },
  { title: 'CRM', icon: TrendingUp, path: '/crm', roles: ['admin', 'gestor', 'comercial'] },
  { title: 'Estoque', icon: Package, path: '/estoque', roles: ['admin', 'gestor'] },
  { title: 'Financeiro', icon: DollarSign, path: '/financeiro', roles: ['admin', 'gestor', 'financeiro'] },
  { title: 'Usuários', icon: UserCircle, path: '/usuarios', roles: ['admin'] },
  { title: 'Configurações', icon: Settings, path: '/configuracoes', roles: ['admin'] },
];

const activeClass = 'bg-primary text-white hover:bg-primary hover:text-white font-semibold';
const inactiveClass = 'text-foreground/70 hover:bg-primary hover:text-white';

export function AppSidebar() {
  const { profile, roles, signOut, hasRole } = useAuth();
  const location = useLocation();

  const filterByRole = (items: { roles: string[] }[]) => {
    if (roles.length === 0) return items;
    return items.filter((item) => item.roles.some((role) => hasRole(role as any)));
  };

  const filteredMenu = filterByRole(menuItems) as MenuItem[];

  const isChildActive = (children?: MenuItem['children']) =>
    children?.some((c) => location.pathname === c.path) ?? false;

  const roleLabel = roles.length > 0 ? ROLE_LABELS[roles[0] as keyof typeof ROLE_LABELS] : 'Usuário';
  const initials = profile?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

  return (
    <Sidebar className="border-r border-border bg-background">
      <SidebarHeader className="border-b border-border px-4 py-4">
        <img src={logoDark} alt="Glacial Cold Brasil" className="h-9 w-auto mx-auto" />
      </SidebarHeader>

      {/* User profile */}
      {profile && (
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
          <Avatar className="h-10 w-10">
            <AvatarImage src={profile.avatar_url || undefined} alt={profile.full_name} />
            <AvatarFallback className="bg-primary text-white text-sm font-bold">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{profile.full_name}</p>
            <Badge className="bg-primary text-white text-[10px] px-1.5 py-0 hover:bg-primary">
              {roleLabel}
            </Badge>
          </div>
        </div>
      )}

      <SidebarContent className="px-2 py-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredMenu.map((item) => {
                if (item.children) {
                  const visibleChildren = filterByRole(item.children) as NonNullable<MenuItem['children']>;
                  if (visibleChildren.length === 0) return null;
                  const childActive = isChildActive(visibleChildren);

                  return (
                    <Collapsible key={item.title} defaultOpen={childActive} className="group/collapsible">
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className={cn(inactiveClass, 'justify-between')}>
                            <span className="flex items-center gap-2">
                              <item.icon className="h-4 w-4" />
                              <span>{item.title}</span>
                            </span>
                            <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {visibleChildren.map((child) => {
                              const isActive = location.pathname === child.path;
                              return (
                                <SidebarMenuSubItem key={child.path}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={isActive}
                                    className={cn(
                                      'rounded-md',
                                      isActive ? activeClass : inactiveClass
                                    )}
                                  >
                                    <NavLink to={child.path}>
                                      <child.icon className="h-4 w-4" />
                                      <span>{child.title}</span>
                                    </NavLink>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            })}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }

                const isActive = location.pathname === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={isActive ? activeClass : inactiveClass}
                    >
                      <NavLink to={item.path!}>
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
      </SidebarContent>

      <SidebarFooter className="border-t border-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={signOut}
              className="text-destructive hover:bg-destructive hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

import {
  LayoutDashboard,
  ClipboardList,
  Calendar,
  Users,
  Package,
  DollarSign,
  FileText,
  Settings,
  UserCircle,
  TrendingUp,
  Wrench,
  ChevronDown,
  MessageCircle,
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
import { useAuth } from '@/contexts/AuthContext';
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

const WHATSAPP_SUPPORT_URL = 'https://wa.me/5500000000000'; // TODO: replace with real support number

export function AppSidebar() {
  const { roles, hasRole } = useAuth();
  const location = useLocation();

  const filterByRole = (items: { roles: string[] }[]) => {
    if (roles.length === 0) return items;
    return items.filter((item) => item.roles.some((role) => hasRole(role as any)));
  };

  const filteredMenu = filterByRole(menuItems) as MenuItem[];

  const isChildActive = (children?: MenuItem['children']) =>
    children?.some((c) => location.pathname === c.path) ?? false;

  return (
    <Sidebar className="border-r border-border bg-background">
      <SidebarHeader className="border-b border-border px-4 py-4">
        <img src={logoDark} alt="Glacial Cold Brasil" className="h-9 w-auto mx-auto" />
      </SidebarHeader>

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
                                      'rounded-md [&>svg]:opacity-100',
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
              asChild
              className="text-[#25D366] hover:bg-[#25D366] hover:text-white"
            >
              <a href={WHATSAPP_SUPPORT_URL} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" />
                <span>Suporte</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

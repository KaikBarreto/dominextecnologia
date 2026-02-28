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
  { title: 'Equipamentos', icon: Package, path: '/equipamentos', roles: ['admin', 'gestor', 'tecnico'] },
  { title: 'CRM', icon: TrendingUp, path: '/crm', roles: ['admin', 'gestor', 'comercial'] },
  { title: 'Estoque', icon: Package, path: '/estoque', roles: ['admin', 'gestor'] },
  { title: 'Financeiro', icon: DollarSign, path: '/financeiro', roles: ['admin', 'gestor', 'financeiro'] },
  { title: 'Usuários', icon: UserCircle, path: '/usuarios', roles: ['admin'] },
  { title: 'Configurações', icon: Settings, path: '/configuracoes', roles: ['admin'] },
];

const activeClass = 'bg-primary text-white hover:bg-primary hover:text-white font-semibold transition-all duration-200';
const inactiveClass = 'text-foreground/70 hover:bg-primary hover:text-white transition-all duration-200';

const WHATSAPP_SUPPORT_URL = 'https://wa.me/5500000000000'; // TODO: replace with real support number

export function AppSidebar() {
  const { profile, roles, hasRole } = useAuth();
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
              className="bg-[#25D366] text-white hover:bg-[#1da851] hover:text-white"
            >
              <a href={WHATSAPP_SUPPORT_URL} target="_blank" rel="noopener noreferrer">
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                <span>Suporte</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

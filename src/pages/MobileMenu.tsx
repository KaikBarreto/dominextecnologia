import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  Calendar,
  Users,
  Package,
  DollarSign,
  FileText,
  TrendingUp,
  UserCircle,
  Settings,
  LogOut,
  Briefcase,
  ScrollText,
  Boxes,
  Clock,
  Wrench,
  Map,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyModules, type ModuleCode } from '@/hooks/useCompanyModules';

interface MobileMenuItem {
  title: string;
  icon: any;
  path: string;
  screenKey?: string;
  moduleKey?: ModuleCode;
}

const menuItems: MobileMenuItem[] = [
  { title: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', screenKey: 'screen:dashboard' },
  { title: 'Ordens de Serviço', icon: ClipboardList, path: '/ordens-servico', screenKey: 'screen:service_orders' },
  { title: 'Agenda', icon: Calendar, path: '/agenda', screenKey: 'screen:schedule' },
  { title: 'Orçamentos', icon: FileText, path: '/orcamentos', screenKey: 'screen:quotes' },
  { title: 'Serviços', icon: Wrench, path: '/servicos', screenKey: 'screen:services' },
  { title: 'Ponto Eletrônico', icon: Clock, path: '/ponto', moduleKey: 'rh' },
  { title: 'Mapa', icon: Map, path: '/mapa-ao-vivo' },
  { title: 'Clientes', icon: Users, path: '/clientes', screenKey: 'screen:customers' },
  { title: 'Equipamentos', icon: Boxes, path: '/equipamentos', screenKey: 'screen:equipment' },
  { title: 'Estoque', icon: Package, path: '/estoque', screenKey: 'screen:inventory' },
  { title: 'Funcionários', icon: Briefcase, path: '/funcionarios', screenKey: 'screen:employees', moduleKey: 'rh' },
  { title: 'Contratos', icon: ScrollText, path: '/contratos', screenKey: 'screen:contracts' },
  { title: 'CRM', icon: TrendingUp, path: '/crm', screenKey: 'screen:crm', moduleKey: 'crm' },
  { title: 'Financeiro', icon: DollarSign, path: '/financeiro', screenKey: 'screen:finance' },
  { title: 'Configurações', icon: Settings, path: '/configuracoes', screenKey: 'screen:settings' },
];

export default function MobileMenu() {
  const { signOut, profile, hasScreenAccess } = useAuth();
  const { hasModule } = useCompanyModules();

  const visibleItems = menuItems.filter(item => {
    if (item.screenKey && !hasScreenAccess(item.screenKey)) return false;
    if (item.moduleKey && !hasModule(item.moduleKey)) return false;
    return true;
  });

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold">Menu</h1>
        <p className="text-muted-foreground">Acesse todas as funcionalidades</p>
      </div>

      {profile && (
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary">
              <UserCircle className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="font-medium">{profile.full_name}</p>
              <p className="text-sm text-muted-foreground">{profile.phone || 'Sem telefone'}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        {visibleItems.map((item) => (
          <NavLink key={item.path} to={item.path}>
            <Card className="transition-colors hover:bg-accent">
              <CardContent className="flex flex-col items-center gap-2 p-4 text-center">
                <item.icon className="h-6 w-6 text-primary" />
                <span className="text-sm font-medium">{item.title}</span>
              </CardContent>
            </Card>
          </NavLink>
        ))}
      </div>

      <Card
        className="cursor-pointer transition-colors hover:bg-destructive group"
        onClick={signOut}
      >
        <CardContent className="flex items-center gap-4 p-4 text-destructive group-hover:text-white">
          <LogOut className="h-5 w-5" />
          <span className="font-medium">Sair</span>
        </CardContent>
      </Card>
    </div>
  );
}

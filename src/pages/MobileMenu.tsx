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
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';

const menuItems = [
  { title: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { title: 'Ordens de Serviço', icon: ClipboardList, path: '/ordens-servico' },
  { title: 'Agenda', icon: Calendar, path: '/agenda' },
  { title: 'Clientes', icon: Users, path: '/clientes' },
  { title: 'CRM', icon: TrendingUp, path: '/crm' },
  { title: 'Estoque', icon: Package, path: '/estoque' },
  { title: 'Financeiro', icon: DollarSign, path: '/financeiro' },
  { title: 'PMOC', icon: FileText, path: '/pmoc' },
  { title: 'Usuários', icon: UserCircle, path: '/usuarios' },
  { title: 'Configurações', icon: Settings, path: '/configuracoes' },
];

export default function MobileMenu() {
  const { signOut, profile } = useAuth();

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold">Menu</h1>
        <p className="text-muted-foreground">Acesse todas as funcionalidades</p>
      </div>

      {profile && (
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <UserCircle className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-medium">{profile.full_name}</p>
              <p className="text-sm text-muted-foreground">{profile.phone || 'Sem telefone'}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        {menuItems.map((item) => (
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
        className="cursor-pointer transition-colors hover:bg-destructive/10"
        onClick={signOut}
      >
        <CardContent className="flex items-center gap-4 p-4 text-destructive">
          <LogOut className="h-5 w-5" />
          <span className="font-medium">Sair</span>
        </CardContent>
      </Card>
    </div>
  );
}

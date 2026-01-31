import {
  ClipboardList,
  Users,
  DollarSign,
  TrendingUp,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';

const statsCards = [
  {
    title: 'OS Abertas',
    value: '12',
    description: '+2 desde ontem',
    icon: ClipboardList,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  {
    title: 'Clientes Ativos',
    value: '48',
    description: '+5 este mês',
    icon: Users,
    color: 'text-success',
    bgColor: 'bg-success/10',
  },
  {
    title: 'Faturamento',
    value: 'R$ 45.200',
    description: 'Este mês',
    icon: DollarSign,
    color: 'text-warning',
    bgColor: 'bg-warning/10',
  },
  {
    title: 'Taxa de Conclusão',
    value: '94%',
    description: '+8% vs mês anterior',
    icon: TrendingUp,
    color: 'text-info',
    bgColor: 'bg-info/10',
  },
];

const recentOS = [
  {
    id: 'OS-001',
    cliente: 'Supermercado Central',
    tipo: 'Manutenção Preventiva',
    status: 'em_andamento',
    tecnico: 'João Silva',
  },
  {
    id: 'OS-002',
    cliente: 'Restaurante Sabor',
    tipo: 'Manutenção Corretiva',
    status: 'pendente',
    tecnico: 'Carlos Santos',
  },
  {
    id: 'OS-003',
    cliente: 'Farmácia Vida',
    tipo: 'Instalação',
    status: 'concluida',
    tecnico: 'Pedro Oliveira',
  },
  {
    id: 'OS-004',
    cliente: 'Padaria Pão Quente',
    tipo: 'Visita Técnica',
    status: 'pendente',
    tecnico: 'João Silva',
  },
];

const statusConfig = {
  pendente: {
    label: 'Pendente',
    icon: Clock,
    color: 'text-warning',
    bgColor: 'bg-warning/10',
  },
  em_andamento: {
    label: 'Em Andamento',
    icon: AlertCircle,
    color: 'text-info',
    bgColor: 'bg-info/10',
  },
  concluida: {
    label: 'Concluída',
    icon: CheckCircle2,
    color: 'text-success',
    bgColor: 'bg-success/10',
  },
};

const todaySchedule = [
  { time: '08:00', cliente: 'Supermercado Central', tipo: 'Preventiva' },
  { time: '10:30', cliente: 'Restaurante Sabor', tipo: 'Corretiva' },
  { time: '14:00', cliente: 'Padaria Pão Quente', tipo: 'Visita' },
  { time: '16:30', cliente: 'Farmácia Vida', tipo: 'Instalação' },
];

export default function Dashboard() {
  const { profile } = useAuth();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">
          Olá, {profile?.full_name?.split(' ')[0] || 'Usuário'}! 👋
        </h1>
        <p className="text-muted-foreground">
          Aqui está o resumo do seu dia
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">
                    {stat.description}
                  </p>
                </div>
                <div className={`rounded-full p-3 ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent OS */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Ordens de Serviço Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentOS.map((os) => {
                const status = statusConfig[os.status as keyof typeof statusConfig];
                return (
                  <div
                    key={os.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{os.id}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${status.bgColor} ${status.color}`}>
                          <status.icon className="h-3 w-3" />
                          {status.label}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {os.cliente}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {os.tipo} • {os.tecnico}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Today's Schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Agenda de Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {todaySchedule.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 rounded-lg border p-4"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{item.time}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.cliente}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.tipo}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

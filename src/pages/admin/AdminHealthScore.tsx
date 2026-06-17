import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { typography } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { HeartPulse, Activity, AlertTriangle, XCircle, Search, Building2 } from 'lucide-react';
import { ContentLoading } from '@/components/ui/page-loading';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import {
  useCompanyHealthScores,
  getHealthBadgeConfig,
  type CompanyHealthData,
} from '@/hooks/useCompanyHealthScore';

// Ícone WhatsApp inline (não há asset dedicado no Dominex; mesmo SVG da AdminSidebarNav).
const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={cn('h-5 w-5 fill-[#25D366]', className)}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const formatPhoneForWhatsApp = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : '55' + digits;
};

export default function AdminHealthScore() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: healthData, isLoading } = useCompanyHealthScores();

  // Telefones das empresas pro botão de WhatsApp.
  const { data: companyPhones } = useQuery({
    queryKey: ['admin-company-phones'],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('id, phone');
      if (error) throw error;
      const map = new Map<string, string>();
      (data || []).forEach((c) => {
        if (c.phone) map.set(c.id, c.phone);
      });
      return map;
    },
  });

  const stats = useMemo(() => {
    if (!healthData) return { healthy: 0, attention: 0, at_risk: 0, inactive: 0, total: 0 };
    return {
      healthy: healthData.filter((d) => d.health_status === 'healthy').length,
      attention: healthData.filter((d) => d.health_status === 'attention').length,
      at_risk: healthData.filter((d) => d.health_status === 'at_risk').length,
      inactive: healthData.filter((d) => d.health_status === 'inactive').length,
      total: healthData.length,
    };
  }, [healthData]);

  const pieData = useMemo(
    () =>
      [
        { name: 'Saudável', value: stats.healthy, color: '#22c55e' },
        { name: 'Atenção', value: stats.attention, color: '#eab308' },
        { name: 'Em Risco', value: stats.at_risk, color: '#ef4444' },
        { name: 'Inativo', value: stats.inactive, color: '#9ca3af' },
      ]
        .filter((d) => d.value > 0)
        .sort((a, b) => b.value - a.value),
    [stats],
  );

  const filteredData = useMemo<CompanyHealthData[]>(() => {
    if (!healthData) return [];
    return healthData.filter((d) => {
      const matchSearch = d.company_name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'all' || d.health_status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [healthData, searchTerm, statusFilter]);

  const handleCardClick = (status: string) => {
    setStatusFilter((prev) => (prev === status ? 'all' : status));
  };

  if (isLoading) return <ContentLoading />;

  const cardConfigs = [
    {
      status: 'healthy',
      label: 'Saudável',
      value: stats.healthy,
      icon: HeartPulse,
      gradient: 'bg-gradient-to-br from-green-500 to-green-600',
      ring: 'ring-green-400',
    },
    {
      status: 'attention',
      label: 'Atenção',
      value: stats.attention,
      icon: Activity,
      gradient: 'bg-gradient-to-br from-yellow-500 to-amber-600',
      ring: 'ring-yellow-400',
    },
    {
      status: 'at_risk',
      label: 'Em Risco',
      value: stats.at_risk,
      icon: AlertTriangle,
      gradient: 'bg-gradient-to-br from-red-500 to-red-600',
      ring: 'ring-red-400',
    },
    {
      status: 'inactive',
      label: 'Inativo',
      value: stats.inactive,
      icon: XCircle,
      gradient: 'bg-gradient-to-br from-gray-500 to-gray-600',
      ring: 'ring-gray-400',
    },
  ];

  return (
    <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6 space-y-4 lg:space-y-6">
      <div>
        <h1 className={typography.pageTitle}>Health Score</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe a saúde e o engajamento de cada empresa
        </p>
      </div>

      {/* Cards de resumo (clicáveis para filtrar) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cardConfigs.map((card) => {
          const isActive = statusFilter === card.status;
          const Icon = card.icon;
          return (
            <Card
              key={card.status}
              className={cn(
                'border-0 shadow-lg cursor-pointer transition-all',
                card.gradient,
                isActive
                  ? `ring-2 ${card.ring} ring-offset-2 ring-offset-background scale-[1.02]`
                  : 'hover:scale-[1.01]',
              )}
              onClick={() => handleCardClick(card.status)}
            >
              <CardContent className="p-4 text-center">
                <Icon className="h-6 w-6 text-white mx-auto mb-1" />
                <p className="text-2xl font-bold text-white">{card.value}</p>
                <p className="text-xs text-white/80 font-medium">{card.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Gráfico + Tabela */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Distribuição</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={40}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [`${value} empresas`, '']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  {pieData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                      <span>
                        {d.name} ({d.value})
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                Sem dados
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar empresa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="healthy">Saudável</SelectItem>
                  <SelectItem value="attention">Atenção</SelectItem>
                  <SelectItem value="at_risk">Em Risco</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Saúde</TableHead>
                    <TableHead>Último Acesso</TableHead>
                    <TableHead className="text-center">7d</TableHead>
                    <TableHead className="text-center">14d</TableHead>
                    <TableHead className="text-center">30d</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((company) => {
                    const badge = getHealthBadgeConfig(company.health_status);
                    const phone = companyPhones?.get(company.company_id);
                    return (
                      <TableRow
                        key={company.company_id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() =>
                          navigate(`/admin/empresas/${company.company_id}?tab=atividade`)
                        }
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="truncate">{company.company_name}</span>
                            {phone && (
                              <button
                                className="flex-shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(
                                    `https://wa.me/${formatPhoneForWhatsApp(phone)}`,
                                    '_blank',
                                    'noopener,noreferrer',
                                  );
                                }}
                                title="WhatsApp"
                              >
                                <WhatsAppIcon />
                              </button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {company.subscription_status === 'active'
                              ? 'Ativo'
                              : company.subscription_status === 'testing'
                                ? 'Teste'
                                : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={badge.className}>{badge.label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {company.last_activity_at
                            ? format(new Date(company.last_activity_at), 'dd/MM/yy HH:mm', {
                                locale: ptBR,
                              })
                            : 'Nunca'}
                        </TableCell>
                        <TableCell className="text-center text-sm">{company.events_7d}</TableCell>
                        <TableCell className="text-center text-sm">{company.events_14d}</TableCell>
                        <TableCell className="text-center text-sm">{company.events_30d}</TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Nenhuma empresa encontrada
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

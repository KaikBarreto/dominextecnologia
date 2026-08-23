import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CreditCard, Building2, TrendingUp, DollarSign, BarChart3, Search } from 'lucide-react';
import { ContentLoading } from '@/components/ui/page-loading';
import { typography } from '@/lib/typography';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Tipos que espelham o contrato da RPC get_admin_cobrancas_overview()
// ---------------------------------------------------------------------------
interface CobrancasTotals {
  tenants_with_cobrancas: number;
  active_subscriptions: number;
  mrr_total: number;
  volume_30d: number;
  paid_30d: number;
}

interface CobrancasTenant {
  company_id: string;
  company_name: string;
  account_status: string;
  mrr: number;
  active_subscriptions: number;
  charges_30d_count: number;
  charges_30d_volume: number;
  paid_30d_count: number;
  paid_30d_volume: number;
}

interface CobrancasOverview {
  totals: CobrancasTotals;
  tenants: CobrancasTenant[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function AccountStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: 'Ativo', className: 'bg-emerald-500 text-white hover:bg-emerald-500' },
    testing: { label: 'Teste', className: 'bg-blue-500 text-white hover:bg-blue-500' },
    inactive: { label: 'Inativo', className: 'bg-gray-500 text-white hover:bg-gray-500' },
    suspended: { label: 'Suspenso', className: 'bg-red-500 text-white hover:bg-red-500' },
  };
  const cfg = map[status] ?? { label: status, className: 'bg-gray-400 text-white hover:bg-gray-400' };
  return <Badge className={cn('text-xs font-semibold', cfg.className)}>{cfg.label}</Badge>;
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function AdminCobrancas() {
  const [search, setSearch] = useState('');

  const { data, isLoading, isError } = useQuery<CobrancasOverview>({
    queryKey: ['admin-cobrancas-overview'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('get_admin_cobrancas_overview');
      if (error) throw error;
      return data as CobrancasOverview;
    },
  });

  if (isLoading) return <ContentLoading />;

  if (isError || !data) {
    return (
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6">
        <p className="text-sm text-destructive">Erro ao carregar dados de cobranças.</p>
      </div>
    );
  }

  const { totals, tenants } = data;

  const filteredTenants = tenants.filter((t) =>
    t.company_name.toLowerCase().includes(search.toLowerCase()),
  );

  // Cards de totais — seguem o mesmo padrão visual de AdminDashboardStats
  const summaryCards = [
    {
      title: 'Tenants com Cobranças',
      value: totals.tenants_with_cobrancas,
      icon: Building2,
      gradient: 'bg-gradient-to-br from-blue-500 to-blue-600',
    },
    {
      title: 'Assinaturas Ativas',
      value: totals.active_subscriptions,
      icon: CreditCard,
      gradient: 'bg-gradient-to-br from-violet-500 to-violet-600',
    },
    {
      title: 'MRR Total',
      value: formatBRL(totals.mrr_total),
      icon: TrendingUp,
      gradient: 'bg-gradient-to-br from-emerald-500 to-emerald-600',
    },
    {
      title: 'Volume 30 dias',
      value: formatBRL(totals.volume_30d),
      icon: BarChart3,
      gradient: 'bg-gradient-to-br from-amber-500 to-amber-600',
    },
    {
      title: 'Recebido 30 dias',
      value: formatBRL(totals.paid_30d),
      icon: DollarSign,
      gradient: 'bg-gradient-to-br from-teal-500 to-teal-600',
    },
  ];

  return (
    <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6 space-y-4 lg:space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className={typography.pageTitle}>Cobranças dos Tenants</h1>
        <p className="text-sm text-muted-foreground">
          Visão consolidada das cobranças ao cliente final por empresa
        </p>
      </div>

      {/* Cards de totais */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card
              key={card.title}
              className={cn('border-0 shadow-lg text-white', card.gradient)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-medium text-white/80 leading-tight">{card.title}</p>
                    <p className="text-lg font-bold tracking-tight truncate">{card.value}</p>
                  </div>
                  <div className="shrink-0 p-1.5 rounded-lg bg-white/20">
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabela de tenants */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="border-b bg-muted/30 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              Empresas
              {filteredTenants.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  ({filteredTenants.length})
                </span>
              )}
            </CardTitle>
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar empresa..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-8 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredTenants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <CreditCard className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">
                {search ? 'Nenhuma empresa encontrada para a busca' : 'Nenhum tenant com cobranças ativas'}
              </p>
              {search && (
                <p className="text-xs text-muted-foreground/70">
                  Tente buscar por outro nome
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">MRR</TableHead>
                    <TableHead className="text-right">Assinaturas</TableHead>
                    <TableHead className="text-right">Cobranças 30d</TableHead>
                    <TableHead className="text-right">Volume 30d</TableHead>
                    <TableHead className="text-right">Recebido 30d</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTenants.map((tenant) => (
                    <TableRow key={tenant.company_id} className="hover:bg-muted/40">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="truncate max-w-[160px]">{tenant.company_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <AccountStatusBadge status={tenant.account_status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBRL(tenant.mrr)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {tenant.active_subscriptions}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {tenant.charges_30d_count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBRL(tenant.charges_30d_volume)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span
                          className={cn(
                            'font-medium',
                            tenant.paid_30d_volume > 0 ? 'text-emerald-600 dark:text-emerald-400' : '',
                          )}
                        >
                          {formatBRL(tenant.paid_30d_volume)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

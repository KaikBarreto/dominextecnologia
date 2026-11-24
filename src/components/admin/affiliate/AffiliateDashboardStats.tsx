import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, DollarSign, Building2 } from 'lucide-react';
import type { AffiliateWithMetrics } from '@/hooks/useAffiliateData';
import { adminKpiClass } from '@/components/admin/adminKpiStyles';

interface AffiliateDashboardStatsProps {
  affiliates: AffiliateWithMetrics[];
}

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

/**
 * Grid de stats do desktop. Espelha `SalespersonDashboardStats`: o mobile usa
 * o `StatCarousel` direto na página (não aqui), igual ao padrão da tela irmã
 * de Vendedores.
 */
export function AffiliateDashboardStats({ affiliates }: AffiliateDashboardStatsProps) {
  const active = affiliates.filter((a) => a.is_active);
  const totalPending = affiliates.reduce((sum, a) => sum + (a.pending_balance || 0), 0);
  const totalClients = affiliates.reduce((sum, a) => sum + (a.client_count || 0), 0);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className={adminKpiClass('violet')}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Afiliados Ativos</CardTitle>
          <Users className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{active.length}</div>
          <p className="text-xs text-white/75">de {affiliates.length} cadastrados</p>
        </CardContent>
      </Card>

      <Card className={adminKpiClass('amber')}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Comissão Pendente</CardTitle>
          <DollarSign className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{brl(totalPending)}</div>
          <p className="text-xs text-white/75">a repassar</p>
        </CardContent>
      </Card>

      <Card className={adminKpiClass('blue')}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Clientes Indicados</CardTitle>
          <Building2 className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalClients}</div>
          <p className="text-xs text-white/75">empresas vinculadas</p>
        </CardContent>
      </Card>
    </div>
  );
}

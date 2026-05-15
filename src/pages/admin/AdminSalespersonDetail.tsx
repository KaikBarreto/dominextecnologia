import { useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  useSalesperson, useSalespeople, useSalespersonSales,
  useSalespersonAdvances, useSalespersonPayments,
} from '@/hooks/useSalespersonData';
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';
import { SalespersonDetailStats } from '@/components/admin/salesperson/SalespersonDetailStats';
import { SalespersonDetailCharts } from '@/components/admin/salesperson/SalespersonDetailCharts';
import { SalespersonSalesList } from '@/components/admin/salesperson/SalespersonSalesList';
import { SalespersonAdvanceForm } from '@/components/admin/salesperson/SalespersonAdvanceForm';
import { SalespersonAdvancesList } from '@/components/admin/salesperson/SalespersonAdvancesList';
import { SalespersonPaymentControl } from '@/components/admin/salesperson/SalespersonPaymentControl';
import { useAdminPermissions } from '@/hooks/useAdminPermissions';

export default function AdminSalespersonDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { hasFunctionAccess, linkedSalespersonId } = useAdminPermissions();
  const canSeeAllSalespeople = hasFunctionAccess('admin_vendedores_ver_todos');
  const isViewingOwnRecord = !!linkedSalespersonId && id === linkedSalespersonId;
  // Vendedor admin restrito (sem ver_todos) só pode ver o próprio registro.
  // Vê seus dados mas NÃO pode trocar o vendedor selecionado nem registrar vales (ações de admin).
  const isRestrictedSelfView = !canSeeAllSalespeople && isViewingOwnRecord;

  // Guard: vendedor admin restrito tentando acessar outro vendedor pela URL é
  // redirecionado pro próprio registro. (Defesa em profundidade — a RLS de
  // salespeople libera SELECT a todos os admin_users, então o filtro de UI é a
  // fronteira de privacidade entre vendedores.)
  useEffect(() => {
    if (!canSeeAllSalespeople && linkedSalespersonId && id && id !== linkedSalespersonId) {
      navigate(`/admin/vendedores/${linkedSalespersonId}`, { replace: true });
    }
  }, [canSeeAllSalespeople, linkedSalespersonId, id, navigate]);

  const { data: salesperson, isLoading } = useSalesperson(id);
  const { data: allSalespeople = [] } = useSalespeople();
  const { data: allSales = [] } = useSalespersonSales(id);
  const { data: allAdvances = [] } = useSalespersonAdvances(id);
  const { data: payments = [] } = useSalespersonPayments(id);

  const { preset, range, setPreset, setRange, filterByDate } = useDateRangeFilter('this_month');

  const filteredSales = useMemo(() => filterByDate(allSales, 'created_at'), [allSales, filterByDate]);
  const filteredAdvances = useMemo(() => filterByDate(allAdvances, 'created_at'), [allAdvances, filterByDate]);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!salesperson) {
    return (
      <div className="container mx-auto py-12 text-center">
        <p className="text-muted-foreground">Vendedor não encontrado.</p>
        <Button variant="outline" onClick={() => navigate('/admin/vendedores')} className="mt-4">Voltar</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6 space-y-6 max-w-full">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {canSeeAllSalespeople && (
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/vendedores')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="flex-1 min-w-0">
            {isRestrictedSelfView ? (
              // Vendedor admin restrito: nome estático, sem dropdown pra outros vendedores
              <h1 className="text-xl sm:text-2xl font-bold">{salesperson.name}</h1>
            ) : (
              <Select value={id} onValueChange={(v) => navigate(`/admin/vendedores/${v}`)}>
                <SelectTrigger className="w-full sm:w-auto border-none p-0 h-auto text-xl sm:text-2xl font-bold shadow-none focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allSalespeople.map((sp) => (
                    <SelectItem key={sp.id} value={sp.id}>{sp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs sm:text-sm text-muted-foreground">Dashboard de Vendas</p>
          </div>
        </div>
        <DateRangeFilter
          value={range}
          preset={preset}
          onPresetChange={setPreset}
          onRangeChange={setRange}
        />
      </div>

      <SalespersonDetailStats
        salesperson={salesperson}
        sales={filteredSales}
        advances={filteredAdvances}
        totalSalesCount={allSales.length}
      />

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className={`grid w-full ${isMobile ? '' : 'max-w-[600px]'} grid-cols-4 ${isMobile ? 'h-auto' : ''}`}>
          <TabsTrigger value="overview" className={isMobile ? 'text-xs py-2' : ''}>Visão Geral</TabsTrigger>
          <TabsTrigger value="sales" className={isMobile ? 'text-xs py-2' : ''}>Vendas</TabsTrigger>
          <TabsTrigger value="advances" className={isMobile ? 'text-xs py-2' : ''}>Vales</TabsTrigger>
          <TabsTrigger value="payment" className={isMobile ? 'text-xs py-2' : ''}>Pagamento</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <SalespersonDetailCharts salesperson={salesperson} allSales={allSales} currentMonthSales={filteredSales} />
        </TabsContent>

        <TabsContent value="sales" className="space-y-4">
          <SalespersonSalesList sales={filteredSales} />
        </TabsContent>

        <TabsContent value="advances" className="space-y-4">
          <div className={isRestrictedSelfView ? '' : 'grid gap-4 lg:grid-cols-2'}>
            {/* Registrar vale é ação administrativa: vendedor admin restrito só visualiza. */}
            {!isRestrictedSelfView && <SalespersonAdvanceForm salespersonId={salesperson.id} />}
            <SalespersonAdvancesList advances={filteredAdvances} />
          </div>
        </TabsContent>

        <TabsContent value="payment" className="space-y-4">
          <SalespersonPaymentControl
            salesperson={salesperson}
            allSales={allSales}
            allAdvances={allAdvances}
            payments={payments}
            readOnly={isRestrictedSelfView}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

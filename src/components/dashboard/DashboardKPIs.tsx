import { ClipboardList, TrendingUp, DollarSign } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCountUp } from './useCountUp';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { KPICard } from './KPICard';

interface KPIData {
  osAbertas: number;
  osPendentes: number;
  emCampoAgora: number;
  taxaConclusao: number;
  osConcluidas: number;
  faturamento: number;
  clientesAtivos: number;
  trendOS?: number;
  trendFaturamento?: number;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function DashboardKPIs({ data, isLoading }: { data: KPIData; isLoading: boolean }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const animatedFaturamento = useCountUp(data.faturamento, 1500, 2);

  if (isLoading) {
    return isMobile ? (
      <div className="flex gap-3 overflow-x-auto -mx-3 px-3 pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="shrink-0 w-[78%]">
            <Card><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          </div>
        ))}
      </div>
    ) : (
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i}><CardContent className="p-4 lg:p-5"><Skeleton className="h-20 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  const kpiCards = [
    {
      title: 'OS Abertas',
      value: data.osAbertas,
      subtitle: `${data.osPendentes} pendentes`,
      icon: ClipboardList,
      bgClass: 'bg-warning',
      trend: data.trendOS,
      delay: 0,
      onClick: () => navigate('/ordens-servico'),
    },
    {
      title: 'Taxa de Conclusão',
      value: data.taxaConclusao,
      formattedValue: `${data.taxaConclusao}%`,
      subtitle: `${data.osConcluidas} concluídas este mês`,
      icon: TrendingUp,
      bgClass: 'bg-info',
      delay: 1,
      onClick: () => navigate('/ordens-servico'),
    },
    {
      title: 'Faturamento',
      value: data.faturamento,
      formattedValue: formatCurrency(animatedFaturamento),
      subtitle: 'no período selecionado',
      icon: DollarSign,
      bgClass: 'bg-success',
      trend: data.trendFaturamento,
      delay: 2,
      onClick: () => navigate('/financeiro'),
    },
  ];

  // Mobile: carrossel horizontal snap-x (estilo app nativo)
  if (isMobile) {
    return (
      <div className="relative -mx-3">
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-4 bg-gradient-to-l from-background to-transparent" />
        <div className="flex gap-3 overflow-x-auto px-3 pb-1 snap-x [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {kpiCards.map((card) => (
            <div key={card.title} className="snap-start shrink-0 w-[78%]">
              <KPICard {...card} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Desktop: grid 3 cols
  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {kpiCards.map((card) => <KPICard key={card.title} {...card} />)}
    </div>
  );
}
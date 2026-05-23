import { ClipboardList, TrendingUp, DollarSign, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCountUp } from './useCountUp';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

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

/**
 * KPI Card no estilo "saturado" do EcoSistema:
 * - Fundo de cor sólida do token semântico (warning / info / success).
 * - Texto e ícone brancos; ícone sobre fundo `bg-white/20` redondo.
 * - Sombra suave + borda arredondada `rounded-2xl` pra dar peso visual.
 *
 * `bgClass`: classe Tailwind do fundo principal (ex: `bg-warning`).
 *  CEO requisito 2026-05-23 — referência visual do print do EcoSistema.
 */
function KPICard({ title, value, formattedValue, subtitle, icon: Icon, trend, delay, onClick, bgClass }: {
  title: string;
  value: number;
  formattedValue?: string;
  subtitle: string;
  icon: any;
  trend?: number;
  delay: number;
  onClick?: () => void;
  bgClass: string;
}) {
  const animatedValue = useCountUp(value);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: delay * 0.1 }}
    >
      <Card
        className={cn(
          'border-0 cursor-pointer group overflow-hidden rounded-2xl shadow-md',
          'hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200',
          bgClass,
          // gradient sutil top→bottom pra dar profundidade (cor do bg base + leve clareada)
          'bg-gradient-to-br from-white/10 to-transparent',
        )}
        onClick={onClick}
      >
        <CardContent className="p-5 lg:p-6 relative">
          {/* halo decorativo no canto direito */}
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 pointer-events-none" />

          <div className="flex items-start justify-between gap-3 relative">
            <div className="space-y-2 min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-white/80 uppercase tracking-wider truncate">{title}</p>
              <p className="text-3xl lg:text-4xl font-bold text-white tracking-tight whitespace-nowrap">
                {formattedValue ?? animatedValue.toLocaleString('pt-BR')}
              </p>
              <p className="text-xs text-white/80">{subtitle}</p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="p-3 rounded-full bg-white/20 backdrop-blur-sm">
                <Icon className="h-5 w-5 text-white" />
              </div>
              {trend !== undefined && trend !== 0 && (
                <div className="flex items-center gap-0.5 text-xs font-semibold text-white/90 bg-white/15 rounded-full px-2 py-0.5">
                  {trend > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {Math.abs(trend)}%
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
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
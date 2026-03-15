import { ClipboardList, MapPin, TrendingUp, DollarSign, Users, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCountUp } from './useCountUp';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

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

function KPICard({ title, value, formattedValue, subtitle, subtitleColor, icon: Icon, iconColor, trend, delay, pulsing, onClick }: {
  title: string;
  value: number;
  formattedValue?: string;
  subtitle: string;
  subtitleColor?: string;
  icon: any;
  iconColor: string;
  trend?: number;
  delay: number;
  pulsing?: boolean;
  onClick?: () => void;
}) {
  const animatedValue = useCountUp(value);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: delay * 0.1 }}
    >
      <Card
        className="border border-border hover:border-primary/30 transition-colors cursor-pointer group"
        onClick={onClick}
      >
        <CardContent className="p-4 lg:p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-2 min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
              <p className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">
                {formattedValue ?? animatedValue.toLocaleString('pt-BR')}
              </p>
              <p className={`text-xs ${subtitleColor || 'text-muted-foreground'}`}>{subtitle}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className={`p-2.5 rounded-xl bg-muted/50 ${pulsing ? 'relative' : ''}`}>
                <Icon className={`h-5 w-5 ${iconColor}`} />
                {pulsing && (
                  <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-success animate-pulse" />
                )}
              </div>
              {trend !== undefined && trend !== 0 && (
                <div className={`flex items-center gap-0.5 text-xs font-medium ${trend > 0 ? 'text-success' : 'text-destructive'}`}>
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
  const animatedFaturamento = useCountUp(data.faturamento, 1500, 2);

  if (isLoading) {
    return (
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Card key={i}><CardContent className="p-4 lg:p-5"><Skeleton className="h-20 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  const pendingHighRatio = data.osPendentes > data.osAbertas * 0.5;
  const conclusionColor = data.taxaConclusao < 30 ? 'text-destructive' : data.taxaConclusao < 70 ? 'text-warning' : 'text-success';

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
      <KPICard
        title="OS Abertas"
        value={data.osAbertas}
        subtitle={`${data.osPendentes} pendentes`}
        subtitleColor={pendingHighRatio ? 'text-destructive' : undefined}
        icon={ClipboardList}
        iconColor="text-primary"
        trend={data.trendOS}
        delay={0}
        onClick={() => navigate('/os')}
      />
      <KPICard
        title="Em Campo Agora"
        value={data.emCampoAgora}
        subtitle="técnicos ativos agora"
        icon={MapPin}
        iconColor="text-success"
        delay={1}
        pulsing
        onClick={() => navigate('/mapa-ao-vivo')}
      />
      <KPICard
        title="Taxa de Conclusão"
        value={data.taxaConclusao}
        formattedValue={`${data.taxaConclusao}%`}
        subtitle={`${data.osConcluidas} concluídas este mês`}
        icon={TrendingUp}
        iconColor={conclusionColor}
        delay={2}
        onClick={() => navigate('/os')}
      />
      <KPICard
        title="Faturamento"
        value={data.faturamento}
        formattedValue={formatCurrency(animatedFaturamento)}
        subtitle="no período selecionado"
        icon={DollarSign}
        iconColor="text-info"
        trend={data.trendFaturamento}
        delay={3}
        onClick={() => navigate('/financeiro')}
      />
      <KPICard
        title="Clientes Ativos"
        value={data.clientesAtivos}
        subtitle="cadastrados"
        icon={Users}
        iconColor="text-muted-foreground"
        delay={4}
        onClick={() => navigate('/clientes')}
      />
    </div>
  );
}
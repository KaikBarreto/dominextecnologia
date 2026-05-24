import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { useCountUp } from './useCountUp';
import { cn } from '@/lib/utils';

/**
 * KPI Card no estilo "saturado" do EcoSistema:
 * - Fundo de cor sólida do token semântico (warning / info / success / destructive).
 * - Texto e ícone brancos; ícone sobre fundo `bg-white/20` redondo.
 * - Sombra suave + borda arredondada `rounded-2xl` pra dar peso visual.
 *
 * `bgClass`: classe Tailwind do fundo principal (ex: `bg-warning`).
 *  CEO requisito 2026-05-23 — referência visual do print do EcoSistema.
 *
 * Extraído de DashboardKPIs.tsx em 2026-05-24 para reuso na tela
 * de Ordens de Serviço (mesmos KPIs visuais).
 */
export function KPICard({
  title,
  value,
  formattedValue,
  subtitle,
  icon: Icon,
  trend,
  delay,
  onClick,
  bgClass,
}: {
  title: string;
  value: number;
  formattedValue?: string;
  subtitle?: string;
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
          'border-0 overflow-hidden rounded-2xl shadow-md',
          onClick && 'cursor-pointer group hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200',
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
              {subtitle && <p className="text-xs text-white/80">{subtitle}</p>}
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

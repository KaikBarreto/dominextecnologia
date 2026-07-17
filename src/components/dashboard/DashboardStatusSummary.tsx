import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ListChecks } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

type StatusKey = 'pendente' | 'agendada' | 'a_caminho' | 'em_andamento' | 'concluida' | 'cancelada';

const statusStyle: Record<StatusKey, { colorClass: string; barColor: string }> = {
  pendente: { colorClass: 'text-warning', barColor: 'bg-warning' },
  agendada: { colorClass: 'text-info', barColor: 'bg-info' },
  a_caminho: { colorClass: 'text-info', barColor: 'bg-info' },
  em_andamento: { colorClass: 'text-primary', barColor: 'bg-primary' },
  concluida: { colorClass: 'text-success', barColor: 'bg-success' },
  cancelada: { colorClass: 'text-destructive', barColor: 'bg-destructive' },
};

const STATUS_ORDER: StatusKey[] = ['pendente', 'agendada', 'a_caminho', 'em_andamento', 'concluida', 'cancelada'];

export function DashboardStatusSummary({ counts, isLoading }: { counts: Record<string, number>; isLoading: boolean }) {
  const navigate = useNavigate();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.dashboard.statusSummary;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}>
      <Card className="rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm lg:text-base font-semibold flex items-center gap-2 text-center lg:text-left justify-center lg:justify-start leading-tight">
            <ListChecks className="h-5 w-5 text-muted-foreground" />
            {t.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : (
            <div className="space-y-3">
              {STATUS_ORDER.map((key) => {
                const style = statusStyle[key];
                const count = counts[key] || 0;
                if (count === 0 && key === 'cancelada') return null;
                const percentage = total > 0 ? Math.round((count / total) * 100) : 0;

                return (
                  <button
                    key={key}
                    onClick={() => navigate('/ordens-servico', { state: { initialStatus: key } })}
                    className="w-full text-left group min-h-11 py-1 rounded-lg active:scale-[0.98] transition-transform"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-medium ${style.colorClass} group-hover:underline`}>{t.status[key]}</span>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-bold text-foreground">{count}</span>
                        <span className="text-xs text-muted-foreground w-10 text-right">({percentage}%)</span>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${style.barColor}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
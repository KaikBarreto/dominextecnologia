import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ListChecks } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

const statusConfig: Record<string, { label: string; colorClass: string; barColor: string }> = {
  pendente: { label: 'Pendente', colorClass: 'text-warning', barColor: 'bg-warning' },
  agendada: { label: 'Agendada', colorClass: 'text-info', barColor: 'bg-info' },
  a_caminho: { label: 'A Caminho', colorClass: 'text-info', barColor: 'bg-info' },
  em_andamento: { label: 'Em Andamento', colorClass: 'text-primary', barColor: 'bg-primary' },
  concluida: { label: 'Concluída', colorClass: 'text-success', barColor: 'bg-success' },
  cancelada: { label: 'Cancelada', colorClass: 'text-destructive', barColor: 'bg-destructive' },
};

export function DashboardStatusSummary({ counts, isLoading }: { counts: Record<string, number>; isLoading: boolean }) {
  const navigate = useNavigate();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm lg:text-base font-semibold flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-muted-foreground" />
            OS por Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : (
            <div className="space-y-3">
              {Object.entries(statusConfig).map(([key, config]) => {
                const count = counts[key] || 0;
                if (count === 0 && key === 'cancelada') return null;
                const percentage = total > 0 ? Math.round((count / total) * 100) : 0;

                return (
                  <button
                    key={key}
                    onClick={() => navigate('/os')}
                    className="w-full text-left group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-medium ${config.colorClass} group-hover:underline`}>{config.label}</span>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-bold text-foreground">{count}</span>
                        <span className="text-xs text-muted-foreground w-10 text-right">({percentage}%)</span>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${config.barColor}`}
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

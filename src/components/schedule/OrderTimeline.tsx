import { Play, Pause, PlayCircle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface OrderTimelineProps {
  startedAt?: string | null;
  pausedAt?: string | null;
  resumedAt?: string | null;
  completedAt?: string | null;
  className?: string;
}

interface TimelineEntry {
  key: string;
  label: string;
  date: Date;
  icon: typeof Play;
  iconClass: string;
  dotClass: string;
}

function safeDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}

/**
 * Linha do tempo cronológica da OS, baseada nos timestamps de auditoria
 * preenchidos pelo trigger BEFORE UPDATE em service_orders.
 *
 * Mostra apenas eventos que de fato ocorreram (timestamp != null).
 * Como paused_at/resumed_at são escalares (guardam só a última pausa),
 * a linha do tempo reflete a pausa mais recente, não histórico múltiplo.
 */
export function OrderTimeline({
  startedAt,
  pausedAt,
  resumedAt,
  completedAt,
  className,
}: OrderTimelineProps) {
  const entries: TimelineEntry[] = [];

  const started = safeDate(startedAt);
  if (started) {
    entries.push({
      key: 'started',
      label: 'Iniciada em',
      date: started,
      icon: Play,
      iconClass: 'text-emerald-500',
      dotClass: 'bg-emerald-500',
    });
  }

  const paused = safeDate(pausedAt);
  if (paused) {
    entries.push({
      key: 'paused',
      label: 'Pausada em',
      date: paused,
      icon: Pause,
      iconClass: 'text-muted-foreground',
      dotClass: 'bg-muted-foreground',
    });
  }

  const resumed = safeDate(resumedAt);
  if (resumed) {
    entries.push({
      key: 'resumed',
      label: 'Retomada em',
      date: resumed,
      icon: PlayCircle,
      iconClass: 'text-amber-500',
      dotClass: 'bg-amber-500',
    });
  }

  const completed = safeDate(completedAt);
  if (completed) {
    entries.push({
      key: 'completed',
      label: 'Finalizada em',
      date: completed,
      icon: CheckCircle2,
      iconClass: 'text-emerald-600',
      dotClass: 'bg-emerald-600',
    });
  }

  if (entries.length === 0) return null;

  // Ordena cronologicamente (defensivo — caso pause venha antes de start por algum motivo)
  entries.sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <div className={cn('space-y-2', className)}>
      <div className="text-sm font-semibold">Linha do tempo</div>
      <div className="relative pl-5 space-y-2.5 border-l-2 border-muted ml-1">
        {entries.map((entry) => {
          const Icon = entry.icon;
          return (
            <div key={entry.key} className="relative">
              {/* dot */}
              <div
                className={cn(
                  'absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-2 ring-background',
                  entry.dotClass,
                )}
              />
              <div className="flex items-start gap-1.5 text-xs">
                <Icon className={cn('h-3.5 w-3.5 mt-px shrink-0', entry.iconClass)} />
                <div className="min-w-0">
                  <span className="font-medium text-foreground">{entry.label}</span>{' '}
                  <span className="text-muted-foreground">
                    {format(entry.date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

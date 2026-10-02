import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarX2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/mobile/EmptyState';
import { fromDateKey } from '@/utils/salespersonActivityStats';
import type { SalespersonActivityAggregate } from './activityAggregate';

interface Props {
  rows: SalespersonActivityAggregate[];
}

/** Teto de dias visíveis por vendedor antes do "ver todos" — período longo
 * (ex: "Este ano") pode gerar dezenas de dias em branco por pessoa, e
 * despejar tudo de uma vez vira ruído em vez de informação. */
const VISIBLE_CAP = 8;

function dayChipLabel(dateKey: string): string {
  const date = fromDateKey(dateKey);
  if (!date) return dateKey;
  const weekday = format(date, 'EEE', { locale: ptBR }).replace('.', '');
  return `${format(date, 'dd/MM')} (${weekday})`;
}

/**
 * "E também os dias em que ele não marcou" — pedido nominal do CEO. Agrupado
 * por vendedor, pra o gestor saber exatamente quem e quando.
 */
export function ActivityMissingDaysList({ rows }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const withMissing = rows.filter((r) => r.missingDaysCount > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarX2 className="h-4 w-4 text-muted-foreground" />
          Dias sem registro
        </CardTitle>
      </CardHeader>
      <CardContent>
        {withMissing.length === 0 ? (
          <EmptyState
            icon={<CalendarX2 className="h-10 w-10" />}
            title="Cobertura completa"
            description="Nenhum vendedor ficou sem registrar o diário em dia útil do período."
            size="compact"
          />
        ) : (
          <div className="space-y-4">
            {withMissing.map((r) => {
              const isExpanded = !!expanded[r.id];
              const visibleDays = isExpanded ? r.missingDays : r.missingDays.slice(0, VISIBLE_CAP);
              const remaining = r.missingDays.length - visibleDays.length;
              return (
                <div key={r.id} className="min-w-0 space-y-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">{r.name}</span>
                    <Badge variant="destructive" className="shrink-0 text-[10px]">
                      {r.missingDaysCount} dia(s)
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {visibleDays.map((day) => (
                      <span
                        key={day}
                        className="rounded-md bg-destructive px-2 py-0.5 text-xs font-medium text-white"
                      >
                        {dayChipLabel(day)}
                      </span>
                    ))}
                    {remaining > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-5 px-2 text-xs"
                        onClick={() => setExpanded((prev) => ({ ...prev, [r.id]: true }))}
                      >
                        + {remaining} ver todos
                      </Button>
                    )}
                    {isExpanded && r.missingDays.length > VISIBLE_CAP && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-5 px-2 text-xs"
                        onClick={() => setExpanded((prev) => ({ ...prev, [r.id]: false }))}
                      >
                        ver menos
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

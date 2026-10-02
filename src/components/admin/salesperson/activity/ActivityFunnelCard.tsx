import { ArrowDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ACTIVITY_METRIC_LABEL } from '@/hooks/useSalespersonActivity';
import type { ActivityCounters, ConversionRates } from '@/utils/salespersonActivityStats';

interface Props {
  counters: ActivityCounters;
  rates: ConversionRates;
}

const STAGE_COLOR = {
  contacts: '#0EA5E9',
  meetings_scheduled: '#8B5CF6',
  meetings_held: '#00C597',
  sales_count: '#F97316',
} as const;

/** `null` (denominador zero) vira "—" — nunca NaN%/Infinity% na tela. */
function fmtRate(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

/**
 * Funil visual: barra de cada etapa proporcional ao tamanho da etapa anterior
 * (base = contatos), pra deixar ÓBVIO onde o número cai — é o requisito
 * explícito do CEO, não decoração. O no-show (complemento de agendada→realizada)
 * ganha badge próprio, sóbrio (âmbar, não vermelho de alarme).
 */
export function ActivityFunnelCard({ counters, rates }: Props) {
  // Base da barra: contatos é sempre a maior etapa esperada. Se vier zero
  // (período sem nenhum contato registrado), usa o maior valor presente pra
  // não dividir por zero e ainda assim desenhar alguma barra.
  const base = counters.contacts || Math.max(counters.meetings_scheduled, counters.meetings_held, counters.sales_count, 1);

  const stages: Array<{ key: keyof ActivityCounters; rate: number | null; afterLabel?: string }> = [
    { key: 'contacts', rate: null },
    { key: 'meetings_scheduled', rate: rates.contactToScheduled },
    { key: 'meetings_held', rate: rates.scheduledToHeld },
    { key: 'sales_count', rate: rates.heldToSale },
  ];

  const noShow = rates.scheduledToHeld === null ? null : 100 - rates.scheduledToHeld;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Funil comercial</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {stages.map((stage, idx) => {
          const value = counters[stage.key];
          const pct = base > 0 ? Math.max((value / base) * 100, value > 0 ? 4 : 0) : 0;
          return (
            <div key={stage.key} className="min-w-0">
              {idx > 0 && (
                <div className="flex items-center gap-1.5 py-1 pl-1 text-xs text-muted-foreground">
                  <ArrowDown className="h-3 w-3 shrink-0" />
                  <span>{fmtRate(stage.rate)}</span>
                  {idx === 2 && noShow !== null && (
                    <Badge variant="warning" className="ml-1 text-[10px] py-0">
                      {noShow.toFixed(1)}% no-show
                    </Badge>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-28 sm:w-36 shrink-0 truncate text-xs text-muted-foreground text-right">
                  {ACTIVITY_METRIC_LABEL[stage.key]}
                </div>
                <div className="h-8 flex-1 min-w-0 overflow-hidden rounded-md bg-muted">
                  <div
                    className="flex h-full items-center justify-end rounded-md px-2 text-xs font-semibold text-white transition-all"
                    style={{ width: `${pct}%`, backgroundColor: STAGE_COLOR[stage.key] }}
                  >
                    {value > 0 && value}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

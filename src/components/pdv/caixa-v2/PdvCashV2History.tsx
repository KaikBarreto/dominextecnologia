import { ChevronLeft, ChevronRight, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  PdvCashHistoryFilters,
  PdvCashV2Session,
  PdvCashV2Terminal,
} from '@/hooks/usePdvCashSessionsV2';
import { cn } from '@/lib/utils';

interface Props {
  rows: PdvCashV2Session[];
  terminals: PdvCashV2Terminal[];
  operators: Record<string, string>;
  filters: PdvCashHistoryFilters;
  hasMore: boolean;
  isLoading: boolean;
  canFilterOperator: boolean;
  money: (value: number) => string;
  dateTime: (value: string | Date | null | undefined) => string;
  onFiltersChange: (filters: PdvCashHistoryFilters) => void;
}

const ALL = '__all__';

export function PdvCashV2History({
  rows,
  terminals,
  operators,
  filters,
  hasMore,
  isLoading,
  canFilterOperator,
  money,
  dateTime,
  onFiltersChange,
}: Props) {
  const terminalName = (id: string) => terminals.find((terminal) => terminal.id === id)?.name ?? 'Terminal';

  return (
    <Card>
      <CardHeader className="gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" /> Histórico de caixas
        </CardTitle>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select
            value={filters.terminalId ?? ALL}
            onValueChange={(value) => onFiltersChange({
              ...filters,
              terminalId: value === ALL ? null : value,
              page: 0,
            })}
          >
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Todos os terminais" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os terminais</SelectItem>
              {terminals.map((terminal) => (
                <SelectItem key={terminal.id} value={terminal.id}>{terminal.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canFilterOperator ? (
            <Select
              value={filters.operatorId ?? ALL}
              onValueChange={(value) => onFiltersChange({
                ...filters,
                operatorId: value === ALL ? null : value,
                page: 0,
              })}
            >
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Todos os operadores" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os operadores</SelectItem>
                {Object.entries(operators).map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando histórico…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum caixa fechado neste filtro.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {rows.map((row) => {
              const difference = row.difference ?? 0;
              return (
                <div key={row.id} className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_repeat(3,minmax(105px,auto))] sm:items-center">
                  <div className="min-w-0">
                    <p className="font-semibold">{terminalName(row.terminalId)}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.openedBy ? (operators[row.openedBy] ?? 'Operador') : 'Operador'} · {dateTime(row.closedAt)}
                    </p>
                  </div>
                  <HistoryValue label="Esperado" value={row.expectedAmount == null ? '—' : money(row.expectedAmount)} />
                  <HistoryValue label="Contado" value={row.countedAmount == null ? '—' : money(row.countedAmount)} />
                  <HistoryValue
                    label="Diferença"
                    value={row.difference == null ? '—' : money(difference)}
                    className={cn(
                      row.difference != null && difference < 0 && 'text-destructive',
                      row.difference != null && difference >= 0 && 'text-foreground',
                    )}
                  />
                </div>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Página {filters.page + 1}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page === 0 || isLoading}
              onClick={() => onFiltersChange({ ...filters, page: Math.max(0, filters.page - 1) })}
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasMore || isLoading}
              onClick={() => onFiltersChange({ ...filters, page: filters.page + 1 })}
            >
              Próxima <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryValue({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:block sm:text-right">
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className={cn('whitespace-nowrap font-semibold tabular-nums', className)}>{value}</p>
    </div>
  );
}

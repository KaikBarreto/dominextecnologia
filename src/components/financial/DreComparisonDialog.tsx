import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Plus, X } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { differenceInCalendarDays, differenceInCalendarMonths, endOfMonth, isSameDay, startOfMonth, subDays, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatDrePeriodLabel } from '@/lib/dre-period-label';

interface DreComparisonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPeriodLabel: string;
  value?: DateRange[];
  suggestedValue?: DateRange;
  onApply: (ranges?: DateRange[]) => void;
}

const MAX_COMPARISONS = 3;
const isComplete = (range?: DateRange): range is Required<DateRange> => Boolean(range?.from && range.to);
const periodKey = (range: DateRange) => isComplete(range) ? `${range.from.toISOString()}:${range.to.toISOString()}` : '';
const periodLabel = (range?: DateRange) => isComplete(range)
  ? formatDrePeriodLabel(range)
  : 'Selecione o período';
const priorRange = (range?: DateRange) => {
  if (!isComplete(range)) return undefined;
  const coversWholeMonths = isSameDay(range.from, startOfMonth(range.from))
    && isSameDay(range.to, endOfMonth(range.to));
  if (coversWholeMonths) {
    const months = differenceInCalendarMonths(range.to, range.from) + 1;
    return {
      from: startOfMonth(subMonths(range.from, months)),
      to: endOfMonth(subMonths(range.to, months)),
    };
  }
  const days = differenceInCalendarDays(range.to, range.from);
  const to = subDays(range.from, 1);
  return { from: subDays(to, days), to };
};

export function DreComparisonDialog({
  open,
  onOpenChange,
  currentPeriodLabel,
  value = [],
  suggestedValue,
  onApply,
}: DreComparisonDialogProps) {
  const isMobile = useIsMobile();
  const [selected, setSelected] = useState<DateRange[]>(value);
  const [draft, setDraft] = useState<DateRange | undefined>(suggestedValue);

  useEffect(() => {
    if (!open) return;
    setSelected(value);
    setDraft(priorRange(value.at(-1)) ?? suggestedValue);
  }, [open, suggestedValue, value]);

  const rangesToApply = useMemo(() => {
    if (!isComplete(draft) || selected.length >= MAX_COMPARISONS) return selected;
    if (selected.some((range) => periodKey(range) === periodKey(draft))) return selected;
    return [...selected, draft];
  }, [draft, selected]);

  const addDraft = () => {
    if (!isComplete(draft) || selected.length >= MAX_COMPARISONS) return;
    if (selected.some((range) => periodKey(range) === periodKey(draft))) return;
    const next = [...selected, draft];
    setSelected(next);
    setDraft(priorRange(draft));
  };

  const apply = () => {
    if (rangesToApply.length === 0) return;
    onApply(rangesToApply);
    onOpenChange(false);
  };

  const removeAll = () => {
    onApply(undefined);
    onOpenChange(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px]" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 grid max-h-[92vh] w-[calc(100vw-2rem)] max-w-[820px] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border bg-background p-6 text-foreground shadow-2xl">
          <div className="space-y-1.5 pr-8">
            <DialogPrimitive.Title className="text-lg font-semibold leading-none">Comparar períodos</DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              Adicione até três períodos para visualizar valores e percentuais lado a lado.
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Fechar">
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>

          <div className="flex flex-wrap gap-2">
            <div className="min-w-[190px] flex-1 rounded-lg border bg-muted/30 px-3 py-2">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Período atual</span>
              <span className="mt-0.5 block truncate text-sm font-medium">{currentPeriodLabel}</span>
            </div>
            {selected.map((range, index) => (
              <div key={periodKey(range)} className="flex min-w-[190px] flex-1 items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Comparação {index + 1}</span>
                  <span className="mt-0.5 block truncate text-sm font-medium">{periodLabel(range)}</span>
                </div>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setSelected((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  aria-label={`Remover comparação ${index + 1}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {selected.length < MAX_COMPARISONS && (
            <div className="rounded-lg border p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CalendarRange className="h-4 w-4" />
                  Escolha um período de comparação
                </div>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addDraft} disabled={!isComplete(draft)}>
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar período
                </Button>
              </div>
              <Calendar
                mode="range"
                selected={draft}
                onSelect={setDraft}
                locale={ptBR}
                numberOfMonths={isMobile ? 1 : 2}
                defaultMonth={draft?.from}
                className="p-0"
              />
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {value.length > 0 && (
                <Button type="button" variant="ghost" onClick={removeAll}>Remover comparações</Button>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="button" onClick={apply} disabled={rangesToApply.length === 0}>Aplicar comparação</Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

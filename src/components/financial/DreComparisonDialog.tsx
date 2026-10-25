import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Check,
  History,
  Pencil,
  Plus,
  X,
} from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from '@/components/ui/DateRangeFilter';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { formatDrePeriodLabel } from '@/lib/dre-period-label';
import { getDreComparisonRange, type DreComparisonMode } from '@/lib/dre-period-comparison';

interface DreComparisonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentRange: DateRange;
  value?: DateRange[];
  onApply: (currentRange: DateRange, ranges?: DateRange[]) => void;
}

const MAX_COMPARISONS = 3;
const EMPTY_RANGES: DateRange[] = [];
const isComplete = (range?: DateRange): range is Required<DateRange> => Boolean(range?.from && range.to);
const periodKey = (range?: DateRange) => isComplete(range)
  ? `${format(range.from, 'yyyy-MM-dd')}:${format(range.to, 'yyyy-MM-dd')}`
  : '';
const periodLabel = (range?: DateRange) => isComplete(range)
  ? formatDrePeriodLabel(range)
  : 'Selecione o período';

type PreviewPeriod = {
  key: string;
  label: string;
  range: Required<DateRange>;
  kind: 'current' | 'comparison';
  comparisonIndex?: number;
};

export function DreComparisonDialog({
  open,
  onOpenChange,
  currentRange,
  value = EMPTY_RANGES,
  onApply,
}: DreComparisonDialogProps) {
  const isMobile = useIsMobile();
  const [currentDraft, setCurrentDraft] = useState<DateRange>(currentRange);
  const [selected, setSelected] = useState<DateRange[]>(value);
  const [customDraft, setCustomDraft] = useState<DateRange | undefined>();
  const [editingCurrent, setEditingCurrent] = useState(false);
  const [choosingCustom, setChoosingCustom] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCurrentDraft(currentRange);
    setSelected(value);
    setCustomDraft(getDreComparisonRange(currentRange, 'previous_period'));
    setEditingCurrent(false);
    setChoosingCustom(false);
  }, [currentRange, open, value]);

  const selectedComparisons = useMemo(
    () => selected.filter((range) => isComplete(range) && periodKey(range) !== periodKey(currentDraft)),
    [currentDraft, selected],
  );

  const presets = useMemo(() => ([
    {
      mode: 'previous_period' as const,
      title: 'Período anterior',
      description: 'Mesmo número de dias, imediatamente antes',
      icon: History,
      range: getDreComparisonRange(currentDraft, 'previous_period'),
    },
    {
      mode: 'previous_year' as const,
      title: 'Mesmo período no ano passado',
      description: 'Mantém as mesmas datas, um ano antes',
      icon: CalendarClock,
      range: getDreComparisonRange(currentDraft, 'previous_year'),
    },
  ]), [currentDraft]);

  const togglePreset = (mode: DreComparisonMode, range?: DateRange) => {
    if (!isComplete(range)) return;
    const key = periodKey(range);
    const alreadySelected = selectedComparisons.some((item) => periodKey(item) === key);
    if (alreadySelected) {
      setSelected((current) => current.filter((item) => periodKey(item) !== key));
      return;
    }
    if (selectedComparisons.length >= MAX_COMPARISONS) return;
    setSelected((current) => [...current, range]);
    if (mode !== 'none') setChoosingCustom(false);
  };

  const addCustom = () => {
    if (!isComplete(customDraft) || selectedComparisons.length >= MAX_COMPARISONS) return;
    const key = periodKey(customDraft);
    if (key === periodKey(currentDraft)) return;
    if (!selectedComparisons.some((range) => periodKey(range) === key)) {
      setSelected((current) => [...current, customDraft]);
    }
    setCustomDraft(getDreComparisonRange(customDraft, 'previous_period'));
    setChoosingCustom(false);
  };

  const previewPeriods = useMemo<PreviewPeriod[]>(() => {
    if (!isComplete(currentDraft)) return [];
    return [
      {
        key: `current:${periodKey(currentDraft)}`,
        label: periodLabel(currentDraft),
        range: currentDraft,
        kind: 'current' as const,
      },
      ...selectedComparisons.map((range, index) => ({
        key: `comparison:${periodKey(range)}`,
        label: periodLabel(range),
        range: range as Required<DateRange>,
        kind: 'comparison' as const,
        comparisonIndex: index,
      })),
    ].sort((a, b) => a.range.from.getTime() - b.range.from.getTime());
  }, [currentDraft, selectedComparisons]);

  const variationPreview = useMemo(() => {
    if (!isComplete(currentDraft) || !isComplete(selectedComparisons[0])) return undefined;
    return [
      { label: periodLabel(currentDraft), range: currentDraft },
      { label: periodLabel(selectedComparisons[0]), range: selectedComparisons[0] as Required<DateRange> },
    ].sort((a, b) => a.range.from.getTime() - b.range.from.getTime());
  }, [currentDraft, selectedComparisons]);

  const apply = () => {
    if (!isComplete(currentDraft) || selectedComparisons.length === 0) return;
    onApply(currentDraft, selectedComparisons);
    onOpenChange(false);
  };

  const removeAll = () => {
    if (!isComplete(currentDraft)) return;
    onApply(currentDraft, undefined);
    onOpenChange(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px]" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 grid max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-[880px] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-xl border bg-background p-4 text-foreground shadow-2xl sm:p-6">
          <div className="space-y-1.5 pr-8">
            <DialogPrimitive.Title className="text-lg font-semibold leading-none">Comparar períodos</DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              Defina o período principal e escolha até três referências para comparar lado a lado.
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Fechar">
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>

          <section aria-labelledby="dre-current-period-title" className="rounded-lg border bg-muted/20 p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <span id="dre-current-period-title" className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Período principal</span>
                <span className="mt-1 block text-base font-semibold">{periodLabel(currentDraft)}</span>
              </div>
              <Button type="button" variant="outline" size="sm" className="w-full gap-2 sm:w-auto" onClick={() => setEditingCurrent((current) => !current)}>
                <Pencil className="h-3.5 w-3.5" />
                {editingCurrent ? 'Fechar calendário' : 'Alterar período'}
              </Button>
            </div>
            {editingCurrent && (
              <div className="mt-4 border-t pt-4">
                <p className="mb-3 text-xs text-muted-foreground">Selecione a data inicial e a data final do período principal.</p>
                <Calendar
                  mode="range"
                  selected={currentDraft}
                  onSelect={(range) => setCurrentDraft({ from: range?.from, to: range?.to })}
                  locale={ptBR}
                  numberOfMonths={isMobile ? 1 : 2}
                  defaultMonth={currentDraft.from}
                  className="p-0"
                />
                <div className="mt-3 flex justify-end">
                  <Button type="button" size="sm" onClick={() => setEditingCurrent(false)} disabled={!isComplete(currentDraft)}>
                    Usar este período
                  </Button>
                </div>
              </div>
            )}
          </section>

          <section aria-labelledby="dre-quick-comparison-title" className="space-y-3">
            <div>
              <h3 id="dre-quick-comparison-title" className="text-sm font-semibold">Comparar com</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Escolha uma sugestão pronta ou defina outras datas.</p>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {presets.map(({ mode, title, description, icon: Icon, range }) => {
                const active = selectedComparisons.some((item) => periodKey(item) === periodKey(range));
                const disabled = !isComplete(range) || (!active && selectedComparisons.length >= MAX_COMPARISONS);
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => togglePreset(mode, range)}
                    disabled={disabled}
                    aria-pressed={active}
                    className={cn(
                      'group flex min-h-[104px] items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                      active ? 'border-primary bg-primary/5' : 'hover:border-foreground/25 hover:bg-muted/40',
                    )}
                  >
                    <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground', active && 'bg-primary text-primary-foreground')}>
                      {active ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-snug">{title}</span>
                      <span className="mt-1 block text-xs leading-snug text-muted-foreground">{description}</span>
                      <span className="mt-2 block text-xs font-medium text-foreground">{periodLabel(range)}</span>
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setChoosingCustom((current) => !current)}
                disabled={!choosingCustom && selectedComparisons.length >= MAX_COMPARISONS}
                aria-expanded={choosingCustom}
                className={cn(
                  'group flex min-h-[104px] items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                  choosingCustom ? 'border-primary bg-primary/5' : 'hover:border-foreground/25 hover:bg-muted/40',
                )}
              >
                <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground', choosingCustom && 'bg-primary text-primary-foreground')}>
                  <CalendarDays className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">Outro período</span>
                  <span className="mt-1 block text-xs leading-snug text-muted-foreground">Escolha datas personalizadas no calendário</span>
                </span>
              </button>
            </div>
          </section>

          {choosingCustom && (
            <section aria-labelledby="dre-custom-comparison-title" className="rounded-lg border p-3 sm:p-4">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 id="dre-custom-comparison-title" className="flex items-center gap-2 text-sm font-semibold">
                    <CalendarRange className="h-4 w-4" />
                    Outro período de comparação
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">{periodLabel(customDraft)}</p>
                </div>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addCustom} disabled={!isComplete(customDraft)}>
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar período
                </Button>
              </div>
              <Calendar
                mode="range"
                selected={customDraft}
                onSelect={(range) => setCustomDraft(range
                  ? { from: range.from, to: range.to }
                  : undefined)}
                locale={ptBR}
                numberOfMonths={isMobile ? 1 : 2}
                defaultMonth={customDraft?.from}
                className="p-0"
              />
            </section>
          )}

          {selectedComparisons.length > 0 && (
            <section aria-labelledby="dre-selected-comparisons-title" className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h3 id="dre-selected-comparisons-title" className="text-sm font-semibold">Períodos adicionados</h3>
                <span className="text-xs text-muted-foreground">{selectedComparisons.length} de {MAX_COMPARISONS}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {selectedComparisons.map((range, index) => (
                  <div key={periodKey(range)} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
                    <div className="min-w-0">
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {index === 0 ? 'Comparação principal' : `Comparação ${index + 1}`}
                      </span>
                      <span className="mt-0.5 block truncate text-sm font-medium">{periodLabel(range)}</span>
                    </div>
                    <button
                      type="button"
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setSelected((current) => current.filter((item) => periodKey(item) !== periodKey(range)))}
                      aria-label={`Remover ${periodLabel(range)}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section aria-labelledby="dre-comparison-preview-title" className="overflow-hidden rounded-lg border">
            <div className="border-b bg-muted/40 px-3 py-2.5 sm:px-4">
              <h3 id="dre-comparison-preview-title" className="text-sm font-semibold">Prévia das colunas</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Da mais antiga para a mais recente, como aparecerá no DRE.</p>
            </div>
            {selectedComparisons.length === 0 ? (
              <div className="px-4 py-5 text-center text-sm text-muted-foreground">
                Escolha ao menos um período para visualizar o comparativo.
              </div>
            ) : (
              <div className="space-y-3 p-3 sm:p-4">
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:overflow-x-auto sm:pb-1">
                  <div className="flex w-full min-w-0 items-center rounded-md bg-slate-900 px-3 py-3 text-xs font-semibold text-white sm:min-w-[150px] sm:flex-1">Estrutura do DRE</div>
                  {previewPeriods.map((item, index) => (
                    <div key={item.key} className="contents">
                      {index > 0 && <ArrowRight className="h-4 w-4 shrink-0 rotate-90 self-center text-muted-foreground sm:rotate-0" aria-hidden="true" />}
                      <div className={cn('w-full min-w-0 rounded-md border px-3 py-2.5 text-center sm:min-w-[150px] sm:flex-1', item.kind === 'current' && 'border-primary bg-primary/5')}>
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {item.kind === 'current' ? 'Período principal' : item.comparisonIndex === 0 ? 'Comparação principal' : `Comparação ${(item.comparisonIndex ?? 0) + 1}`}
                        </span>
                        <span className="mt-1 block whitespace-nowrap text-xs font-semibold tabular-nums">{item.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {variationPreview && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">Variação no Excel:</span>{' '}
                    {variationPreview[1].label} − {variationPreview[0].label}. Um valor positivo indica aumento da coluna da direita.
                  </p>
                )}
              </div>
            )}
          </section>

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {value.length > 0 && (
                <Button type="button" variant="ghost" onClick={removeAll}>Remover comparações</Button>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="button" onClick={apply} disabled={!isComplete(currentDraft) || selectedComparisons.length === 0}>Aplicar comparação</Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

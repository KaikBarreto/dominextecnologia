import * as React from 'react';
import { format } from 'date-fns';
import { AlertTriangle, CalendarIcon, Loader2 } from 'lucide-react';
import type { DayContentProps } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { getDateFnsLocale } from '@/lib/format';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';

export type DatePickerIndicatorColor = 'amber' | 'blue' | 'violet';

export interface DatePickerDayIndicator {
  date: string;
  color: DatePickerIndicatorColor;
  label: string;
}

export interface DatePickerIndicatorLegendItem {
  color: DatePickerIndicatorColor;
  label: string;
}

export interface DatePickerIndicatorStatus {
  type: 'loading' | 'error';
  label: string;
}

export interface DatePickerProps {
  /** Valor no formato do banco: `yyyy-MM-dd`. String vazia = sem data. */
  value: string;
  onValueChange: (value: string) => void;
  /** Limites do calendário, também em `yyyy-MM-dd`. */
  min?: string;
  max?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  /** Mostra a ação de limpar dentro do calendário (campo de data opcional). */
  clearable?: boolean;
  clearLabel?: string;
  /**
   * Rótulo de leitor de tela pro campo que não tem `<Label>` visível ao lado
   * (filtro de período "de/até", por exemplo). Existe porque o gatilho é um
   * `<button>`: ele não herda `aria-label` por spread como o `<input>` herdava.
   */
  ariaLabel?: string;
  /** Espelha o `aria-invalid` do `Input`: campo com erro de validação. */
  ariaInvalid?: boolean;
  /** Marcadores operacionais opcionais. Não usar em calendários cadastrais. */
  indicators?: DatePickerDayIndicator[];
  /** Legenda exibida no rodapé do calendário quando há marcadores. */
  indicatorLegend?: DatePickerIndicatorLegendItem[];
  /** Estado da consulta que alimenta os marcadores operacionais. */
  indicatorStatus?: DatePickerIndicatorStatus;
  /** Mês inicial quando o campo ainda não possui valor. */
  initialMonth?: string;
  /** Informa o mês navegado para carregamento sob demanda dos marcadores. */
  onVisibleMonthChange?: (month: Date) => void;
}

const INDICATOR_COLOR_CLASS: Record<DatePickerIndicatorColor, string> = {
  amber: 'bg-amber-500',
  blue: 'bg-blue-600',
  violet: 'bg-violet-500',
};

/**
 * Converte `yyyy-MM-dd` em `Date` LOCAL, sem passar por UTC.
 *
 * `new Date('2026-09-19')` é interpretado como meia-noite UTC e, no fuso do
 * Brasil (UTC-3), volta como dia 18. Montar com os componentes evita isso.
 */
export function parseIsoDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** `Date` → `yyyy-MM-dd` usando os componentes LOCAIS (mesma razão acima). */
export function toIsoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Janela de anos que o seletor de ano oferece quando o campo não declara
 * `min`/`max`. 100 anos pra trás existe por causa de DATA DE NASCIMENTO (o
 * caso que inviabilizava o calendário só com a setinha de mês) e das datas de
 * fabricação/instalação de equipamento antigo; 20 anos pra frente cobre
 * contrato longo e parcelamento esticado.
 */
const DEFAULT_YEARS_BACK = 100;
const DEFAULT_YEARS_AHEAD = 20;

/**
 * Faixa de anos do seletor. Sempre ENGLOBA o valor já gravado: dado legado
 * fora da janela (ano digitado errado, importação antiga) continua visível e
 * selecionável — senão o campo mostraria uma data que o calendário se recusa a
 * navegar, e salvar viraria um beco sem saída.
 */
export function resolveYearRange(
  selected: Date | undefined,
  minDate: Date | undefined,
  maxDate: Date | undefined,
  today: Date = new Date(),
): { fromYear: number; toYear: number } {
  const currentYear = today.getFullYear();
  let fromYear = minDate ? minDate.getFullYear() : currentYear - DEFAULT_YEARS_BACK;
  let toYear = maxDate ? maxDate.getFullYear() : currentYear + DEFAULT_YEARS_AHEAD;

  if (selected) {
    const selectedYear = selected.getFullYear();
    fromYear = Math.min(fromYear, selectedYear);
    toYear = Math.max(toYear, selectedYear);
  }

  // `min` depois de `max` é erro de chamada, mas não pode quebrar a tela:
  // o calendário ficaria sem nenhum mês navegável.
  if (toYear < fromYear) toYear = fromYear;

  return { fromYear, toYear };
}

/**
 * Campo de data padrão do sistema: botão com a data no formato do idioma do
 * usuário + calendário do sistema (Popover + `Calendar`).
 *
 * Existe porque o `<input type="date">` nativo desenha o calendário do
 * NAVEGADOR: visual genérico, fora do tema do app, com rótulos no idioma do
 * sistema operacional (não no do tenant) e diferente em cada navegador. O valor
 * continua sendo a mesma string `yyyy-MM-dd` de antes, então trocar o campo não
 * mexe em nenhum schema, payload ou validação.
 */
export function DatePicker({
  value,
  onValueChange,
  min,
  max,
  disabled,
  placeholder,
  className,
  id,
  clearable = false,
  clearLabel,
  ariaLabel,
  ariaInvalid,
  indicators = [],
  indicatorLegend = [],
  indicatorStatus,
  initialMonth,
  onVisibleMonthChange,
}: DatePickerProps) {
  const { locale } = useAppLocaleContext();
  const dateFnsLocale = getDateFnsLocale(locale);
  const [open, setOpen] = React.useState(false);

  const selected = parseIsoDate(value);
  const initialMonthDate = initialMonth ? parseIsoDate(initialMonth) : undefined;
  const minDate = min ? parseIsoDate(min) : undefined;
  const maxDate = max ? parseIsoDate(max) : undefined;

  // `dd/MM/yyyy` em pt-br; nos demais idiomas o formato curto da própria locale.
  const displayFormat = locale === 'pt-br' ? 'dd/MM/yyyy' : 'P';

  const { fromYear, toYear } = resolveYearRange(selected ?? initialMonthDate, minDate, maxDate);
  const indicatorsByDate = React.useMemo(() => {
    const grouped = new Map<string, DatePickerDayIndicator[]>();
    for (const indicator of indicators) {
      const current = grouped.get(indicator.date) ?? [];
      if (!current.some((item) => item.color === indicator.color && item.label === indicator.label)) {
        current.push(indicator);
      }
      grouped.set(indicator.date, current);
    }
    return grouped;
  }, [indicators]);

  const IndicatorDayContent = React.useCallback(({ date }: DayContentProps) => {
    const dayIndicators = indicatorsByDate.get(toIsoDate(date)) ?? [];
    return (
      <span
        className="relative flex h-9 w-9 items-center justify-center"
        title={dayIndicators.length > 0 ? dayIndicators.map((indicator) => indicator.label).join(' • ') : undefined}
      >
        <span>{date.getDate()}</span>
        {dayIndicators.length > 0 && (
          <span className="pointer-events-none absolute bottom-0.5 left-1/2 flex -translate-x-1/2 gap-0.5" aria-hidden="true">
            {dayIndicators.map((indicator) => (
              <span
                key={`${indicator.color}:${indicator.label}`}
                className={cn('h-1.5 w-1.5 rounded-full ring-1 ring-background', INDICATOR_COLOR_CLASS[indicator.color])}
              />
            ))}
          </span>
        )}
        {dayIndicators.length > 0 && (
          <span className="sr-only">, {dayIndicators.map((indicator) => indicator.label).join(', ')}</span>
        )}
      </span>
    );
  }, [indicatorsByDate]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          className={cn(
            // `h-10 px-3 text-base md:text-sm` = a mesma caixa do `Input`, pra o
            // campo ficar rente aos irmãos na grade do formulário (o botão
            // padrão vem com `px-4`/`text-sm` e desalinhava).
            'h-10 w-full justify-start px-3 text-left text-base font-normal md:text-sm',
            // Hover discreto (régua): `bg-muted`, nunca o accent saturado.
            'hover:bg-muted hover:text-foreground data-[state=open]:bg-muted',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-70" />
          <span className="truncate">
            {selected ? format(selected, displayFormat, { locale: dateFnsLocale }) : (placeholder ?? '')}
          </span>
        </Button>
      </PopoverTrigger>
      {/* `max-w` + `collisionPadding`: em tela estreita o calendário encosta na
          borda em vez de ser cortado (o popover vive dentro de modal, que no
          mobile já é um drawer colado nas laterais).
          `--radix-popover-content-available-height` é o espaço que SOBRA entre
          o gatilho e a borda da janela: com o campo perto do rodapé, o
          calendário rola por dentro em vez de vazar pra fora da tela. */}
      <PopoverContent
        className="w-auto max-w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto p-0 max-h-[var(--radix-popover-content-available-height)]"
        align="start"
        collisionPadding={12}
      >
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? initialMonthDate}
          onSelect={(date) => {
            if (!date) return;
            onValueChange(toIsoDate(date));
            setOpen(false);
          }}
          disabled={
            minDate || maxDate
              ? (date: Date) => (!!minDate && date < minDate) || (!!maxDate && date > maxDate)
              : undefined
          }
          // Mês e ano viram seletor: sem isso, achar uma data de nascimento era
          // descer de mês em mês na setinha.
          captionLayout="dropdown-buttons"
          fromYear={fromYear}
          toYear={toYear}
          onMonthChange={onVisibleMonthChange}
          initialFocus
          locale={dateFnsLocale}
          components={{ DayContent: IndicatorDayContent }}
        />
        {(indicatorLegend.length > 0 || indicatorStatus) && (
          <div className="space-y-2 border-t border-border px-3 py-2 text-xs">
            {indicatorLegend.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                {indicatorLegend.map((item) => (
                  <span key={`${item.color}:${item.label}`} className="inline-flex items-center gap-1.5">
                    <span className={cn('h-2 w-2 rounded-full', INDICATOR_COLOR_CLASS[item.color])} aria-hidden="true" />
                    {item.label}
                  </span>
                ))}
              </div>
            )}
            {indicatorStatus && (
              <div
                role={indicatorStatus.type === 'error' ? 'alert' : 'status'}
                aria-live="polite"
                className={cn(
                  'flex items-start gap-1.5 leading-4',
                  indicatorStatus.type === 'error' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground',
                )}
              >
                {indicatorStatus.type === 'error' ? (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
                )}
                <span>{indicatorStatus.label}</span>
              </div>
            )}
          </div>
        )}
        {clearable && value && (
          <div className="border-t border-border p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onValueChange('');
                setOpen(false);
              }}
            >
              {clearLabel ?? ''}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

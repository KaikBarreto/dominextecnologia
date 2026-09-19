import * as React from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { getDateFnsLocale } from '@/lib/format';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';

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
}

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
}: DatePickerProps) {
  const { locale } = useAppLocaleContext();
  const dateFnsLocale = getDateFnsLocale(locale);
  const [open, setOpen] = React.useState(false);

  const selected = parseIsoDate(value);
  const minDate = min ? parseIsoDate(min) : undefined;
  const maxDate = max ? parseIsoDate(max) : undefined;

  // `dd/MM/yyyy` em pt-br; nos demais idiomas o formato curto da própria locale.
  const displayFormat = locale === 'pt-br' ? 'dd/MM/yyyy' : 'P';

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal',
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
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
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
          initialFocus
          locale={dateFnsLocale}
        />
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

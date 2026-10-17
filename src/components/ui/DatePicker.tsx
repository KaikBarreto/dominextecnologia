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
  /**
   * Rótulo de leitor de tela pro campo que não tem `<Label>` visível ao lado
   * (filtro de período "de/até", por exemplo). Existe porque o gatilho é um
   * `<button>`: ele não herda `aria-label` por spread como o `<input>` herdava.
   */
  ariaLabel?: string;
  /** Espelha o `aria-invalid` do `Input`: campo com erro de validação. */
  ariaInvalid?: boolean;
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
}: DatePickerProps) {
  const { locale } = useAppLocaleContext();
  const dateFnsLocale = getDateFnsLocale(locale);
  const [open, setOpen] = React.useState(false);

  const selected = parseIsoDate(value);
  const minDate = min ? parseIsoDate(min) : undefined;
  const maxDate = max ? parseIsoDate(max) : undefined;

  // `dd/MM/yyyy` em pt-br; nos demais idiomas o formato curto da própria locale.
  const displayFormat = locale === 'pt-br' ? 'dd/MM/yyyy' : 'P';

  const { fromYear, toYear } = resolveYearRange(selected, minDate, maxDate);

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
        className="w-auto max-w-[calc(100vw-1.5rem)] overflow-y-auto p-0 max-h-[var(--radix-popover-content-available-height)]"
        align="start"
        collisionPadding={12}
      >
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
          // Mês e ano viram seletor: sem isso, achar uma data de nascimento era
          // descer de mês em mês na setinha.
          captionLayout="dropdown-buttons"
          fromYear={fromYear}
          toYear={toYear}
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

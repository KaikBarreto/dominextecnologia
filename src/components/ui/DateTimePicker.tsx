import * as React from 'react';
import { format, parse, isValid } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TimeWheel } from '@/components/ui/time-wheel';
import { resolveYearRange } from '@/components/ui/DatePicker';
import { cn } from '@/lib/utils';
import { getDateFnsLocale } from '@/lib/format';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useIsCompact } from '@/hooks/use-mobile';
import { MESSAGES } from '@/lib/i18n/messages';

/** Mesmo formato que um `<input type="datetime-local">` entrega e consome. */
const DT_FORMAT = "yyyy-MM-dd'T'HH:mm";
const pad2 = (n: number) => String(n).padStart(2, '0');

export interface DateTimePickerProps {
  /** Valor no formato `yyyy-MM-ddTHH:mm`. String vazia = sem data. */
  value: string;
  onValueChange: (value: string) => void;
  /** Limites, também em `yyyy-MM-ddTHH:mm`. */
  min?: string;
  max?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  /** Esconde a ação "Limpar" quando o campo é obrigatório. */
  clearable?: boolean;
  /** Rótulo de leitor de tela pro campo sem `<Label>` visível ao lado. */
  ariaLabel?: string;
  /** Espelha o `aria-invalid` do `Input`: campo com erro de validação. */
  ariaInvalid?: boolean;
  /** Passo dos minutos na roleta (default 1). */
  minuteStep?: number;
}

/**
 * `yyyy-MM-ddTHH:mm` → `Date` LOCAL.
 *
 * `new Date('2026-09-19T08:00')` sem offset é interpretado de formas
 * diferentes por engine (algumas como UTC), o que no Brasil devolvia o dia ou
 * a hora errada. `parse` ancora nos componentes locais: a hora escolhida é a
 * hora usada.
 */
export function parseIsoDateTime(value: string): Date | undefined {
  if (!value) return undefined;
  const parsed = parse(value, DT_FORMAT, new Date());
  return isValid(parsed) ? parsed : undefined;
}

/** `Date` → `yyyy-MM-ddTHH:mm` pelos componentes LOCAIS (mesma razão acima). */
export function toIsoDateTime(date: Date): string {
  return format(date, DT_FORMAT);
}

/**
 * Campo de DATA + HORA padrão do sistema: botão com o valor no formato do
 * idioma do usuário e, num popover só, calendário (dia) + roleta (hora).
 *
 * Existe pelo mesmo motivo do `DatePicker`: o `<input type="datetime-local">`
 * nativo desenha o widget do NAVEGADOR — visual genérico, fora do tema, com
 * rótulos no idioma do sistema operacional (não no do tenant) e diferente em
 * cada navegador. O valor continua a mesma string `yyyy-MM-ddTHH:mm` de antes,
 * então trocar o campo não mexe em schema, payload nem validação.
 *
 * Popover nos dois tamanhos de tela (não Drawer no mobile): estes campos vivem
 * DENTRO de modais, que no mobile já são drawer — abrir um drawer dentro do
 * outro briga pelo controle de scroll. O popover já é o que o `DatePicker` faz
 * em produção nessa mesma situação. O que muda no mobile é o empilhamento:
 * calendário em cima, roleta embaixo (lado a lado não cabe em 360px).
 */
export function DateTimePicker({
  value,
  onValueChange,
  min,
  max,
  disabled,
  placeholder,
  className,
  id,
  clearable = true,
  minuteStep = 1,
  ariaLabel,
  ariaInvalid,
}: DateTimePickerProps) {
  const { locale } = useAppLocaleContext();
  const isCompact = useIsCompact();
  const dateFnsLocale = getDateFnsLocale(locale);
  const common = MESSAGES[locale].app.common;
  const t = common.datePicker;
  const [open, setOpen] = React.useState(false);

  const selected = parseIsoDateTime(value);
  const minDate = parseIsoDateTime(min ?? '');
  const maxDate = parseIsoDateTime(max ?? '');

  // `dd/MM/yyyy HH:mm` em pt-br; nos demais, o formato curto da própria locale.
  const displayFormat = locale === 'pt-br' ? 'dd/MM/yyyy HH:mm' : 'P HH:mm';

  const { fromYear, toYear } = resolveYearRange(selected, minDate, maxDate);

  // Comparação só do DIA: a hora é escolhida na roleta, então um `min` às
  // 14:00 não pode apagar o próprio dia do calendário.
  const startOfDay = (date: Date) => {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };

  const isDayOutOfRange = (date: Date) =>
    (!!minDate && date < startOfDay(minDate)) || (!!maxDate && date > startOfDay(maxDate));

  // Trocar o DIA preserva a hora já escolhida (ou 00:00 se ainda não há).
  // O popover fica ABERTO: a pessoa ainda precisa ajustar a hora.
  const handleDaySelect = (date: Date | undefined) => {
    if (!date) return;
    const next = new Date(date);
    next.setHours(selected ? selected.getHours() : 0, selected ? selected.getMinutes() : 0, 0, 0);
    onValueChange(toIsoDateTime(next));
  };

  // Trocar a HORA preserva o dia já escolhido (ou hoje, se o campo está vazio).
  const handleTimeChange = (time: string) => {
    const [hours, minutes] = time.split(':').map((part) => parseInt(part, 10));
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return;
    const next = selected ? new Date(selected) : new Date();
    next.setHours(hours, minutes, 0, 0);
    onValueChange(toIsoDateTime(next));
  };

  // "Agora" nunca ultrapassa `max` — o caso real desse limite é `max = agora`.
  const handleNow = () => {
    let now = new Date();
    now.setSeconds(0, 0);
    if (maxDate && now > maxDate) now = new Date(maxDate);
    if (minDate && now < minDate) now = new Date(minDate);
    onValueChange(toIsoDateTime(now));
  };

  const timeValue = selected ? `${pad2(selected.getHours())}:${pad2(selected.getMinutes())}` : '';

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
            // Mesma caixa do `Input`, pra alinhar com os campos irmãos.
            'h-10 w-full justify-start px-3 text-left text-base font-normal md:text-sm',
            'hover:bg-muted hover:text-foreground data-[state=open]:bg-muted',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-70" />
          <span className="truncate">
            {selected
              ? format(selected, displayFormat, { locale: dateFnsLocale })
              : (placeholder ?? t.dateTimePlaceholder)}
          </span>
        </Button>
      </PopoverTrigger>
      {/* Altura: `--radix-popover-content-available-height` é o espaço que
          SOBRA entre o gatilho e a borda da janela. Sem esse teto, no mobile o
          conteúdo (calendário empilhado + roleta + ações) passava do fim da
          tela e o "Concluir" ficava inalcançável — provado no QA em 390px.
          O miolo rola e as AÇÕES ficam grudadas embaixo, sempre visíveis. */}
      <PopoverContent
        className="flex max-h-[min(75dvh,var(--radix-popover-content-available-height))] w-auto max-w-[calc(100vw-1.5rem)] flex-col p-0"
        align="start"
        collisionPadding={12}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto sm:flex-row">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={handleDaySelect}
            disabled={minDate || maxDate ? isDayOutOfRange : undefined}
            captionLayout="dropdown-buttons"
            fromYear={fromYear}
            toYear={toYear}
            initialFocus
            locale={dateFnsLocale}
            className="mx-auto p-3"
            // No mobile a altura é disputada com a roleta: solto o `min-h` que
            // o calendário usa pra não "pular" entre meses de 5 e 6 semanas.
            // Perder essa estabilidade de 1 linha vale a roleta caber inteira.
            classNames={isCompact ? { table: 'w-full border-collapse space-y-1 min-w-[252px]' } : undefined}
          />
          <div className="border-t border-border px-3 py-2 sm:flex sm:flex-col sm:justify-center sm:border-l sm:border-t-0 sm:py-3">
            <span className="mb-1 block text-center text-xs text-muted-foreground sm:mb-1.5 sm:text-left">
              {t.hour}
            </span>
            <TimeWheel
              value={timeValue}
              onChange={handleTimeChange}
              minuteStep={minuteStep}
              disabled={disabled}
              hoursLabel={t.hours}
              minutesLabel={t.minutes}
              // No mobile o popover é baixo e divide a altura com o calendário:
              // 3 linhas cabem inteiras, 5 ficavam cortadas pela metade.
              visibleItems={isCompact ? 3 : 5}
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-popover px-2 py-2">
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={handleNow}>
              {t.now}
            </Button>
            {clearable && value && (
              <Button
                type="button"
                variant="destructive-ghost"
                size="sm"
                onClick={() => {
                  onValueChange('');
                  setOpen(false);
                }}
              >
                {common.clear}
              </Button>
            )}
          </div>
          <Button type="button" variant="link" size="sm" onClick={() => setOpen(false)}>
            {t.done}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

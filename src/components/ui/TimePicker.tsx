import * as React from 'react';
import { Clock3 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TimeWheel } from '@/components/ui/time-wheel';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useIsCompact } from '@/hooks/use-mobile';
import { MESSAGES } from '@/lib/i18n/messages';
import { cn } from '@/lib/utils';

export interface TimePickerProps {
  /** Horário no formato 24h HH:mm. */
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  minuteStep?: number;
  placeholder?: string;
  className?: string;
  id?: string;
  ariaLabel?: string;
  ariaInvalid?: boolean;
}

/** Seletor de horário padrão do Dominex, independente do widget do navegador. */
export function TimePicker({
  value,
  onValueChange,
  disabled,
  minuteStep = 1,
  placeholder = '--:--',
  className,
  id,
  ariaLabel,
  ariaInvalid,
}: TimePickerProps) {
  const { locale } = useAppLocaleContext();
  const isCompact = useIsCompact();
  const t = MESSAGES[locale].app.common.datePicker;
  const [open, setOpen] = React.useState(false);
  const [draftValue, setDraftValue] = React.useState(value);

  React.useEffect(() => {
    if (!open) setDraftValue(value);
  }, [open, value]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setDraftValue(value);
    setOpen(nextOpen);
  };

  const handleNow = () => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const step = Math.max(1, minuteStep);
    const roundedMinutes = Math.floor(now.getMinutes() / step) * step;
    setDraftValue(`${hours}:${String(roundedMinutes).padStart(2, '0')}`);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          className={cn(
            'h-10 w-full justify-start px-3 text-left text-base font-normal tabular-nums md:text-sm',
            'hover:bg-muted hover:text-foreground data-[state=open]:bg-muted',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <Clock3 className="mr-2 h-4 w-4 shrink-0 opacity-70" />
          <span>{value || placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start" collisionPadding={12}>
        <div className="p-3">
          <span className="mb-1.5 block text-center text-xs text-muted-foreground">
            {t.hour}
          </span>
          <TimeWheel
            value={draftValue}
            onChange={setDraftValue}
            minuteStep={minuteStep}
            disabled={disabled}
            hoursLabel={t.hours}
            minutesLabel={t.minutes}
            visibleItems={isCompact ? 3 : 5}
          />
        </div>
        <div className="flex items-center justify-between gap-2 border-t bg-popover px-2 py-2">
          <Button type="button" variant="ghost" size="sm" onClick={handleNow}>
            {t.now}
          </Button>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => {
              onValueChange(draftValue);
              setOpen(false);
            }}
          >
            {t.done}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

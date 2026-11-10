import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { COMPANY_SEGMENTS, getSegment, getSelectableSegments, normalizeCompanySegments } from '@/utils/companySegments';
import { cn } from '@/lib/utils';

interface CompanySegmentMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  className?: string;
}

/** Seletor múltiplo canônico de segmentos, com badges semânticos saturados. */
export function CompanySegmentMultiSelect({
  value,
  onChange,
  disabled = false,
  className,
}: CompanySegmentMultiSelectProps) {
  const selected = normalizeCompanySegments(value);
  const selectable = getSelectableSegments();
  const selectedLegacy = COMPANY_SEGMENTS.filter(
    (segment) => selected.includes(segment.value) && !selectable.some((item) => item.value === segment.value),
  );
  const options = [...selectable, ...selectedLegacy];

  const toggle = (segmentValue: string) => {
    onChange(
      selected.includes(segmentValue)
        ? selected.filter((item) => item !== segmentValue)
        : [...selected, segmentValue],
    );
  };

  return (
    <div className={cn('space-y-2', className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-label="Selecionar segmentos"
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className={selected.length === 0 ? 'text-muted-foreground' : ''}>
              {selected.length === 0
                ? 'Selecione os segmentos'
                : selected.length === 1
                  ? getSegment(selected[0])?.label || selected[0]
                  : `${selected.length} segmentos selecionados`}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-2">
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {options.map((segment) => {
              const isSelected = selected.includes(segment.value);
              return (
                <button
                  key={segment.value}
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  onClick={() => toggle(segment.value)}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted"
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white"
                    style={{ backgroundColor: segment.color }}
                  >
                    <segment.icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{segment.label}</span>
                  <span className={cn(
                    'flex h-4 w-4 items-center justify-center rounded border',
                    isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
                  )}>
                    {isSelected && <Check className="h-3 w-3" />}
                  </span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Segmentos selecionados">
          {selected.map((segmentValue) => {
            const segment = getSegment(segmentValue);
            if (!segment) return null;
            return (
              <span
                key={segmentValue}
                className="inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-white"
                style={{ backgroundColor: segment.color }}
              >
                <segment.icon className="h-3 w-3 shrink-0" />
                <span className="truncate">{segment.label}</span>
                <button
                  type="button"
                  aria-label={`Remover ${segment.label}`}
                  onClick={() => toggle(segmentValue)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

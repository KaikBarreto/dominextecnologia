import { Check, Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { PartyLabel } from '@/hooks/usePartyLabels';
import { PartyLabelBadges } from '@/components/customers/PartyLabelBadge';

export function PartyLabelMultiSelect({
  labels,
  value,
  onValueChange,
  placeholder = 'Sem etiquetas',
  disabled = false,
}: {
  labels: PartyLabel[];
  value: string[];
  onValueChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const selected = value.map((id) => labels.find((label) => label.id === id)).filter((label): label is PartyLabel => !!label);
  const toggle = (id: string) => onValueChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled} className="h-auto min-h-10 w-full justify-start gap-2 px-3 py-2 font-normal">
          <Tags className="h-4 w-4 shrink-0 text-muted-foreground" />
          {selected.length ? <PartyLabelBadges labels={selected} mode="summary" /> : <span className="text-muted-foreground">{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(340px,calc(100vw-2rem))] p-2">
        <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">Selecione uma ou mais etiquetas</p>
        {labels.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Nenhuma etiqueta disponível.</p>
        ) : labels.map((label) => {
          const checked = value.includes(label.id);
          return (
            <button key={label.id} type="button" onClick={() => toggle(label.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted">
              <span className="h-3 w-7 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
              <span className="min-w-0 flex-1 truncate text-sm">{label.name}</span>
              <Check className={cn('h-4 w-4 text-primary', !checked && 'invisible')} />
            </button>
          );
        })}
        {value.length > 0 && <Button type="button" variant="ghost" size="sm" className="mt-1 w-full" onClick={() => onValueChange([])}>Limpar etiquetas</Button>}
      </PopoverContent>
    </Popover>
  );
}

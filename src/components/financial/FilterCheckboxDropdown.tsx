import { useState } from 'react';
import { Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  FilterCheckboxGroup,
  type FilterCheckboxOption,
} from '@/components/mobile/FilterCheckboxGroup';
import { cn } from '@/lib/utils';

interface FilterCheckboxDropdownProps {
  label: string;
  options: FilterCheckboxOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Texto exibido como hint quando nada selecionado (default "Todos"). */
  emptyLabel?: string;
  className?: string;
}

/**
 * Wrapper de `FilterCheckboxGroup` que esconde a lista de checkboxes atrás de um
 * botão (trigger) e abre num Popover ao clicar — em vez de despejar todas as
 * opções inline na tela. Pensado pra filtros de listagem no desktop, mas o
 * Popover funciona bem no mobile também (toque), então usamos nas duas larguras.
 *
 * Semântica inalterada: `selected.length === 0` = todas (filtro inativo).
 * Reusa a lógica de seleção/Todos/Limpar do `FilterCheckboxGroup` — não reescreve
 * a lista.
 */
export function FilterCheckboxDropdown({
  label,
  options,
  selected,
  onChange,
  emptyLabel = 'Todos',
  className,
}: FilterCheckboxDropdownProps) {
  const [open, setOpen] = useState(false);
  const count = selected.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn('gap-2 min-h-11 rounded-xl', className)}
        >
          <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{label}</span>
          {count > 0 && (
            <span className="text-xs font-semibold text-primary">({count})</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <FilterCheckboxGroup
          label={label}
          options={options}
          selected={selected}
          onChange={onChange}
          emptyLabel={emptyLabel}
        />
      </PopoverContent>
    </Popover>
  );
}

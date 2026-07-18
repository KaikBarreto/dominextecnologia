import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface SearchableSelectOption {
  value: string;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
}

export interface SearchableSelectGroup {
  heading?: string;
  options: SearchableSelectOption[];
}

interface SearchableSelectProps {
  options?: SearchableSelectOption[];
  /**
   * Prop OPCIONAL para renderizar o conteúdo em grupos nomeados.
   * Quando presente, `options` é ignorado e cada grupo vira um `CommandGroup` separado.
   * A busca do cmdk filtra naturalmente dentro de todos os grupos.
   * Usos existentes que só passam `options` continuam funcionando sem nenhuma alteração.
   */
  groups?: SearchableSelectGroup[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  options = [],
  groups,
  value,
  onValueChange,
  placeholder = 'Selecione...',
  searchPlaceholder = 'Buscar...',
  emptyMessage = 'Nenhum resultado encontrado.',
  className,
  disabled,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);

  // Encontra o item selecionado tanto no modo flat quanto no modo grupos.
  const selected = React.useMemo(() => {
    if (groups) {
      for (const group of groups) {
        const found = group.options.find((o) => o.value === value);
        if (found) return found;
      }
      return undefined;
    }
    return options.find((o) => o.value === value);
  }, [groups, options, value]);

  const renderOption = (option: SearchableSelectOption) => (
    <CommandItem
      key={option.value}
      value={option.label}
      onSelect={() => {
        onValueChange(option.value);
        setOpen(false);
      }}
    >
      <Check className={cn('mr-2 h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')} />
      <div className="flex items-center gap-2 min-w-0">
        {option.icon}
        <div className="min-w-0">
          <span className="truncate">{option.label}</span>
          {option.sublabel && (
            <span className="block text-xs text-muted-foreground truncate">{option.sublabel}</span>
          )}
        </div>
      </div>
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground', className)}
        >
          <span className="truncate">
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-[40vh] overflow-y-auto overscroll-contain touch-pan-y">
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            {groups ? (
              groups.map((group, idx) => (
                <CommandGroup key={group.heading ?? idx} heading={group.heading}>
                  {group.options.map(renderOption)}
                </CommandGroup>
              ))
            ) : (
              <CommandGroup>
                {options.map(renderOption)}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

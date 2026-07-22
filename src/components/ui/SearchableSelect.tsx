import * as React from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
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
  /**
   * Conteúdo custom exibido quando NÃO há nenhuma opção cadastrada (lista vazia),
   * mesmo sem busca. Ex: CTA "Nenhum tipo de serviço cadastrado ainda / Criar agora".
   * Se ausente, cai no comportamento padrão (emptyMessage no CommandEmpty).
   */
  emptyContent?: React.ReactNode;
  /**
   * Habilita "criar na hora": quando o usuário digita um texto que não existe,
   * renderiza uma ação "Criar '<texto>'" no rodapé da lista e dentro do
   * CommandEmpty. Recebe o texto digitado; a criação em si fica com o caller.
   */
  onCreateOption?: (query: string) => void;
  /** Rótulo do item de criação. `{name}` é substituído pelo texto digitado. */
  createOptionLabel?: string;
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
  emptyContent,
  onCreateOption,
  createOptionLabel = 'Criar "{name}"',
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  // Limpa a busca ao fechar pra a próxima abertura começar limpa.
  React.useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

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

  const trimmedQuery = query.trim();

  // A lista está totalmente vazia (nenhuma opção cadastrada, sem busca)?
  const isEmptyCatalog = React.useMemo(() => {
    if (groups) return groups.every((g) => g.options.length === 0);
    return options.length === 0;
  }, [groups, options]);

  // Existe uma correspondência EXATA (case-insensitive) ao texto digitado?
  // Se sim, não oferecemos "criar" (evita duplicar um que já existe).
  const hasExactMatch = React.useMemo(() => {
    if (!trimmedQuery) return false;
    const q = trimmedQuery.toLocaleLowerCase();
    const all = groups ? groups.flatMap((g) => g.options) : options;
    return all.some((o) => o.label.trim().toLocaleLowerCase() === q);
  }, [groups, options, trimmedQuery]);

  const canCreate = !!onCreateOption && trimmedQuery.length > 0 && !hasExactMatch;

  // Guarda contra disparo duplo (Enter repetido / dois CommandItem): só cria uma
  // vez por abertura. Reseta quando o popover fecha.
  const creatingRef = React.useRef(false);
  React.useEffect(() => {
    if (!open) creatingRef.current = false;
  }, [open]);

  const handleCreate = () => {
    if (!onCreateOption || !trimmedQuery) return;
    if (creatingRef.current) return;
    creatingRef.current = true;
    onCreateOption(trimmedQuery);
    setOpen(false);
  };

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

  const createItem = canCreate ? (
    <CommandItem
      value={`__create__${trimmedQuery}`}
      onSelect={handleCreate}
      className="text-primary"
    >
      <Plus className="mr-2 h-4 w-4 shrink-0" />
      <span className="truncate">{createOptionLabel.replace('{name}', trimmedQuery)}</span>
    </CommandItem>
  ) : null;

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
          <span className="flex items-center gap-2 truncate">
            {selected?.icon}
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
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[40vh] overflow-y-auto overscroll-contain touch-pan-y">
            {/* Catálogo vazio (nada cadastrado, sem busca) → CTA custom quando fornecido. */}
            {isEmptyCatalog && !trimmedQuery && emptyContent ? (
              <div className="p-2">{emptyContent}</div>
            ) : (
              <>
                {/* Sem matches: só a mensagem vazia. A ação "Criar" NÃO é
                    renderizada aqui pra não duplicar com o rodapé (mesmo value =
                    navegação/Enter ambíguos no cmdk). */}
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
                {/* ÚNICO lugar da ação de criar: rodapé, sempre que há texto sem
                    correspondência exata (com ou sem matches parciais). */}
                {canCreate && (
                  <CommandGroup>{createItem}</CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

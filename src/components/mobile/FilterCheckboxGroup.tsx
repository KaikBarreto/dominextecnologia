import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Normaliza para busca: ignora acentos e caixa. */
const normalize = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export interface FilterCheckboxOption {
  value: string;
  label: string;
  /** Cor de acento opcional (renderiza bolinha colorida à esquerda) */
  color?: string;
}

interface FilterCheckboxGroupProps {
  label: string;
  options: FilterCheckboxOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Texto exibido como hint quando nada selecionado (default "Todos"). */
  emptyLabel?: string;
  /** A partir de quantas opções a lupa de busca aparece (default 6). */
  searchThreshold?: number;
  className?: string;
}

/**
 * Grupo de checkboxes pra filtros multi-select dentro de FilterSheet.
 * Semântica: `selected.length === 0` = filtro inativo (todos).
 */
export function FilterCheckboxGroup({
  label,
  options,
  selected,
  onChange,
  emptyLabel = 'Todos',
  searchThreshold = 6,
  className,
}: FilterCheckboxGroupProps) {
  const allSelected = selected.length === options.length;
  const noneSelected = selected.length === 0;

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Lupa só vale a pena com listas longas.
  const showSearch = options.length > searchThreshold;

  // Foca o campo ao abrir.
  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  const openSearch = () => {
    if (!searchOpen) setSearchOpen(true);
  };

  const toggleSearch = () => {
    setSearchOpen((prev) => {
      const next = !prev;
      if (!next) setQuery(''); // reset ao fechar
      return next;
    });
  };

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  // "Todos" seleciona TODAS as opções do grupo (não só as filtradas).
  const selectAll = () => onChange(options.map((o) => o.value));
  const clearAll = () => onChange([]);

  // Filtro puramente visual.
  const normalizedQuery = normalize(query.trim());
  const visibleOptions =
    showSearch && searchOpen && normalizedQuery
      ? options.filter((o) => normalize(o.label).includes(normalizedQuery))
      : options;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
          {!noneSelected && !allSelected && (
            <span className="ml-1.5 text-[10px] text-primary normal-case font-normal tracking-normal">
              ({selected.length} selecionados)
            </span>
          )}
        </label>
        <div className="flex items-center gap-1">
          {showSearch && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={searchOpen ? 'Fechar busca' : 'Buscar'}
              className={cn(
                'h-9 w-9 text-muted-foreground hover:text-foreground',
                searchOpen && 'text-primary',
              )}
              onClick={toggleSearch}
              onMouseEnter={openSearch}
            >
              <Search className="h-4 w-4" />
            </Button>
          )}
          {!allSelected && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={selectAll}
            >
              Todos
            </Button>
          )}
          {!noneSelected && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={clearAll}
            >
              Limpar
            </Button>
          )}
        </div>
      </div>

      {showSearch && searchOpen && (
        <Input
          ref={inputRef}
          type="text"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar..."
          className="h-9 text-sm"
        />
      )}

      <div className="rounded-xl border bg-card divide-y divide-border/60 max-h-[44vh] overflow-y-auto">
        {options.length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground text-center">
            Nenhuma opção disponível
          </div>
        ) : visibleOptions.length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground text-center">
            Nenhuma opção encontrada
          </div>
        ) : (
          visibleOptions.map((opt) => {
            const checked = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                  'hover:bg-muted/40 active:bg-muted/60',
                )}
              >
                <Checkbox checked={checked} onCheckedChange={() => toggle(opt.value)} className="pointer-events-none" />
                {opt.color && (
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: opt.color }}
                  />
                )}
                <span className="text-sm flex-1 truncate">{opt.label}</span>
              </button>
            );
          })
        )}
      </div>

      {noneSelected && (
        <p className="text-[11px] text-muted-foreground italic">
          Vazio = {emptyLabel.toLowerCase()}
        </p>
      )}
    </div>
  );
}

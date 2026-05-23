import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  className,
}: FilterCheckboxGroupProps) {
  const allSelected = selected.length === options.length;
  const noneSelected = selected.length === 0;

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const selectAll = () => onChange(options.map((o) => o.value));
  const clearAll = () => onChange([]);

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

      <div className="rounded-xl border bg-card divide-y divide-border/60 max-h-[44vh] overflow-y-auto">
        {options.length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground text-center">
            Nenhuma opção disponível
          </div>
        ) : (
          options.map((opt) => {
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

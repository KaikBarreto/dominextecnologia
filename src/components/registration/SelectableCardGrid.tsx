import { Check, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectableCardOption {
  value: string;
  label: string;
  color: string; // hex
  icon: LucideIcon;
  description?: string;
}

interface SelectableCardGridProps {
  title: string;
  subtitle?: string;
  options: SelectableCardOption[];
  selectedValue: string;
  /** Chamado ao clicar num card — seta o valor E avança pra próxima etapa. */
  onSelect: (value: string) => void;
}

/**
 * Grade de cards de seleção usada nas etapas Segmento e Origem do cadastro.
 * Layout: topo (título) fixo, grade rolável no meio. Quadradinho do ícone
 * SATURADO na cor da opção + ícone branco. Clicar num card já avança.
 */
export function SelectableCardGrid({
  title,
  subtitle,
  options,
  selectedValue,
  onSelect,
}: SelectableCardGridProps) {
  return (
    <div className="flex flex-col" style={{ maxHeight: 'min(60vh, 30rem)' }}>
      <div className="text-center space-y-1 shrink-0 pb-3">
        <p className="text-sm font-medium text-white">{title}</p>
        {subtitle && <p className="text-xs text-white/50">{subtitle}</p>}
      </div>
      <div className="flex-1 overflow-y-auto -mx-1 px-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {options.map((o) => {
            const Icon = o.icon;
            const isSelected = selectedValue === o.value;
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(o.value)}
                // --card-c = cor da opção. Selecionado pinta o card inteiro via style;
                // o hover pinta via `hover:bg-[var(--card-c)]`. Ícone/textos brancos.
                style={{
                  ['--card-c' as string]: o.color,
                  ...(isSelected ? { backgroundColor: o.color, borderColor: o.color } : {}),
                }}
                className={cn(
                  'group flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all',
                  isSelected
                    ? 'text-white ring-2 ring-white/30'
                    : 'border-white/10 bg-white/5 text-white/60 hover:text-white hover:border-[var(--card-c)] hover:bg-[var(--card-c)]'
                )}
              >
                <div
                  className={cn(
                    'shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
                    isSelected ? 'bg-white/20' : 'bg-[var(--card-c)] group-hover:bg-white/20'
                  )}
                >
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className={cn('block text-sm font-semibold leading-snug', isSelected ? 'text-white' : 'text-white/90 group-hover:text-white')}>
                    {o.label}
                  </span>
                  {o.description && (
                    <span className={cn('block text-[11px] leading-snug mt-0.5', isSelected ? 'text-white/90' : 'text-white/50 group-hover:text-white/90')}>
                      {o.description}
                    </span>
                  )}
                </div>
                {isSelected && <Check className="h-4 w-4 text-white shrink-0 mt-0.5" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import { LayoutGrid, LayoutList } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ViewMode } from '@/hooks/useViewMode';

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  /** No mobile mostra só ícones; no desktop pode mostrar rótulo. */
  showLabels?: boolean;
  className?: string;
}

/**
 * Botão segmentado Lista/Grade. Visual padronizado (igual ao AdminTasksTab):
 * ativo = bg-primary text-primary-foreground, inativo = bg-card hover:bg-muted.
 */
export function ViewModeToggle({ value, onChange, showLabels = false, className }: ViewModeToggleProps) {
  return (
    <div className={cn('flex rounded-lg border overflow-hidden h-10 shrink-0', className)}>
      <button
        type="button"
        onClick={() => onChange('list')}
        aria-label="Ver como lista"
        className={cn(
          'flex items-center justify-center gap-1.5 px-3 text-sm transition-colors',
          value === 'list' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
        )}
      >
        <LayoutList className="h-4 w-4" />
        {showLabels && 'Lista'}
      </button>
      <button
        type="button"
        onClick={() => onChange('grid')}
        aria-label="Ver como grade"
        className={cn(
          'flex items-center justify-center gap-1.5 px-3 text-sm transition-colors',
          value === 'grid' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
        )}
      >
        <LayoutGrid className="h-4 w-4" />
        {showLabels && 'Grade'}
      </button>
    </div>
  );
}

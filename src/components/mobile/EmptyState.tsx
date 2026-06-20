import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
  /** 'default' = padrão de tela cheia; 'compact' = enxuto pra abas internas / colunas de kanban. */
  size?: 'default' | 'compact';
}

/**
 * Estado vazio padrão (sem dados / sem resultado).
 */
export function EmptyState({ icon, title, description, action, className, size = 'default' }: EmptyStateProps) {
  const compact = size === 'compact';
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-4',
        compact ? 'py-6' : 'py-10 sm:py-12',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center text-muted-foreground',
          compact ? 'mb-3 h-10 w-10' : 'mb-4 h-12 w-12',
        )}
      >
        {icon}
      </div>
      <h3 className={cn('font-medium', compact ? 'text-sm sm:text-base' : 'text-base sm:text-lg')}>{title}</h3>
      {description && (
        <p
          className={cn(
            'text-muted-foreground mt-1 max-w-sm',
            compact ? 'text-xs sm:text-sm' : 'text-sm',
          )}
        >
          {description}
        </p>
      )}
      {action && (
        <Button
          className={compact ? 'mt-3' : 'mt-4'}
          size={compact ? 'sm' : undefined}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

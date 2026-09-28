import { getCategoryIcon } from '@/components/financial/categoryIcons';
import type { FinancialCategory } from '@/hooks/useFinancialCategories';
import { cn } from '@/lib/utils';

interface FinancialCategoryPillProps {
  name: string;
  category?: Pick<FinancialCategory, 'name' | 'color' | 'icon'> | null;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Identidade visual única das categorias financeiras nas listagens.
 * A cor e o ícone vêm do cadastro da empresa; categorias antigas ou removidas
 * continuam legíveis com um fallback cinza, sem quebrar o histórico.
 */
export function FinancialCategoryPill({
  name,
  category,
  size = 'md',
  className,
}: FinancialCategoryPillProps) {
  const color = category?.color || '#64748b';
  const Icon = getCategoryIcon(category?.icon);
  const iconWrap = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const iconSize = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3';

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full py-0.5 pl-1 pr-2.5 text-xs font-medium text-white',
        className,
      )}
      style={{ backgroundColor: color }}
    >
      <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-white/20', iconWrap)}>
        <Icon className={cn('text-white', iconSize)} />
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}

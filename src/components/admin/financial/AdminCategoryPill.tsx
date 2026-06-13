import { cn } from '@/lib/utils';
import { getCategoryIcon } from '@/components/financial/categoryIcons';
import type { AdminFinancialCategory } from '@/hooks/useAdminFinancialCategories';

interface AdminCategoryPillProps {
  /** Nome técnico da categoria (admin_financial_categories.name). */
  name: string;
  /** Lista de categorias já carregada via useAdminFinancialCategories. */
  categories: AdminFinancialCategory[];
  /** Compacta a pílula (ícone menor) — usada no <Select>. */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Pílula de categoria no estilo do EcoSistema: círculo com cor sólida da categoria,
 * ícone branco dentro de um sub-círculo translúcido e o label ao lado.
 * Texto sempre branco (as cores do catálogo são escuras o suficiente).
 *
 * Fallback gracioso: categoria inativa/desconhecida vira pílula cinza com o name cru.
 */
export function AdminCategoryPill({ name, categories, size = 'md', className }: AdminCategoryPillProps) {
  const category = categories.find((c) => c.name === name);
  const color = category?.color || '#64748b';
  const label = category?.label || name;
  const Icon = getCategoryIcon(category?.icon);

  const iconWrap = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const iconSize = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-0.5 text-xs font-medium text-white max-w-full',
        className,
      )}
      style={{ backgroundColor: color }}
    >
      <span className={cn('shrink-0 rounded-full bg-white/20 flex items-center justify-center', iconWrap)}>
        <Icon className={cn('text-white', iconSize)} />
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}

import { cn } from '@/lib/utils';
import { getCategoryIcon } from '@/components/financial/categoryIcons';
import type { AdminFinancialCategory } from '@/hooks/useAdminFinancialCategories';

interface AdminCategoryPillProps {
  /** Nome técnico da categoria (admin_financial_categories.name). */
  name: string;
  /** Lista de categorias já carregada via useAdminFinancialCategories. */
  categories: readonly Pick<AdminFinancialCategory, 'name' | 'label' | 'color' | 'icon'>[];
  /** Compacta a pílula (ícone menor) — usada no <Select>. */
  size?: 'sm' | 'md';
  className?: string;
}

function colorForWhiteText(input: string | null | undefined) {
  const fallback = '#475569';
  const hex = input?.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!hex) return fallback;
  const expanded = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex;
  let rgb = [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16));
  const luminance = ([r, g, b]: number[]) => [r, g, b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  while (1.05 / (luminance(rgb) + 0.05) < 4.5) rgb = rgb.map((channel) => Math.round(channel * 0.92));
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** Categoria com cor do cadastro e contraste legível para texto branco. */
export function AdminCategoryPill({ name, categories, size = 'md', className }: AdminCategoryPillProps) {
  const category = categories.find((c) => c.name === name);
  const color = colorForWhiteText(category?.color);
  const label = category?.label || name;
  const Icon = getCategoryIcon(category?.icon);

  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white max-w-full',
        className,
      )}
      style={{ backgroundColor: color }}
    >
      <Icon className={cn('shrink-0 text-white', iconSize)} />
      <span className="truncate">{label}</span>
    </span>
  );
}

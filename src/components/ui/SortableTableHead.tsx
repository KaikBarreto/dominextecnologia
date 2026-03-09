import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { TableHead } from '@/components/ui/table';
import type { SortConfig } from '@/hooks/useTableSort';
import { cn } from '@/lib/utils';

interface SortableTableHeadProps {
  children: React.ReactNode;
  sortKey: string;
  sortConfig: SortConfig;
  onSort: (key: string) => void;
  className?: string;
}

export function SortableTableHead({ children, sortKey, sortConfig, onSort, className }: SortableTableHeadProps) {
  const isActive = sortConfig.key === sortKey;
  const direction = isActive ? sortConfig.direction : null;

  return (
    <TableHead
      className={cn('cursor-pointer select-none hover:text-foreground transition-colors text-xs uppercase tracking-wider', className)}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {direction === 'asc' ? (
          <ArrowUp className="h-3 w-3 text-primary" />
        ) : direction === 'desc' ? (
          <ArrowDown className="h-3 w-3 text-primary" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </span>
    </TableHead>
  );
}

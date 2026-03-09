import { useState, useMemo } from 'react';

export type SortDirection = 'asc' | 'desc' | null;

export interface SortConfig {
  key: string;
  direction: SortDirection;
}

export function useTableSort<T>(items: T[], defaultKey?: string, defaultDir?: SortDirection) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: defaultKey || '',
    direction: defaultDir || null,
  });

  const handleSort = (key: string) => {
    setSortConfig((prev) => {
      if (prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      if (prev.direction === 'desc') return { key: '', direction: null };
      return { key, direction: 'asc' };
    });
  };

  const sortedItems = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return items;

    return [...items].sort((a, b) => {
      const aVal = getNestedValue(a, sortConfig.key);
      const bVal = getNestedValue(b, sortConfig.key);

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else if (aVal instanceof Date && bVal instanceof Date) {
        comparison = aVal.getTime() - bVal.getTime();
      } else {
        comparison = String(aVal).localeCompare(String(bVal), 'pt-BR', { sensitivity: 'base' });
      }

      return sortConfig.direction === 'desc' ? -comparison : comparison;
    });
  }, [items, sortConfig.key, sortConfig.direction]);

  return {
    sortedItems,
    sortConfig,
    handleSort,
  };
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

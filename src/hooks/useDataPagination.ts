import { useEffect, useMemo, useState } from 'react';

export type PageSizeOption = 25 | 50 | 100 | 'all';

export function useDataPagination<T>(items: T[], defaultPageSize: PageSizeOption = 25) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(defaultPageSize);

  useEffect(() => {
    setPage(1);
  }, [items.length, pageSize]);

  const totalItems = items.length;
  const effectivePageSize = pageSize === 'all' ? Math.max(totalItems, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(totalItems / effectivePageSize));
  const safePage = Math.min(page, totalPages);

  const paginatedItems = useMemo(() => {
    if (pageSize === 'all') return items;
    const start = (safePage - 1) * effectivePageSize;
    return items.slice(start, start + effectivePageSize);
  }, [items, safePage, effectivePageSize, pageSize]);

  const from = totalItems === 0 ? 0 : (safePage - 1) * effectivePageSize + 1;
  const to = totalItems === 0 ? 0 : Math.min(totalItems, safePage * effectivePageSize);

  return {
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    totalItems,
    from,
    to,
    paginatedItems,
    canGoPrev: safePage > 1,
    canGoNext: safePage < totalPages,
  };
}

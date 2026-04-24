import { useEffect, useMemo, useState } from 'react';

export type PageSizeOption = 10 | 25 | 50 | 100 | 'all';

export function useDataPagination<T>(items: T[], defaultPageSize: PageSizeOption = 10, storageKey?: string) {
  const [page, setPage] = useState(() => {
    if (!storageKey || typeof window === 'undefined') return 1;
    const saved = Number(window.sessionStorage.getItem(`${storageKey}:page`));
    return Number.isFinite(saved) && saved > 0 ? saved : 1;
  });
  const [pageSize, setPageSize] = useState<PageSizeOption>(() => {
    if (!storageKey || typeof window === 'undefined') return defaultPageSize;
    const saved = window.sessionStorage.getItem(`${storageKey}:pageSize`);
    if (saved === 'all') return 'all';
    const numeric = Number(saved);
    return Number.isFinite(numeric) && numeric > 0 ? (numeric as PageSizeOption) : defaultPageSize;
  });

  useEffect(() => {
    setPage((current) => {
      const effectiveSize = pageSize === 'all' ? Math.max(items.length, 1) : pageSize;
      const nextTotalPages = Math.max(1, Math.ceil(items.length / effectiveSize));
      return Math.min(current, nextTotalPages);
    });
  }, [items.length, pageSize]);

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    window.sessionStorage.setItem(`${storageKey}:page`, String(page));
    window.sessionStorage.setItem(`${storageKey}:pageSize`, String(pageSize));
  }, [page, pageSize, storageKey]);

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

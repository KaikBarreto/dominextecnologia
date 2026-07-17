import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PageSizeOption } from '@/hooks/useDataPagination';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatNumber } from '@/lib/format';

interface DataTablePaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  from: number;
  to: number;
  pageSize: PageSizeOption;
  onPageChange: (page: number) => void;
  onPageSizeChange: (value: PageSizeOption) => void;
}

export function DataTablePagination({
  page,
  totalPages,
  totalItems,
  from,
  to,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: DataTablePaginationProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.common;
  const showingText = t.pagination.showing
    .replace('{from}', formatNumber(from, locale))
    .replace('{to}', formatNumber(to, locale))
    .replace('{total}', formatNumber(totalItems, locale));

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-xs text-muted-foreground text-center sm:text-left">
        {showingText}
      </div>

      <div className="flex flex-col gap-2 items-center sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">{t.pagination.perPage}</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(value === 'all' ? 'all' : Number(value) as 10 | 25 | 50 | 100)}
          >
            <SelectTrigger className="h-8 w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="all">{t.pagination.all}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            {t.pagination.previous}
          </Button>
          <span className="min-w-[64px] text-center text-xs text-muted-foreground">
            {formatNumber(page, locale)} / {formatNumber(totalPages, locale)}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            {t.pagination.next}
          </Button>
        </div>
      </div>
    </div>
  );
}

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PageSizeOption } from '@/hooks/useDataPagination';

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
  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-xs text-muted-foreground text-center sm:text-left">
        Mostrando {from}-{to} de {totalItems}
      </div>

      <div className="flex flex-col gap-2 items-center sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Por página</span>
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
              <SelectItem value="all">Todos</SelectItem>
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
            Anterior
          </Button>
          <span className="min-w-[64px] text-center text-xs text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}

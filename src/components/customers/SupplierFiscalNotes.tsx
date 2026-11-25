import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, ExternalLink, FileCode, FileDown, Loader2, MoreVertical, ReceiptText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/mobile/EmptyState';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { useDataPagination } from '@/hooks/useDataPagination';
import {
  useFiscalNoteDownloads,
  useSupplierFiscalNotes,
  type FiscalNote,
  type SupplierInboundNote,
} from '@/hooks/useCustomerFiscalNotes';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { cn } from '@/lib/utils';

const BADGE_BASE = 'border-transparent text-[10px] whitespace-nowrap';
const ITEM_CLASS = 'gap-2 focus:bg-primary focus:text-primary-foreground';

type SupplierNoteRow =
  | { kind: 'issued'; key: string; date: string; note: FiscalNote }
  | { kind: 'received'; key: string; date: string; note: SupplierInboundNote };

/**
 * Notas fiscais do fornecedor: NF-e de entrada emitidas pelo Dominex (com
 * DANFE e XML) e NF-e recebidas dele (lista, sem arquivo para baixar aqui).
 */
export function SupplierFiscalNotes({ supplierId }: { supplierId: string }) {
  const navigate = useNavigate();
  const { money, date: formatTimestamp } = useLocaleFormatters();
  const { issued, received, isLoading, isError } = useSupplierFiscalNotes(supplierId);
  const downloads = useFiscalNoteDownloads();

  const rows = useMemo<SupplierNoteRow[]>(
    () => [
      ...issued.map((note): SupplierNoteRow => ({ kind: 'issued', key: note.key, date: note.date, note })),
      ...received.map((note): SupplierNoteRow => ({ kind: 'received', key: `recebida:${note.id}`, date: note.date ?? '', note })),
    ].sort((a, b) => b.date.localeCompare(a.date)),
    [issued, received],
  );
  const pagination = useDataPagination(rows, 10);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-widest text-foreground/70">Notas fiscais</h3>
        {received.length > 0 && (
          <Button variant="outline" className="h-10 sm:h-9" onClick={() => navigate('/notas-fiscais/nfe')}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Abrir Notas fiscais
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">Não foi possível carregar as notas fiscais deste fornecedor.</p>
      ) : rows.length === 0 ? (
        <EmptyState
          size="compact"
          icon={<ReceiptText className="h-10 w-10" />}
          title="Nenhuma nota fiscal deste fornecedor"
          description="As notas de entrada emitidas pelo Dominex e as notas recebidas dele aparecem aqui sozinhas."
        />
      ) : (
        <>
          <div className="divide-y overflow-hidden rounded-lg border">
            {pagination.paginatedItems.map((row) => {
              const isIssued = row.kind === 'issued';
              const cancelled = row.note.cancelled;
              const total = row.note.total;
              const number = row.note.number;
              const dateText = row.date ? formatTimestamp(row.date) : null;
              const title = number ? `NF-e nº ${number}` : 'NF-e';
              return (
                <div key={row.key} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 truncate text-sm font-semibold">{title}</p>
                      <Badge className={cn(BADGE_BASE, isIssued ? 'bg-primary text-primary-foreground hover:bg-primary' : 'bg-slate-500 text-white hover:bg-slate-500')}>
                        {isIssued ? 'Emitida pelo Dominex' : 'Recebida'}
                      </Badge>
                      {cancelled && (
                        <Badge className={cn(BADGE_BASE, 'gap-1 bg-gray-800 text-white hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-600')}>
                          <Ban className="h-3 w-3" />Cancelada
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[row.kind === 'received' ? row.note.issuer : null, dateText].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {total != null && <p className="shrink-0 whitespace-nowrap text-sm font-semibold">{money(total)}</p>}
                  {/* Mesma régua das listas de notas: ações no menu da linha. */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="-mr-2 h-10 w-10 shrink-0 text-muted-foreground sm:h-8 sm:w-8"
                        aria-label={`Ações de ${title}`}
                        disabled={row.kind === 'issued' && downloads.busyKey === row.note.key}
                      >
                        {row.kind === 'issued' && downloads.busyKey === row.note.key
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <MoreVertical className="h-4 w-4" />}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {row.kind === 'issued' && row.note.hasPdf && (
                        <DropdownMenuItem className={ITEM_CLASS} disabled={downloads.busyKey !== null} onClick={() => void downloads.download(row.note, 'pdf')}>
                          <FileDown className="h-4 w-4" />
                          Baixar DANFE
                        </DropdownMenuItem>
                      )}
                      {row.kind === 'issued' && row.note.hasXml && (
                        <DropdownMenuItem className={ITEM_CLASS} disabled={downloads.busyKey !== null} onClick={() => void downloads.download(row.note, 'xml')}>
                          <FileCode className="h-4 w-4" />
                          Baixar XML
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem className={ITEM_CLASS} onClick={() => navigate('/notas-fiscais/nfe')}>
                        <ExternalLink className="h-4 w-4" />
                        Abrir em Notas fiscais
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
          <DataTablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            from={pagination.from}
            to={pagination.to}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        </>
      )}
    </div>
  );
}

import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Phone, Mail, FileText, User, Wallet } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/mobile/EmptyState';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { useDataPagination } from '@/hooks/useDataPagination';
import { useFinancial } from '@/hooks/useFinancial';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import type { Supplier } from '@/hooks/useSuppliers';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

/**
 * Ficha do fornecedor: dados de cadastro + histórico de gastos
 * (financial_transactions.supplier_id). Mesma régua de apresentação da aba
 * Financeiro do cliente (CustomerDetail): tabela com descrição/valor/data/
 * status, paginada (o histórico pode crescer, a lista NUNCA carrega tudo de
 * uma vez na tela).
 *
 * Só é montado quando o usuário abre a ficha (o pai renderiza condicionalmente
 * `viewingSupplier &&`), então `useFinancial()` só busca o financeiro da
 * empresa quando alguém realmente pede pra ver o histórico — não no simples
 * carregar da lista de fornecedores.
 */
interface SupplierDetailDialogProps {
  supplier: Supplier;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SupplierDetailDialog({ supplier, open, onOpenChange }: SupplierDetailDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.customers.suppliers.detail;
  const { transactions, isLoading } = useFinancial();

  const supplierTransactions = useMemo(
    () => transactions
      .filter((txn) => txn.supplier_id === supplier.id)
      .sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1)),
    [transactions, supplier.id],
  );

  const totalSpent = useMemo(
    () => supplierTransactions
      .filter((txn) => txn.transaction_type === 'saida')
      .reduce((sum, txn) => sum + txn.amount, 0),
    [supplierTransactions],
  );

  // Histórico pode crescer (mesmo fornecedor usado em várias compras/despesas
  // ao longo do tempo) — pagina em vez de despejar tudo na tela.
  const pagination = useDataPagination(supplierTransactions, 10);

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t.title}
      className="sm:max-w-[720px]"
      footer={
        <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
          {t.close}
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-foreground/70">{t.infoHeading}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {supplier.cpf_cnpj && (
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{supplier.cpf_cnpj}</span>
              </div>
            )}
            {supplier.contact_name && (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{supplier.contact_name}</span>
              </div>
            )}
            {supplier.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{supplier.phone}</span>
              </div>
            )}
            {supplier.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{supplier.email}</span>
              </div>
            )}
          </div>
          {supplier.notes ? (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{supplier.notes}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">{t.noNotes}</p>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-widest text-foreground/70">{t.historyHeading}</h3>
            {supplierTransactions.length > 0 && (
              <div className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
                <Wallet className="h-4 w-4" />
                {t.historyTotal}: {formatCurrency(totalSpent)}
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : supplierTransactions.length === 0 ? (
            <EmptyState
              size="compact"
              icon={<Wallet className="h-10 w-10" />}
              title={t.emptyHistory}
              description={t.emptyHistoryDesc}
            />
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs uppercase tracking-wider">{t.colDesc}</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">{t.colAmount}</TableHead>
                      <TableHead className="hidden sm:table-cell text-xs uppercase tracking-wider">{t.colDate}</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">{t.colStatus}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagination.paginatedItems.map((txn) => (
                      <TableRow key={txn.id}>
                        <TableCell className="font-medium">{txn.description}</TableCell>
                        <TableCell>
                          <span className={txn.transaction_type === 'entrada' ? 'text-success' : 'text-destructive'}>
                            {txn.transaction_type === 'entrada' ? '+' : '-'} {formatCurrency(txn.amount)}
                          </span>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {format(parseISO(`${txn.transaction_date}T12:00:00`), 'dd/MM/yyyy', { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={txn.is_paid ? 'default' : 'secondary'}>
                            {txn.is_paid ? t.paid : t.pending}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
      </div>
    </ResponsiveModal>
  );
}

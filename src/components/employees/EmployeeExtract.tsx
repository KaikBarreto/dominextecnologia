import { Trash2, Download, FileText } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { useDataPagination } from '@/hooks/useDataPagination';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { BalanceSummary, formatMovementType, getMovementBadgeVariant, EmployeeMovement } from '@/utils/employeeCalculations';
import { generateExtractHTMLWithHeader, generateReceiptHTML } from '@/utils/receiptGenerator';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

interface EmployeeExtractProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeName: string;
  employeeSalary: number;
  movements: EmployeeMovement[];
  balance: BalanceSummary;
  onDeleteMovement: (id: string) => void;
}

function openHTMLInNewTab(html: string) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) win.onload = () => URL.revokeObjectURL(url);
}

function PaymentDetails({ movement, salary, fmt, onReceipt }: { movement: EmployeeMovement; salary: number; fmt: (v: number) => string; onReceipt: () => void }) {
  const details = movement.payment_details || {};
  const bonus = Number(details.bonus) || 0;
  const totalVales = Number(details.totalVales) || Number(details.valeDiscount) || 0;
  const totalFaltas = Number(details.faltas) || 0;
  const valeDiscount = Number(details.valeDiscount) || totalVales;
  const subtotal = salary + bonus;
  const paidAmount = Math.abs(movement.amount);
  const diffFromBase = paidAmount - salary;
  const paymentMethod = movement.payment_method ? 'Conta bancária' : (details.paymentMethod || '');

  return (
    <div className="mt-2 rounded-lg border bg-muted/30 p-3 space-y-1 text-xs">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Salário base</span>
        <span className="font-medium">{fmt(salary)}</span>
      </div>
      {bonus > 0 && (
        <div className="flex justify-between text-green-600">
          <span>+ Bônus</span>
          <span>+{fmt(bonus)}</span>
        </div>
      )}
      {(bonus > 0) && (
        <div className="flex justify-between border-t pt-1">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium">{fmt(subtotal)}</span>
        </div>
      )}
      {totalVales > 0 && (
        <>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total de vales acumulados</span>
            <span className="text-destructive">{fmt(totalVales)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Vales descontados neste pgto</span>
            <span className="text-destructive">-{fmt(valeDiscount)}</span>
          </div>
        </>
      )}
      {totalFaltas > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total de faltas</span>
          <span className="text-destructive">-{fmt(totalFaltas)}</span>
        </div>
      )}
      <div className="flex justify-between border-t pt-1">
        <span className="font-semibold">Valor pago</span>
        <span className="font-bold text-green-600">{fmt(paidAmount)}</span>
      </div>
      {diffFromBase !== 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Diferença do salário base</span>
          <span className={diffFromBase > 0 ? 'text-green-600' : 'text-destructive'}>{diffFromBase > 0 ? '+' : '-'}{fmt(Math.abs(diffFromBase))}</span>
        </div>
      )}
      {paymentMethod && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Forma</span>
          <span>{paymentMethod}</span>
        </div>
      )}
      <div className="pt-1">
        <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 px-2" onClick={onReceipt}>
          <FileText className="h-3 w-3" />
          Gerar Recibo
        </Button>
      </div>
    </div>
  );
}

export function EmployeeExtract({ open, onOpenChange, employeeName, employeeSalary, movements, balance, onDeleteMovement }: EmployeeExtractProps) {
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const { sortedItems, sortConfig, handleSort } = useTableSort(movements);
  const pagination = useDataPagination(sortedItems, 25);
  const { settings: companySettings } = useCompanySettings();
  const { enabled: wlEnabled } = useWhiteLabel();
  const { profile } = useAuth();
  const handleExport = () => {
    const html = generateExtractHTMLWithHeader(employeeName, movements, balance, companySettings, wlEnabled);
    openHTMLInNewTab(html);
  };

  const handleReceipt = (m: EmployeeMovement) => {
    const html = generateReceiptHTML({
      employeeName,
      salary: employeeSalary,
      movement: m,
      companySettings,
      whiteLabel: wlEnabled,
      generatedByName: profile?.full_name || undefined,
    });
    openHTMLInNewTab(html);
  };

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={`Extrato — ${employeeName}`} className="sm:max-w-[900px]">
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
            <Download className="h-4 w-4" />
            Exportar
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border p-3 text-center">
            <p className="text-xs text-muted-foreground">Bônus</p>
            <p className="text-sm font-semibold text-green-600">{fmt(balance.totalBonus)}</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className="text-xs text-muted-foreground">Vales</p>
            <p className="text-sm font-semibold text-destructive">{fmt(balance.totalVales)}</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className="text-xs text-muted-foreground">Faltas</p>
            <p className="text-sm font-semibold text-destructive">{fmt(balance.totalFaltas)}</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className="text-xs text-muted-foreground">Saldo</p>
            <p className={`text-sm font-semibold ${balance.currentBalance >= 0 ? 'text-green-600' : 'text-destructive'}`}>
              {fmt(balance.currentBalance)}
            </p>
          </div>
        </div>

        <div className="overflow-auto rounded-lg border divide-y">
          {pagination.paginatedItems.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">Nenhuma movimentação</div>
          ) : pagination.paginatedItems.map(m => {
            const isPayment = m.type === 'pagamento';
            return (
              <div key={m.id} className="p-3 space-y-2">
                {/* Movement header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant={getMovementBadgeVariant(m.type) as any} className="text-[10px] shrink-0">
                      {formatMovementType(m.type)}
                    </Badge>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(m.created_at), 'dd/MM/yyyy HH:mm')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <div className={`text-xs font-semibold ${['vale', 'falta', 'pagamento'].includes(m.type) ? 'text-destructive' : 'text-green-600'}`}>
                        {['vale', 'falta', 'pagamento'].includes(m.type) ? '-' : '+'}{fmt(Math.abs(m.amount))}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Saldo após: {fmt(m.balance_after)}</div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir movimentação?</AlertDialogTitle>
                          <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDeleteMovement(m.id)}>Excluir</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                {/* Description */}
                {m.description && !isPayment && (
                  <p className="text-xs text-muted-foreground pl-1">{m.description}</p>
                )}
                {isPayment && (
                  <>
                    {m.description && <p className="text-xs text-muted-foreground pl-1">{m.description}</p>}
                    <PaymentDetails
                      movement={m}
                      salary={employeeSalary}
                      fmt={fmt}
                      onReceipt={() => handleReceipt(m)}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>

        {movements.length > 0 && (
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
        )}
      </div>
    </ResponsiveModal>
  );
}

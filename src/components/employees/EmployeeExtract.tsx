import { Trash2 } from 'lucide-react';
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
import { format } from 'date-fns';

interface EmployeeExtractProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeName: string;
  movements: EmployeeMovement[];
  balance: BalanceSummary;
  onDeleteMovement: (id: string) => void;
}

export function EmployeeExtract({ open, onOpenChange, employeeName, movements, balance, onDeleteMovement }: EmployeeExtractProps) {
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const { sortedItems, sortConfig, handleSort } = useTableSort(movements);
  const pagination = useDataPagination(sortedItems, 25);

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={`Extrato — ${employeeName}`} className="sm:max-w-[900px]">
      <div className="space-y-4">
        {/* Summary cards */}
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

        {/* Movements table */}
        <div className="overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="created_at" sortConfig={sortConfig} onSort={handleSort} className="whitespace-nowrap">Data</SortableTableHead>
                <SortableTableHead sortKey="type" sortConfig={sortConfig} onSort={handleSort}>Tipo</SortableTableHead>
                <SortableTableHead sortKey="description" sortConfig={sortConfig} onSort={handleSort}>Descrição</SortableTableHead>
                <SortableTableHead sortKey="amount" sortConfig={sortConfig} onSort={handleSort} className="text-right whitespace-nowrap">Valor</SortableTableHead>
                <SortableTableHead sortKey="balance_after" sortConfig={sortConfig} onSort={handleSort} className="text-right whitespace-nowrap">Saldo</SortableTableHead>
                <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={() => {}} className="w-10"> </SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.paginatedItems.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma movimentação</TableCell></TableRow>
              ) : pagination.paginatedItems.map(m => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs whitespace-nowrap">{format(new Date(m.created_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                  <TableCell>
                    <Badge variant={getMovementBadgeVariant(m.type) as any} className="text-[10px]">
                      {formatMovementType(m.type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{m.description || '—'}</TableCell>
                  <TableCell className={`text-right text-xs font-medium ${['vale', 'falta'].includes(m.type) ? 'text-destructive' : 'text-green-600'}`}>
                    {['vale', 'falta'].includes(m.type) ? '-' : '+'}{fmt(Math.abs(m.amount))}
                  </TableCell>
                  <TableCell className="text-right text-xs">{fmt(m.balance_after)}</TableCell>
                  <TableCell>
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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

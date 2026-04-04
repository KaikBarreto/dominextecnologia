import { Trash2, Download } from 'lucide-react';
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

function generateExtractHTML(employeeName: string, movements: EmployeeMovement[], balance: BalanceSummary): string {
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const sorted = [...movements].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Extrato — ${employeeName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #1a1a1a; font-size: 13px; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .subtitle { color: #666; margin-bottom: 16px; font-size: 12px; }
  .summary { display: flex; gap: 12px; margin-bottom: 20px; }
  .summary-card { flex: 1; border: 1px solid #e5e5e5; border-radius: 8px; padding: 12px; text-align: center; }
  .summary-card .label { font-size: 11px; color: #888; text-transform: uppercase; }
  .summary-card .value { font-size: 14px; font-weight: 700; margin-top: 2px; }
  .green { color: #16a34a; }
  .red { color: #dc2626; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #eee; font-size: 12px; }
  th { background: #f9fafb; font-weight: 600; font-size: 11px; text-transform: uppercase; color: #666; }
  .right { text-align: right; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600; }
  .badge-vale { background: #fef2f2; color: #dc2626; }
  .badge-bonus { background: #f0fdf4; color: #16a34a; }
  .badge-falta { background: #f5f5f5; color: #666; }
  .badge-pagamento { background: #eff6ff; color: #2563eb; }
  .badge-ajuste { background: #f5f5f5; color: #666; }
  .btn-print { position: fixed; top: 16px; right: 16px; background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; }
  .btn-print:hover { background: #1d4ed8; }
  @media print { .btn-print { display: none; } }
</style>
</head>
<body>
<button class="btn-print" onclick="window.print()">Salvar em PDF</button>
<h1>Extrato — ${employeeName}</h1>
<p class="subtitle">Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm')}</p>

<div class="summary">
  <div class="summary-card"><div class="label">Bônus</div><div class="value green">${fmt(balance.totalBonus)}</div></div>
  <div class="summary-card"><div class="label">Vales</div><div class="value red">${fmt(balance.totalVales)}</div></div>
  <div class="summary-card"><div class="label">Faltas</div><div class="value red">${fmt(balance.totalFaltas)}</div></div>
  <div class="summary-card"><div class="label">Saldo</div><div class="value ${balance.currentBalance >= 0 ? 'green' : 'red'}">${fmt(balance.currentBalance)}</div></div>
</div>

<table>
<thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th class="right">Valor</th><th class="right">Saldo</th></tr></thead>
<tbody>
${sorted.map(m => {
  const isDebit = ['vale', 'falta'].includes(m.type);
  const badgeClass = `badge badge-${m.type}`;
  return `<tr>
    <td>${format(new Date(m.created_at), 'dd/MM/yyyy HH:mm')}</td>
    <td><span class="${badgeClass}">${formatMovementType(m.type)}</span></td>
    <td>${m.description || '—'}</td>
    <td class="right ${isDebit ? 'red' : 'green'}">${isDebit ? '-' : '+'}${fmt(Math.abs(m.amount))}</td>
    <td class="right">${fmt(m.balance_after)}</td>
  </tr>`;
}).join('')}
</tbody>
</table>
</body></html>`;
}

export function EmployeeExtract({ open, onOpenChange, employeeName, movements, balance, onDeleteMovement }: EmployeeExtractProps) {
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const { sortedItems, sortConfig, handleSort } = useTableSort(movements);
  const pagination = useDataPagination(sortedItems, 25);

  const handleExport = () => {
    const html = generateExtractHTML(employeeName, movements, balance);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      win.onload = () => URL.revokeObjectURL(url);
    }
  };

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={`Extrato — ${employeeName}`} className="sm:max-w-[900px]">
      <div className="space-y-4">
        {/* Export button */}
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
            <Download className="h-4 w-4" />
            Exportar
          </Button>
        </div>

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

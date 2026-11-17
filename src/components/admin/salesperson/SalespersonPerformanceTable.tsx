import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Pencil, Trash2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { useTableSort } from '@/hooks/useTableSort';
import { type Salesperson, type SalespersonSale, type SalespersonAdvance, salesForPerson, commissionForPerson } from '@/hooks/useSalespersonData';

const TEAM_AREA_LABELS: Record<string, string> = {
  sales: 'Comercial', customer_success: 'Sucesso do Cliente', support: 'Suporte', financial: 'Financeiro',
  admin: 'Administrativo', partner: 'Sócio / Pró-labore', other: 'Outro',
};

function rotationStatus(person: Salesperson) {
  const eligible = Boolean(person.is_active && person.can_receive_sales && person.in_rotation && person.phone?.trim());
  const lastAssignment = person.last_lead_assigned_at
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(person.last_lead_assigned_at))
    : null;
  return { eligible, lastAssignment };
}

interface Props {
  salespeople: Salesperson[];
  sales: SalespersonSale[];
  advances: SalespersonAdvance[];
  onEdit: (s: Salesperson) => void;
  onDelete: (id: string) => void;
  /** A listagem também é usada no workspace, onde só master pode administrar cadastros. */
  canManage?: boolean;
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export function SalespersonPerformanceTable({ salespeople, sales, advances, onEdit, onDelete, canManage = true }: Props) {
  const navigate = useNavigate();

  // Pré-calcula stats por vendedor pra permitir ordenação por colunas derivadas
  // (Vendas, Comissão, Vales, Saldo, Meta%). Sem isso o useTableSort não consegue
  // comparar campos que dependem de cross-references entre arrays.
  const rows = useMemo(() => {
    return salespeople.map((p) => {
      // Vendas em que p participou (closer OU SDR); comissão = parcela dele.
      const s = salesForPerson(sales, p.id);
      const a = advances.filter((x) => x.salesperson_id === p.id);
      const totalCommission = s.reduce((sum, x) => sum + commissionForPerson(x, p.id), 0);
      const totalAdvances = a.reduce((sum, x) => sum + (x.amount || 0), 0);
      const totalSales = s.length;
      const salary = Number(p.salary) || 0;
      const balance = salary + totalCommission - totalAdvances;
      const goal = p.monthly_goal || 30;
      const pct = Math.min((totalSales / goal) * 100, 100);
      return {
        ...p,
        _totalSales: totalSales,
        _totalCommission: totalCommission,
        _totalAdvances: totalAdvances,
        _balance: balance,
        _pct: pct,
        _isActive: p.is_active !== false ? 1 : 0,
      };
    });
  }, [salespeople, sales, advances]);

  const { sortedItems, sortConfig, handleSort } = useTableSort(rows, 'name', 'asc');

  return (
    <div className="relative rounded-lg border border-border overflow-x-auto">
      <Table className="min-w-[1040px]">
        <TableHeader>
          <TableRow>
            <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={handleSort}>Pessoa</SortableTableHead>
            <SortableTableHead sortKey="_totalSales" sortConfig={sortConfig} onSort={handleSort} className="text-center">Vendas</SortableTableHead>
            <SortableTableHead sortKey="_totalCommission" sortConfig={sortConfig} onSort={handleSort} className="text-right">Comissão</SortableTableHead>
            <SortableTableHead sortKey="_totalAdvances" sortConfig={sortConfig} onSort={handleSort} className="text-right">Vales/Adiantamentos</SortableTableHead>
            <SortableTableHead sortKey="_balance" sortConfig={sortConfig} onSort={handleSort} className="text-right">Saldo</SortableTableHead>
            <SortableTableHead sortKey="_pct" sortConfig={sortConfig} onSort={handleSort} className="text-center">Meta</SortableTableHead>
            <SortableTableHead sortKey="_isActive" sortConfig={sortConfig} onSort={handleSort}>Status</SortableTableHead>
            {canManage && <TableHead className="text-right text-xs uppercase tracking-wider">Ações</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedItems.map((p) => {
            const st = { totalSales: p._totalSales, totalCommission: p._totalCommission, totalAdvances: p._totalAdvances, balance: p._balance };
            const pct = p._pct;
            const canReceiveSales = p.can_receive_sales !== false;
            const rotation = rotationStatus(p);
            return (
              <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/admin/vendedores/${p.id}`)}>
                <TableCell className="min-w-[220px]">
                  <p className="font-medium">{p.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {TEAM_AREA_LABELS[p.person_type || 'sales'] || 'Outro'}
                    {!canReceiveSales ? " · Vendas desabilitadas" : p.person_type && p.person_type !== "sales" ? " · Também recebe vendas" : ""}
                  </p>
                  {rotation.eligible && <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">No rodízio</p>}
                  {p.in_rotation && !rotation.eligible && <p className="mt-1 text-xs text-muted-foreground">Rodízio indisponível</p>}
                  {rotation.lastAssignment && <p className="mt-1 text-[10px] text-muted-foreground">Último lead: {rotation.lastAssignment}</p>}
                </TableCell>
                <TableCell className="text-center">{canReceiveSales ? st.totalSales : '—'}</TableCell>
                <TableCell className="text-right">{canReceiveSales ? fmt(st.totalCommission) : '—'}</TableCell>
                <TableCell className="text-right text-destructive">{st.totalAdvances > 0 && '-'}{fmt(st.totalAdvances)}</TableCell>
                <TableCell className={`text-right font-medium ${st.balance >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>{fmt(st.balance)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={pct} className="h-2 w-16" />
                    <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className={p.is_active !== false ? 'text-sm' : 'text-sm text-destructive'}>
                    {p.is_active !== false ? 'Ativo' : 'Inativo'}
                  </span>
                </TableCell>
                {canManage && <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="destructive-ghost" size="sm" onClick={() => onDelete(p.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

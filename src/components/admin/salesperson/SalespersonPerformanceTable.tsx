import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Pencil, Trash2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Salesperson, SalespersonSale, SalespersonAdvance } from '@/hooks/useSalespersonData';

interface Props {
  salespeople: Salesperson[];
  sales: SalespersonSale[];
  advances: SalespersonAdvance[];
  onEdit: (s: Salesperson) => void;
  onDelete: (id: string) => void;
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export function SalespersonPerformanceTable({ salespeople, sales, advances, onEdit, onDelete }: Props) {
  const navigate = useNavigate();

  const stats = (id: string, salary: number) => {
    const s = sales.filter((x) => x.salesperson_id === id);
    const a = advances.filter((x) => x.salesperson_id === id);
    const totalCommission = s.reduce((sum, x) => sum + (x.commission_amount || 0), 0);
    const totalAdvances = a.reduce((sum, x) => sum + (x.amount || 0), 0);
    return {
      totalSales: s.length,
      totalCommission,
      totalAdvances,
      balance: (salary || 0) + totalCommission - totalAdvances,
    };
  };

  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <Table className="min-w-[800px]">
        <TableHeader>
          <TableRow>
            <TableHead>Vendedor</TableHead>
            <TableHead className="text-center">Vendas</TableHead>
            <TableHead className="text-right">Comissão</TableHead>
            <TableHead className="text-right">Vales</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
            <TableHead className="text-center">Meta</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {salespeople.map((p) => {
            const st = stats(p.id, Number(p.salary) || 0);
            const goal = p.monthly_goal || 30;
            const pct = Math.min((st.totalSales / goal) * 100, 100);
            return (
              <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/admin/vendedores/${p.id}`)}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell className="text-center">{st.totalSales}</TableCell>
                <TableCell className="text-right">{fmt(st.totalCommission)}</TableCell>
                <TableCell className="text-right text-destructive">{st.totalAdvances > 0 && '-'}{fmt(st.totalAdvances)}</TableCell>
                <TableCell className={`text-right font-medium ${st.balance >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>{fmt(st.balance)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={pct} className="h-2 w-16" />
                    <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={p.is_active !== false ? 'default' : 'secondary'}>
                    {p.is_active !== false ? 'Ativo' : 'Inativo'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onDelete(p.id)} className="hover:bg-destructive hover:text-destructive-foreground">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

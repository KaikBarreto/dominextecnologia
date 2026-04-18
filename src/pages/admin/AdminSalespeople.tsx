import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, DollarSign, Target, TrendingUp, Edit, Trash2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSalespeople, useAllSalespersonSales, useAllSalespersonPayments, useDeleteSalesperson, type Salesperson } from '@/hooks/useSalespersonData';
import { SalespersonFormDialog } from '@/components/admin/salesperson/SalespersonFormDialog';
import { toast } from 'sonner';
import { startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function AdminSalespeople() {
  const navigate = useNavigate();
  const { data: salespeople = [], isLoading } = useSalespeople();
  const { data: allSales = [] } = useAllSalespersonSales();
  const { data: allPayments = [] } = useAllSalespersonPayments();
  const del = useDeleteSalesperson();

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Salesperson | null>(null);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Salesperson | null>(null);

  const monthStart = startOfMonth(new Date());
  const monthEnd = endOfMonth(new Date());

  const stats = useMemo(() => {
    const salesThisMonth = allSales.filter((s) => {
      try { return isWithinInterval(parseISO(s.created_at), { start: monthStart, end: monthEnd }); } catch { return false; }
    });
    const commissionPaid = allPayments
      .filter((p) => { try { return isWithinInterval(parseISO(p.reference_month), { start: monthStart, end: monthEnd }); } catch { return false; } })
      .reduce((acc, p) => acc + Number(p.commission_amount || 0), 0);
    const totalGoal = salespeople.filter((s) => s.is_active).reduce((acc, s) => acc + (s.monthly_goal || 0), 0);
    return {
      total: salespeople.length,
      active: salespeople.filter((s) => s.is_active).length,
      salesCount: salesThisMonth.length,
      salesValue: salesThisMonth.reduce((acc, s) => acc + Number(s.amount || 0), 0),
      commissionPaid,
      goalPct: totalGoal > 0 ? Math.round((salesThisMonth.length / totalGoal) * 100) : 0,
    };
  }, [salespeople, allSales, allPayments]);

  const performance = useMemo(() => {
    return salespeople.map((sp) => {
      const sales = allSales.filter((s) => s.salesperson_id === sp.id);
      const monthSales = sales.filter((s) => {
        try { return isWithinInterval(parseISO(s.created_at), { start: monthStart, end: monthEnd }); } catch { return false; }
      });
      const totalCommission = monthSales.reduce((acc, s) => acc + Number(s.commission_amount || 0), 0);
      return {
        ...sp,
        salesCount: monthSales.length,
        totalAmount: monthSales.reduce((acc, s) => acc + Number(s.amount || 0), 0),
        totalCommission,
        goalPct: sp.monthly_goal > 0 ? Math.round((monthSales.length / sp.monthly_goal) * 100) : 0,
      };
    }).filter((sp) => !search || sp.name.toLowerCase().includes(search.toLowerCase()));
  }, [salespeople, allSales, search]);

  const copyCode = (code: string | null) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    toast.success('Código copiado');
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Vendedores</h1>
          <p className="text-sm text-muted-foreground">Gestão de equipe comercial, comissões e metas</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo vendedor
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Vendedores</span>
            <Users className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold mt-1">{stats.total}</p>
          <p className="text-xs text-muted-foreground">{stats.active} ativos</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Vendas no mês</span>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold mt-1">{stats.salesCount}</p>
          <p className="text-xs text-muted-foreground">{fmt(stats.salesValue)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Comissões pagas</span>
            <DollarSign className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold mt-1">{fmt(stats.commissionPaid)}</p>
          <p className="text-xs text-muted-foreground">no mês</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">% Meta geral</span>
            <Target className="h-4 w-4 text-violet-500" />
          </div>
          <p className="text-2xl font-bold mt-1">{stats.goalPct}%</p>
          <p className="text-xs text-muted-foreground">do mês</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="font-semibold">Performance por vendedor</h3>
          <Input placeholder="Buscar..." className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendedor</TableHead>
                <TableHead>Código</TableHead>
                <TableHead className="text-right">Vendas (mês)</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
                <TableHead className="text-right">Meta</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>}
              {!isLoading && performance.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum vendedor cadastrado</TableCell></TableRow>}
              {performance.map((sp) => (
                <TableRow key={sp.id} className="cursor-pointer hover:bg-muted/30" onClick={() => navigate(`/admin/vendedores/${sp.id}`)}>
                  <TableCell className="font-medium">{sp.name}</TableCell>
                  <TableCell>
                    {sp.referral_code && (
                      <button onClick={(e) => { e.stopPropagation(); copyCode(sp.referral_code); }} className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline">
                        {sp.referral_code} <Copy className="h-3 w-3" />
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{sp.salesCount}</TableCell>
                  <TableCell className="text-right">{fmt(sp.totalAmount)}</TableCell>
                  <TableCell className="text-right text-emerald-600 font-medium">{fmt(sp.totalCommission)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={sp.goalPct >= 100 ? 'default' : 'secondary'}>{sp.goalPct}%</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={sp.is_active ? 'default' : 'secondary'}>{sp.is_active ? 'Ativo' : 'Inativo'}</Badge>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(sp); setOpen(true); }}><Edit className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setToDelete(sp)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <SalespersonFormDialog open={open} onOpenChange={setOpen} salesperson={editing} />

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover vendedor?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso remove "{toDelete?.name}" e todos os registros (vendas, vales, pagamentos) associados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { if (toDelete) await del.mutateAsync(toDelete.id); setToDelete(null); }}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

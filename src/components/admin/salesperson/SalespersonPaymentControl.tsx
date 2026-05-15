import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle, Calendar, DollarSign } from 'lucide-react';
import {
  type Salesperson, type SalespersonSale, type SalespersonAdvance, type SalespersonPayment,
  useCreatePayment, useSaveSalesperson,
} from '@/hooks/useSalespersonData';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';

interface Props {
  salesperson: Salesperson;
  allSales: SalespersonSale[];
  allAdvances: SalespersonAdvance[];
  payments: SalespersonPayment[];
  /** Modo read-only para vendedor admin restrito vendo o próprio registro — só consulta de comissão/saldo. */
  readOnly?: boolean;
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export function SalespersonPaymentControl({ salesperson, allSales, allAdvances, payments, readOnly = false }: Props) {
  const [editingSalary, setEditingSalary] = useState(false);
  const [newSalary, setNewSalary] = useState(Number(salesperson.salary) || 0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selected, setSelected] = useState<ReturnType<typeof getMonthData> | null>(null);

  const createPayment = useCreatePayment();
  const saveSalesperson = useSaveSalesperson();

  const now = new Date();
  const previousMonth = subMonths(now, 1);

  function getMonthData(month: Date) {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const monthStr = format(month, 'yyyy-MM-01');
    const sales = allSales.filter((s) => {
      const d = new Date(s.created_at);
      return d >= start && d <= end;
    });
    const advances = allAdvances.filter((a) => {
      const d = new Date(a.created_at);
      return d >= start && d <= end;
    });
    const isPaid = payments.some((p) => p.reference_month?.startsWith(format(month, 'yyyy-MM')));
    const totalCommission = sales.reduce((s, x) => s + (x.commission_amount || 0), 0);
    const totalAdvances = advances.reduce((s, x) => s + (x.amount || 0), 0);
    const salary = Number(salesperson.salary) || 0;
    const totalToReceive = salary + totalCommission - totalAdvances;
    return { month, monthStr, salary, totalCommission, totalAdvances, totalToReceive, isPaid, salesCount: sales.length };
  }

  const prevData = getMonthData(previousMonth);
  const currData = getMonthData(now);

  const handleSaveSalary = async () => {
    try {
      await saveSalesperson.mutateAsync({ id: salesperson.id, salary: newSalary } as any);
      setEditingSalary(false);
    } catch {
      toast.error('Erro ao atualizar salário');
    }
  };

  const handlePay = (data: ReturnType<typeof getMonthData>) => {
    if (data.isPaid) { toast.info('Mês já pago'); return; }
    if (data.totalToReceive <= 0) { toast.error('Sem valor a pagar'); return; }
    setSelected(data);
    setConfirmOpen(true);
  };

  const confirmPayment = async () => {
    if (!selected) return;
    await createPayment.mutateAsync({
      salesperson_id: salesperson.id,
      reference_month: selected.monthStr,
      salary_amount: selected.salary,
      commission_amount: selected.totalCommission,
      advances_deducted: selected.totalAdvances,
      total_amount: selected.totalToReceive,
    });
    setConfirmOpen(false);
  };

  const renderMonthCard = (data: ReturnType<typeof getMonthData>, isCurrent = false) => (
    <Card className={data.isPaid ? 'border-emerald-500' : isCurrent ? 'border-amber-500' : ''}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span className="capitalize">{format(data.month, 'MMMM yyyy', { locale: ptBR })}</span>
            {isCurrent && <span className="text-xs text-muted-foreground">(Atual)</span>}
          </div>
          {data.isPaid && <CheckCircle className="h-5 w-5 text-emerald-500" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-sm"><span>Salário:</span><span>{fmt(data.salary)}</span></div>
        <div className="flex justify-between text-sm">
          <span>Comissões ({data.salesCount} vendas):</span>
          <span className="text-emerald-600">+{fmt(data.totalCommission)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Vales:</span>
          <span className="text-destructive">-{fmt(data.totalAdvances)}</span>
        </div>
        <div className="border-t pt-3 flex justify-between font-bold">
          <span>{isCurrent ? 'Total (Próx. Mês):' : 'Total a Receber:'}</span>
          <span className={data.totalToReceive >= 0 ? 'text-emerald-600' : 'text-destructive'}>{fmt(data.totalToReceive)}</span>
        </div>
        {!readOnly && (
          <Button
            variant={isCurrent ? 'outline' : 'default'}
            className="w-full"
            onClick={() => handlePay(data)}
            disabled={data.isPaid || data.totalToReceive <= 0 || createPayment.isPending}
          >
            {data.isPaid ? 'Pago ✓' : isCurrent ? 'Pagar Antecipado' : 'Marcar como Pago'}
          </Button>
        )}
        {readOnly && data.isPaid && (
          <div className="text-center text-sm font-semibold text-emerald-600">Pago ✓</div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Salário Fixo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {editingSalary ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input type="number" step="0.01" min="0" value={newSalary}
                onChange={(e) => setNewSalary(parseFloat(e.target.value) || 0)} className="w-40" />
              <Button size="sm" onClick={handleSaveSalary} disabled={saveSalesperson.isPending}>Salvar</Button>
              <Button size="sm" variant="outline" onClick={() => setEditingSalary(false)}>Cancelar</Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <span className="text-2xl font-bold">{fmt(Number(salesperson.salary) || 0)}</span>
              {!readOnly && (
                <Button variant="outline" size="sm" onClick={() => { setNewSalary(Number(salesperson.salary) || 0); setEditingSalary(true); }}>
                  Editar
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {renderMonthCard(prevData)}
        {renderMonthCard(currData, true)}
      </div>

      <ResponsiveModal open={confirmOpen} onOpenChange={setConfirmOpen} title="Confirmar Pagamento">
        {selected && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Pagamento para <strong>{salesperson.name}</strong> referente a{' '}
              <strong className="capitalize">{format(selected.month, 'MMMM yyyy', { locale: ptBR })}</strong>.
            </p>
            <div className="rounded-lg border p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span>Salário</span><span>{fmt(selected.salary)}</span></div>
              <div className="flex justify-between"><span>+ Comissão</span><span className="text-emerald-600">{fmt(selected.totalCommission)}</span></div>
              <div className="flex justify-between"><span>− Vales</span><span className="text-destructive">{fmt(selected.totalAdvances)}</span></div>
              <div className="flex justify-between font-bold pt-2 border-t">
                <span>Total</span><span>{fmt(selected.totalToReceive)}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmOpen(false)} className="flex-1">Cancelar</Button>
              <Button onClick={confirmPayment} disabled={createPayment.isPending} className="flex-1">Confirmar</Button>
            </div>
          </div>
        )}
      </ResponsiveModal>
    </div>
  );
}

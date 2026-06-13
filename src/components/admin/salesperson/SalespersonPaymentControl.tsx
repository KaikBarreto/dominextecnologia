import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle, Calendar, CalendarIcon, DollarSign, History, Pencil, Trash2 } from 'lucide-react';
import {
  type Salesperson, type SalespersonSale, type SalespersonAdvance, type SalespersonPayment,
  useCreatePayment, useSaveSalesperson, useUpdatePaymentDate, useDeletePayment,
  commissionForPerson, salesForPerson,
} from '@/hooks/useSalespersonData';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { brtTransactionTimestamp } from '@/lib/date-br';

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
  const [payDate, setPayDate] = useState<Date>(new Date());
  const [editPayment, setEditPayment] = useState<SalespersonPayment | null>(null);
  const [editDate, setEditDate] = useState<Date>(new Date());
  const [deletePayment, setDeletePayment] = useState<SalespersonPayment | null>(null);

  const createPayment = useCreatePayment();
  const saveSalesperson = useSaveSalesperson();
  const updatePaymentDate = useUpdatePaymentDate();
  const removePayment = useDeletePayment();

  const now = new Date();
  const previousMonth = subMonths(now, 1);

  function getMonthData(month: Date) {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const monthStr = format(month, 'yyyy-MM-01');
    // Inclui vendas onde X é closer OU SDR; a comissão é a parcela dele em cada uma.
    const sales = salesForPerson(allSales, salesperson.id).filter((s) => {
      const d = new Date(s.created_at);
      return d >= start && d <= end;
    });
    const advances = allAdvances.filter((a) => {
      const d = new Date(a.created_at);
      return d >= start && d <= end;
    });
    const isPaid = payments.some((p) => p.reference_month?.startsWith(format(month, 'yyyy-MM')));
    const totalCommission = sales.reduce((s, x) => s + commissionForPerson(x, salesperson.id), 0);
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
    setPayDate(new Date());
    setConfirmOpen(true);
  };

  const confirmPayment = async () => {
    if (!selected) return;
    await createPayment.mutateAsync({
      salesperson_id: salesperson.id,
      salesperson_name: salesperson.name,
      reference_month: selected.monthStr,
      salary_amount: selected.salary,
      commission_amount: selected.totalCommission,
      advances_deducted: selected.totalAdvances,
      total_amount: selected.totalToReceive,
      paid_at: brtTransactionTimestamp(payDate),
    });
    setConfirmOpen(false);
  };

  const openEditDate = (p: SalespersonPayment) => {
    setEditPayment(p);
    setEditDate(p.paid_at ? new Date(p.paid_at) : new Date());
  };

  const confirmEditDate = async () => {
    if (!editPayment) return;
    await updatePaymentDate.mutateAsync({ id: editPayment.id, paidAt: brtTransactionTimestamp(editDate) });
    setEditPayment(null);
  };

  const confirmDelete = async () => {
    if (!deletePayment) return;
    await removePayment.mutateAsync(deletePayment.id);
    setDeletePayment(null);
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" /> Pagamentos Realizados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Nenhum pagamento registrado</div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 p-3 border rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{fmt(Number(p.total_amount) || 0)}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Ref. <span className="capitalize">{format(new Date(`${p.reference_month}T00:00:00`), 'MMMM yyyy', { locale: ptBR })}</span>
                      {' • Pago em '}
                      {p.paid_at ? format(new Date(p.paid_at), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                    </div>
                  </div>
                  {!readOnly && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => openEditDate(p)} className="text-amber-600 hover:bg-amber-500 hover:text-white" title="Editar data">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeletePayment(p)} className="hover:bg-destructive hover:text-white" title="Excluir pagamento">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
            <div className="space-y-2">
              <Label>Data do pagamento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    {format(payDate, 'dd/MM/yyyy', { locale: ptBR })}
                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker mode="single" selected={payDate} onSelect={(d) => d && setPayDate(d)} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmOpen(false)} className="flex-1">Cancelar</Button>
              <Button onClick={confirmPayment} disabled={createPayment.isPending} className="flex-1">Confirmar</Button>
            </div>
          </div>
        )}
      </ResponsiveModal>

      <ResponsiveModal open={!!editPayment} onOpenChange={(o) => !o && setEditPayment(null)} title="Editar Data do Pagamento">
        {editPayment && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ajuste a data em que o pagamento de{' '}
              <strong>{fmt(Number(editPayment.total_amount) || 0)}</strong> foi feito. O financeiro é
              atualizado pra essa data.
            </p>
            <div className="space-y-2">
              <Label>Data do pagamento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    {format(editDate, 'dd/MM/yyyy', { locale: ptBR })}
                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker mode="single" selected={editDate} onSelect={(d) => d && setEditDate(d)} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditPayment(null)} className="flex-1">Cancelar</Button>
              <Button onClick={confirmEditDate} disabled={updatePaymentDate.isPending} className="flex-1">Salvar</Button>
            </div>
          </div>
        )}
      </ResponsiveModal>

      <ResponsiveModal open={!!deletePayment} onOpenChange={(o) => !o && setDeletePayment(null)} title="Excluir Pagamento">
        {deletePayment && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja excluir o pagamento de{' '}
              <strong>{fmt(Number(deletePayment.total_amount) || 0)}</strong>? As despesas de salário e
              comissão lançadas no financeiro também serão removidas.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDeletePayment(null)} className="flex-1">Cancelar</Button>
              <Button variant="destructive" onClick={confirmDelete} disabled={removePayment.isPending} className="flex-1">Excluir</Button>
            </div>
          </div>
        )}
      </ResponsiveModal>
    </div>
  );
}

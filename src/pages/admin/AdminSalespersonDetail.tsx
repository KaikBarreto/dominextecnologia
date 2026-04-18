import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Wallet, TrendingUp, DollarSign, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  useSalesperson, useSalespersonSales, useSalespersonAdvances, useSalespersonPayments,
  useCreateAdvance, useCreatePayment, useDeleteAdvance,
} from '@/hooks/useSalespersonData';
import { toast } from 'sonner';

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function AdminSalespersonDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: salesperson, isLoading } = useSalesperson(id);
  const { data: allSales = [] } = useSalespersonSales(id);
  const { data: allAdvances = [] } = useSalespersonAdvances(id);
  const { data: payments = [] } = useSalespersonPayments(id);
  const createAdvance = useCreateAdvance();
  const createPayment = useCreatePayment();
  const deleteAdvance = useDeleteAdvance();

  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advanceData, setAdvanceData] = useState({ amount: 0, description: '' });
  const [payOpen, setPayOpen] = useState(false);

  const month = useMemo(() => {
    const now = new Date();
    return { start: startOfMonth(now), end: endOfMonth(now), key: format(now, 'yyyy-MM-01') };
  }, []);

  const monthSales = useMemo(() => allSales.filter((s) => {
    const d = new Date(s.created_at);
    return d >= month.start && d <= month.end;
  }), [allSales, month]);

  const monthAdvances = useMemo(() => allAdvances.filter((a) => {
    const d = new Date(a.created_at);
    return d >= month.start && d <= month.end;
  }), [allAdvances, month]);

  const monthCommission = monthSales.reduce((s, x) => s + (x.commission_amount || 0), 0);
  const monthAdvanceTotal = monthAdvances.reduce((s, x) => s + (x.amount || 0), 0);
  const salary = Number(salesperson?.salary) || 0;
  const balance = salary + monthCommission - monthAdvanceTotal;
  const alreadyPaid = payments.some((p) => p.reference_month?.startsWith(format(month.start, 'yyyy-MM')));

  const submitAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (advanceData.amount <= 0) { toast.error('Valor inválido'); return; }
    await createAdvance.mutateAsync({
      salesperson_id: id!,
      amount: advanceData.amount,
      description: advanceData.description || null,
      reference_month: month.key,
    });
    setAdvanceOpen(false);
    setAdvanceData({ amount: 0, description: '' });
  };

  const confirmPayment = async () => {
    if (alreadyPaid) { toast.error('Mês já pago'); return; }
    await createPayment.mutateAsync({
      salesperson_id: id!,
      reference_month: month.key,
      salary_amount: salary,
      commission_amount: monthCommission,
      advances_deducted: monthAdvanceTotal,
      total_amount: balance,
    });
    setPayOpen(false);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!salesperson) {
    return (
      <div className="container mx-auto py-12 text-center">
        <p className="text-muted-foreground">Vendedor não encontrado.</p>
        <Button variant="outline" onClick={() => navigate('/admin/vendedores')} className="mt-4">Voltar</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/vendedores')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">{salesperson.name}</h1>
          <p className="text-sm text-muted-foreground">
            {salesperson.referral_code && <>Código: <code className="bg-muted px-1.5 py-0.5 rounded">{salesperson.referral_code}</code></>}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Salário</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmt(salary)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comissão (mês)</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{fmt(monthCommission)}</div>
            <p className="text-xs text-muted-foreground">{monthSales.length} vendas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vales (mês)</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">-{fmt(monthAdvanceTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo a pagar</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${balance >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>{fmt(balance)}</div>
            {alreadyPaid && <Badge variant="secondary" className="mt-1">Mês pago</Badge>}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">Vendas</TabsTrigger>
          <TabsTrigger value="advances">Vales</TabsTrigger>
          <TabsTrigger value="payments">Pagamentos</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Vendas</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente/Empresa</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Comissão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allSales.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma venda</TableCell></TableRow>
                  ) : allSales.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{format(new Date(s.created_at), 'dd/MM/yyyy', { locale: ptBR })}</TableCell>
                      <TableCell>{s.customer_company || s.customer_name || '—'}</TableCell>
                      <TableCell><Badge variant="outline">{s.customer_origin || '—'}</Badge></TableCell>
                      <TableCell>{s.billing_cycle === 'annual' ? 'Anual' : 'Mensal'}</TableCell>
                      <TableCell className="text-right">{fmt(Number(s.amount) || 0)}</TableCell>
                      <TableCell className="text-right text-emerald-600">{fmt(Number(s.commission_amount) || 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advances" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setAdvanceOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Registrar Vale
            </Button>
          </div>
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allAdvances.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum vale</TableCell></TableRow>
                  ) : allAdvances.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{format(new Date(a.created_at), 'dd/MM/yyyy', { locale: ptBR })}</TableCell>
                      <TableCell>{a.description || '—'}</TableCell>
                      <TableCell className="text-right text-destructive">-{fmt(Number(a.amount) || 0)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => deleteAdvance.mutate(a.id)}>Excluir</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Fechar mês: {format(month.start, "MMMM 'de' yyyy", { locale: ptBR })}</CardTitle>
              <Button onClick={() => setPayOpen(true)} disabled={alreadyPaid || balance <= 0}>
                {alreadyPaid ? 'Já pago' : 'Confirmar Pagamento'}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span>Salário</span><span>{fmt(salary)}</span></div>
                <div className="flex justify-between"><span>+ Comissão</span><span className="text-emerald-600">{fmt(monthCommission)}</span></div>
                <div className="flex justify-between"><span>− Vales</span><span className="text-destructive">{fmt(monthAdvanceTotal)}</span></div>
                <div className="flex justify-between font-bold pt-2 border-t mt-2"><span>Total</span><span>{fmt(balance)}</span></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Histórico de Pagamentos</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">Salário</TableHead>
                    <TableHead className="text-right">Comissão</TableHead>
                    <TableHead className="text-right">Vales</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum pagamento</TableCell></TableRow>
                  ) : payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{format(new Date(p.reference_month + 'T12:00:00'), "MMM/yyyy", { locale: ptBR })}</TableCell>
                      <TableCell className="text-right">{fmt(Number(p.salary_amount) || 0)}</TableCell>
                      <TableCell className="text-right text-emerald-600">{fmt(Number(p.commission_amount) || 0)}</TableCell>
                      <TableCell className="text-right text-destructive">-{fmt(Number(p.advances_deducted) || 0)}</TableCell>
                      <TableCell className="text-right font-bold">{fmt(Number(p.total_amount) || 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ResponsiveModal open={advanceOpen} onOpenChange={setAdvanceOpen} title="Registrar Vale">
        <form onSubmit={submitAdvance} className="space-y-4">
          <div className="space-y-2">
            <Label>Valor (R$)*</Label>
            <Input type="number" step="0.01" min="0.01" value={advanceData.amount}
              onChange={(e) => setAdvanceData({ ...advanceData, amount: parseFloat(e.target.value) || 0 })} required />
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea value={advanceData.description} onChange={(e) => setAdvanceData({ ...advanceData, description: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setAdvanceOpen(false)} className="flex-1">Cancelar</Button>
            <Button type="submit" disabled={createAdvance.isPending} className="flex-1">Salvar</Button>
          </div>
        </form>
      </ResponsiveModal>

      <ResponsiveModal open={payOpen} onOpenChange={setPayOpen} title="Confirmar Pagamento">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Confirma o pagamento de <strong>{fmt(balance)}</strong> a <strong>{salesperson.name}</strong> referente a {format(month.start, "MMMM 'de' yyyy", { locale: ptBR })}?
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPayOpen(false)} className="flex-1">Cancelar</Button>
            <Button onClick={confirmPayment} disabled={createPayment.isPending} className="flex-1">Confirmar</Button>
          </div>
        </div>
      </ResponsiveModal>
    </div>
  );
}

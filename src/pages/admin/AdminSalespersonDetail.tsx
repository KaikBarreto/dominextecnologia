import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit, DollarSign, TrendingUp, Wallet, Plus, Trash2, Copy, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useSalesperson, useSalespersonSales, useSalespersonAdvances, useSalespersonPayments,
  useCreateAdvance, useDeleteAdvance, useDeleteSale, useCreatePayment,
} from '@/hooks/useSalespersonData';
import { SalespersonFormDialog } from '@/components/admin/salesperson/SalespersonFormDialog';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function AdminSalespersonDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: sp } = useSalesperson(id);
  const { data: sales = [] } = useSalespersonSales(id);
  const { data: advances = [] } = useSalespersonAdvances(id);
  const { data: payments = [] } = useSalespersonPayments(id);
  const createAdvance = useCreateAdvance();
  const delAdvance = useDeleteAdvance();
  const delSale = useDeleteSale();
  const createPayment = useCreatePayment();

  const [editOpen, setEditOpen] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advAmount, setAdvAmount] = useState(0);
  const [advDesc, setAdvDesc] = useState('');
  const [paymentOpen, setPaymentOpen] = useState(false);

  const monthStart = startOfMonth(new Date());
  const monthEnd = endOfMonth(new Date());

  const monthSales = useMemo(() => sales.filter((s) => {
    try { return isWithinInterval(parseISO(s.created_at), { start: monthStart, end: monthEnd }); } catch { return false; }
  }), [sales]);

  const monthAdvances = useMemo(() => advances.filter((a) => {
    try { return isWithinInterval(parseISO(a.created_at), { start: monthStart, end: monthEnd }); } catch { return false; }
  }), [advances]);

  const totalCommissionMonth = monthSales.reduce((acc, s) => acc + Number(s.commission_amount || 0), 0);
  const totalAdvancesMonth = monthAdvances.reduce((acc, a) => acc + Number(a.amount || 0), 0);
  const salaryAmount = Number(sp?.salary || 0);
  const totalToPay = salaryAmount + totalCommissionMonth - totalAdvancesMonth;

  const handleAddAdvance = async () => {
    if (!id || !advAmount) { toast.error('Informe o valor'); return; }
    await createAdvance.mutateAsync({ salesperson_id: id, amount: advAmount, description: advDesc || null });
    setAdvanceOpen(false); setAdvAmount(0); setAdvDesc('');
  };

  const handleConfirmPayment = async () => {
    if (!id) return;
    await createPayment.mutateAsync({
      salesperson_id: id,
      salary_amount: salaryAmount,
      commission_amount: totalCommissionMonth,
      advances_deducted: totalAdvancesMonth,
      total_amount: totalToPay,
      reference_month: format(monthStart, 'yyyy-MM-dd'),
    });
    setPaymentOpen(false);
  };

  if (!sp) {
    return <div className="p-6"><Button variant="ghost" onClick={() => navigate('/admin/vendedores')}><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Button><p className="mt-4 text-muted-foreground">Carregando...</p></div>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/vendedores')}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{sp.name}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={sp.is_active ? 'default' : 'secondary'}>{sp.is_active ? 'Ativo' : 'Inativo'}</Badge>
            {sp.referral_code && (
              <button onClick={() => { navigator.clipboard.writeText(sp.referral_code!); toast.success('Código copiado'); }} className="inline-flex items-center gap-1 font-mono text-primary hover:underline">
                {sp.referral_code} <Copy className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
        <Button variant="outline" onClick={() => setEditOpen(true)}><Edit className="h-4 w-4 mr-2" /> Editar</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4"><span className="text-xs text-muted-foreground">Salário base</span><p className="text-xl font-bold mt-1">{fmt(salaryAmount)}</p></Card>
        <Card className="p-4"><span className="text-xs text-muted-foreground">Vendas no mês</span><p className="text-xl font-bold mt-1">{monthSales.length} <span className="text-sm font-normal text-muted-foreground">/ meta {sp.monthly_goal}</span></p></Card>
        <Card className="p-4"><span className="text-xs text-muted-foreground">Comissão do mês</span><p className="text-xl font-bold text-emerald-600 mt-1">{fmt(totalCommissionMonth)}</p></Card>
        <Card className="p-4"><span className="text-xs text-muted-foreground">Vales do mês</span><p className="text-xl font-bold text-amber-600 mt-1">{fmt(totalAdvancesMonth)}</p></Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="sales">Vendas</TabsTrigger>
          <TabsTrigger value="advances">Vales</TabsTrigger>
          <TabsTrigger value="payments">Pagamentos</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card className="p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" /> Cálculo do mês ({format(monthStart, 'MMMM/yyyy', { locale: ptBR })})</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Salário base</span><span className="font-medium">{fmt(salaryAmount)}</span></div>
              <div className="flex justify-between"><span>+ Comissão sobre vendas</span><span className="font-medium text-emerald-600">{fmt(totalCommissionMonth)}</span></div>
              <div className="flex justify-between"><span>− Vales descontados</span><span className="font-medium text-amber-600">−{fmt(totalAdvancesMonth)}</span></div>
              <div className="border-t pt-2 flex justify-between text-base font-bold"><span>Total a pagar</span><span className="text-primary">{fmt(totalToPay)}</span></div>
            </div>
            <Button className="mt-4 w-full" onClick={() => setPaymentOpen(true)}><CheckCircle2 className="h-4 w-4 mr-2" /> Confirmar pagamento do mês</Button>
          </Card>

          {(sp.email || sp.phone || sp.notes) && (
            <Card className="p-5">
              <h3 className="font-semibold mb-3">Contato</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {sp.email && <div><span className="text-muted-foreground">Email: </span>{sp.email}</div>}
                {sp.phone && <div><span className="text-muted-foreground">Telefone: </span>{sp.phone}</div>}
              </div>
              {sp.notes && <p className="mt-3 text-sm text-muted-foreground whitespace-pre-line">{sp.notes}</p>}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="sales">
          <Card className="p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente / Empresa</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Ciclo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Nenhuma venda</TableCell></TableRow>}
                {sales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm">{format(parseISO(s.created_at), 'dd/MM/yyyy')}</TableCell>
                    <TableCell>{s.customer_company || s.customer_name || '—'}</TableCell>
                    <TableCell><Badge variant="outline">{s.customer_origin || '—'}</Badge></TableCell>
                    <TableCell>{s.billing_cycle === 'annual' ? 'Anual' : 'Mensal'}</TableCell>
                    <TableCell className="text-right">{fmt(Number(s.amount))}</TableCell>
                    <TableCell className="text-right text-emerald-600 font-medium">{fmt(Number(s.commission_amount))}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={async () => { await delSale.mutateAsync(s.id); }}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="advances">
          <Card className="p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">Vales</h3>
              <Button size="sm" onClick={() => setAdvanceOpen(true)}><Plus className="h-4 w-4 mr-1" /> Novo vale</Button>
            </div>
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
                {advances.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Nenhum vale</TableCell></TableRow>}
                {advances.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-sm">{format(parseISO(a.created_at), 'dd/MM/yyyy')}</TableCell>
                    <TableCell>{a.description || '—'}</TableCell>
                    <TableCell className="text-right text-amber-600 font-medium">{fmt(Number(a.amount))}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={async () => { await delAdvance.mutateAsync(a.id); }}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card className="p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês ref.</TableHead>
                  <TableHead className="text-right">Salário</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead className="text-right">Vales</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Pago em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Nenhum pagamento</TableCell></TableRow>}
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{format(parseISO(p.reference_month), 'MMM/yyyy', { locale: ptBR })}</TableCell>
                    <TableCell className="text-right">{fmt(Number(p.salary_amount))}</TableCell>
                    <TableCell className="text-right text-emerald-600">{fmt(Number(p.commission_amount))}</TableCell>
                    <TableCell className="text-right text-amber-600">−{fmt(Number(p.advances_deducted))}</TableCell>
                    <TableCell className="text-right font-bold text-primary">{fmt(Number(p.total_amount))}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{format(parseISO(p.paid_at), 'dd/MM/yyyy')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <SalespersonFormDialog open={editOpen} onOpenChange={setEditOpen} salesperson={sp} />

      <ResponsiveModal
        open={advanceOpen}
        onOpenChange={setAdvanceOpen}
        title="Novo vale"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAdvanceOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddAdvance} disabled={createAdvance.isPending}>Registrar</Button>
          </div>
        }
      >
        <div className="space-y-3 py-2">
          <div><Label>Valor (R$) *</Label><Input type="number" step="0.01" value={advAmount} onChange={(e) => setAdvAmount(Number(e.target.value))} /></div>
          <div><Label>Descrição</Label><Textarea rows={2} value={advDesc} onChange={(e) => setAdvDesc(e.target.value)} /></div>
        </div>
      </ResponsiveModal>

      <ResponsiveModal
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        title="Confirmar pagamento do mês"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirmPayment} disabled={createPayment.isPending}>Confirmar</Button>
          </div>
        }
      >
        <div className="space-y-2 py-2 text-sm">
          <p className="text-muted-foreground">Mês de referência: <strong>{format(monthStart, 'MMMM/yyyy', { locale: ptBR })}</strong></p>
          <div className="rounded-lg border p-3 space-y-1">
            <div className="flex justify-between"><span>Salário</span><span>{fmt(salaryAmount)}</span></div>
            <div className="flex justify-between"><span>Comissão</span><span className="text-emerald-600">{fmt(totalCommissionMonth)}</span></div>
            <div className="flex justify-between"><span>Vales</span><span className="text-amber-600">−{fmt(totalAdvancesMonth)}</span></div>
            <div className="border-t pt-1 flex justify-between font-bold text-primary"><span>Total</span><span>{fmt(totalToPay)}</span></div>
          </div>
        </div>
      </ResponsiveModal>
    </div>
  );
}

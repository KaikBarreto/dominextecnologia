import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaginated } from '@/utils/supabasePagination';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Trash2, Plus, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { CompanyPaymentFormDialog } from './CompanyPaymentFormDialog';

interface Props {
  companyId: string;
  companyName: string;
}

export interface CompanyPayment {
  id: string;
  company_id: string;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  type: string;
  origin: string | null;
  notes: string | null;
  created_at: string;
}

const TYPE_LABELS: Record<string, { label: string; cls: string }> = {
  subscription: { label: 'Mensalidade', cls: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' },
  setup: { label: 'Setup', cls: 'bg-blue-500/15 text-blue-700 border-blue-500/30' },
  upgrade: { label: 'Upgrade', cls: 'bg-violet-500/15 text-violet-700 border-violet-500/30' },
  refund: { label: 'Reembolso', cls: 'bg-rose-500/15 text-rose-700 border-rose-500/30' },
  other: { label: 'Outro', cls: 'bg-muted text-muted-foreground border-border' },
};

export function CompanyPaymentHistory({ companyId, companyName }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['company-payments', companyId],
    queryFn: async () => {
      const data = await fetchAllPaginated<CompanyPayment>(() =>
        supabase.from('company_payments').select('*').eq('company_id', companyId).order('payment_date', { ascending: false })
      );
      return data;
    },
    enabled: !!companyId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      setDeletingId(id);
      const { error } = await supabase.from('company_payments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Pagamento removido' });
      qc.invalidateQueries({ queryKey: ['company-payments', companyId] });
      setDeletingId(null);
    },
    onError: (e: any) => {
      toast({ variant: 'destructive', title: e?.message || 'Erro ao remover' });
      setDeletingId(null);
    },
  });

  const total = payments.reduce((acc, p) => acc + Number(p.amount || 0), 0);
  const formatBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Histórico de Pagamentos</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {payments.length} pagamento{payments.length !== 1 ? 's' : ''} · Total: <strong className="text-foreground">{formatBRL(total)}</strong>
            </p>
          </div>
          <Button size="sm" className="gap-2" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Novo Pagamento
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : payments.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              Nenhum pagamento registrado ainda.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Observações</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => {
                    const t = TYPE_LABELS[p.type] || TYPE_LABELS.other;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(parseISO(p.payment_date), "dd/MM/yyyy", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={t.cls}>{t.label}</Badge>
                        </TableCell>
                        <TableCell className={p.type === 'refund' ? 'text-destructive font-medium' : 'font-medium text-emerald-600'}>
                          {p.type === 'refund' ? '-' : ''}{formatBRL(Number(p.amount || 0))}
                        </TableCell>
                        <TableCell className="capitalize">{p.payment_method || '—'}</TableCell>
                        <TableCell>{p.origin || '—'}</TableCell>
                        <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground" title={p.notes || ''}>
                          {p.notes || '—'}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 text-destructive hover:bg-destructive hover:text-white"
                            onClick={() => {
                              if (confirm(`Remover pagamento de ${formatBRL(Number(p.amount || 0))}?`)) {
                                deleteMutation.mutate(p.id);
                              }
                            }}
                            disabled={deletingId === p.id}
                          >
                            {deletingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CompanyPaymentFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        companyId={companyId}
        companyName={companyName}
      />
    </>
  );
}

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  companyName: string;
}

export function CompanyPaymentFormDialog({ open, onOpenChange, companyId, companyName }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [type, setType] = useState('subscription');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [origin, setOrigin] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      setAmount(''); setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
      setType('subscription'); setPaymentMethod('pix');
      setOrigin(''); setNotes('');
    }
  }, [open]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(amount.replace(',', '.'));
      if (!Number.isFinite(amt) || amt <= 0) throw new Error('Valor inválido');
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase.from('company_payments').insert({
        company_id: companyId,
        amount: amt,
        payment_date: paymentDate,
        type,
        payment_method: paymentMethod || null,
        origin: origin || null,
        notes: notes || null,
        created_by: user?.id || null,
      });
      if (error) throw error;

      // Increment custom_price_payments_made se houver promo ativa de mensalidade
      if (type === 'subscription') {
        const { data: company } = await supabase
          .from('companies')
          .select('custom_price, custom_price_months, custom_price_payments_made, custom_price_permanent')
          .eq('id', companyId).maybeSingle();
        if (company?.custom_price && !company.custom_price_permanent && company.custom_price_months) {
          const next = (company.custom_price_payments_made || 0) + 1;
          if (next <= company.custom_price_months) {
            await supabase.from('companies')
              .update({ custom_price_payments_made: next })
              .eq('id', companyId);
          }
        }
      }
    },
    onSuccess: () => {
      toast({ title: 'Pagamento registrado' });
      qc.invalidateQueries({ queryKey: ['company-payments', companyId] });
      qc.invalidateQueries({ queryKey: ['admin-company', companyId] });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ variant: 'destructive', title: e?.message || 'Erro ao registrar' }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Pagamento</DialogTitle>
          <DialogDescription>{companyName}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor (R$) *</Label>
              <Input type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} required />
            </div>
            <div>
              <Label>Data *</Label>
              <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="subscription">Mensalidade</SelectItem>
                  <SelectItem value="setup">Setup</SelectItem>
                  <SelectItem value="upgrade">Upgrade</SelectItem>
                  <SelectItem value="refund">Reembolso</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Método</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="card">Cartão</SelectItem>
                  <SelectItem value="transfer">Transferência</SelectItem>
                  <SelectItem value="cash">Dinheiro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Origem (opcional)</Label>
            <Input value={origin} onChange={e => setOrigin(e.target.value)} placeholder="Ex: Asaas, Stripe..." />
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="resize-none" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Registrar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

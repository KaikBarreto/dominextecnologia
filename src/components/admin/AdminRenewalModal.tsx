import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { addMonths, max as maxDate, parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CalendarIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAdminCompanyPayments, mapPaymentRpcError } from '@/hooks/useAdminCompanyPayments';

const schema = z.object({
  payment_value: z.string().min(1, 'Valor obrigatório'),
  observations: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface AdminRenewalModalProps {
  company: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AdminRenewalModal({ company, open, onOpenChange, onSuccess }: AdminRenewalModalProps) {
  const { toast } = useToast();
  const { registerPayment } = useAdminCompanyPayments(company?.id);

  // Preview da nova data (cálculo real é server-side, na RPC):
  // GREATEST(vencimento atual, hoje) + 1 mês (mensal) ou +12 meses (anual).
  const cycleMonths = company?.billing_cycle === 'yearly' ? 12 : 1;
  const currentExpiry = company?.subscription_expires_at ? parseISO(company.subscription_expires_at) : new Date();
  const newExpiry = addMonths(maxDate([currentExpiry, new Date()]), cycleMonths);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      payment_value: (company?.subscription_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      observations: '',
    },
  });

  const isSubmitting = registerPayment.isPending;

  const onSubmit = (data: FormData) => {
    const paymentValue = parseFloat(data.payment_value.replace(/\./g, '').replace(',', '.'));
    if (isNaN(paymentValue) || paymentValue <= 0) {
      form.setError('payment_value', { message: 'Informe um valor maior que zero' });
      return;
    }
    registerPayment.mutate(
      {
        amount: paymentValue,
        paymentDate: format(new Date(), 'yyyy-MM-dd'),
        type: 'renovacao',
        paymentMethod: 'Pix',
        notes: data.observations || undefined,
      },
      {
        onSuccess: () => {
          toast({ title: 'Assinatura renovada!' });
          form.reset();
          onSuccess();
        },
        onError: (error) => {
          toast({ title: 'Erro ao renovar', description: mapPaymentRpcError(error), variant: 'destructive' });
        },
      },
    );
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Renovar Assinatura"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting} className="flex-1">Cancelar</Button>
          <Button onClick={form.handleSubmit(onSubmit)} disabled={isSubmitting} className="flex-1">{isSubmitting ? 'Renovando...' : 'Confirmar'}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-muted p-3 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Empresa:</span><span className="font-semibold">{company?.name}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Valor Mensal:</span><span className="font-semibold">{(company?.subscription_value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Vencimento Atual:</span><span className="font-semibold">{company?.subscription_expires_at ? format(parseISO(company.subscription_expires_at), 'dd/MM/yyyy', { locale: ptBR }) : 'N/A'}</span></div>
        </div>

        {/* Nova data é calculada automaticamente pelo ciclo (mensal +1 mês, anual +12 meses) */}
        <div className="rounded-lg border p-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarIcon className="h-4 w-4" /> Novo Vencimento
          </div>
          <span className="font-semibold text-sm">{format(newExpiry, 'dd/MM/yyyy', { locale: ptBR })}</span>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="payment_value" render={({ field }) => (
              <FormItem><FormLabel>Valor do Pagamento *</FormLabel><FormControl><Input inputMode="decimal" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="observations" render={({ field }) => (
              <FormItem><FormLabel>Observações</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
            )} />
          </form>
        </Form>
      </div>
    </ResponsiveModal>
  );
}

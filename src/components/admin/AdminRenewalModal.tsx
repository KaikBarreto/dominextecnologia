import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { addMonths, parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const schema = z.object({
  subscription_expires_at: z.date({ required_error: 'Data obrigatória' }),
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
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getDefaultDate = () => {
    if (company?.subscription_expires_at) return addMonths(parseISO(company.subscription_expires_at), 1);
    return addMonths(new Date(), 1);
  };

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      subscription_expires_at: getDefaultDate(),
      payment_value: (company?.subscription_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      observations: '',
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      setIsSubmitting(true);
      const paymentValue = parseFloat(data.payment_value.replace(/\./g, '').replace(',', '.'));
      if (isNaN(paymentValue) || paymentValue <= 0) throw new Error('Valor inválido');

      const { error: companyError } = await supabase
        .from('companies')
        .update({ subscription_expires_at: data.subscription_expires_at.toISOString(), subscription_status: 'active' })
        .eq('id', company.id);
      if (companyError) throw companyError;

      const { error: paymentError } = await supabase.from('company_payments').insert({
        company_id: company.id,
        amount: paymentValue,
        payment_date: new Date().toISOString(),
        payment_method: 'Pix',
        notes: data.observations || null,
        type: 'renewal',
      });
      if (paymentError) throw paymentError;

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('admin_financial_transactions').insert({
        type: 'income',
        category: 'renewal',
        amount: paymentValue,
        description: `Renovação - ${company.name}`,
        transaction_date: new Date().toISOString(),
        created_by: user?.id,
        reference_type: 'company_renewal',
        reference_id: company.id,
      });
    },
    onSuccess: () => {
      toast({ title: 'Assinatura renovada!' });
      queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
      queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
      queryClient.invalidateQueries({ queryKey: ['admin-financial-transactions'] });
      form.reset();
      setIsSubmitting(false);
      onSuccess();
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao renovar', description: error.message, variant: 'destructive' });
      setIsSubmitting(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renovar Assinatura</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg bg-muted p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Empresa:</span>
              <span className="font-semibold">{company?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor Mensal:</span>
              <span className="font-semibold">
                {(company?.subscription_value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vencimento Atual:</span>
              <span className="font-semibold">
                {company?.subscription_expires_at
                  ? format(parseISO(company.subscription_expires_at), 'dd/MM/yyyy', { locale: ptBR })
                  : 'N/A'}
              </span>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
              <FormField
                control={form.control}
                name="subscription_expires_at"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Nova Data de Vencimento *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className={cn('w-full pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}>
                            {field.value ? format(field.value, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecionar data'}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField control={form.control} name="payment_value" render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor do Pagamento *</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="observations" render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl><Textarea {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting} className="flex-1">Cancelar</Button>
                <Button type="submit" disabled={isSubmitting} className="flex-1">{isSubmitting ? 'Renovando...' : 'Confirmar'}</Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

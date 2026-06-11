import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { cpfCnpjMask } from '@/utils/masks';
import { useAdminCompanyPayments, mapPaymentRpcError } from '@/hooks/useAdminCompanyPayments';

const PAYMENT_METHODS = ['Pix', 'Boleto', 'Cartão', 'Dinheiro', 'Transferência'];

const NONE_VALUE = '__none__';

interface RegisterCompanyPaymentModalProps {
  company: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function parsePtBrAmount(value: string): number {
  return parseFloat(value.replace(/\./g, '').replace(',', '.'));
}

export function RegisterCompanyPaymentModal({ company, open, onOpenChange }: RegisterCompanyPaymentModalProps) {
  const { toast } = useToast();
  const { registerPayment } = useAdminCompanyPayments(company?.id);

  // Empresa em teste sem documento → CPF/CNPJ obrigatório na venda (vai pro cadastro).
  const requiresDocument = company?.subscription_status === 'testing' && !company?.cnpj;

  const schema = useMemo(
    () =>
      z
        .object({
          type: z.enum(['venda', 'renovacao']),
          payment_date: z.date({ required_error: 'Data obrigatória' }),
          payment_value: z.string().min(1, 'Valor obrigatório'),
          payment_method: z.string().min(1, 'Método obrigatório'),
          observations: z.string().optional(),
          cpf_cnpj: z.string().optional(),
          closer_id: z.string().optional(),
          sdr_id: z.string().optional(),
        })
        .superRefine((data, ctx) => {
          const amount = parsePtBrAmount(data.payment_value);
          if (isNaN(amount) || amount <= 0) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['payment_value'], message: 'Informe um valor maior que zero' });
          }
          if (data.type === 'venda') {
            const digits = (data.cpf_cnpj || '').replace(/\D/g, '');
            if (requiresDocument && digits.length === 0) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cpf_cnpj'], message: 'CPF/CNPJ obrigatório para ativar esta empresa' });
            } else if (digits.length > 0 && digits.length !== 11 && digits.length !== 14) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cpf_cnpj'], message: 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido' });
            }
          }
        }),
    [requiresDocument],
  );

  type FormData = z.infer<typeof schema>;

  const defaultValues = useMemo<FormData>(
    () => ({
      type: 'venda' as const,
      payment_date: new Date(),
      payment_value: (company?.subscription_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      payment_method: 'Pix',
      observations: '',
      cpf_cnpj: '',
      closer_id: NONE_VALUE,
      sdr_id: NONE_VALUE,
    }),
    [company?.subscription_value],
  );

  const form = useForm<FormData>({ resolver: zodResolver(schema), defaultValues });

  useEffect(() => {
    if (open) form.reset(defaultValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedType = form.watch('type');

  // Closer = todos os vendedores ativos; SDR = só role 'sdr' (mesma regra do CompanyFormModal).
  const { data: salespeople = [] } = useQuery({
    queryKey: ['salespeople-basic-form'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('salespeople_basic')
        .select('id, name, email, role')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });
  const sdrs = salespeople.filter((s: any) => s.role === 'sdr');

  const onSubmit = (data: FormData) => {
    registerPayment.mutate(
      {
        amount: parsePtBrAmount(data.payment_value),
        paymentDate: format(data.payment_date, 'yyyy-MM-dd'),
        type: data.type,
        paymentMethod: data.payment_method,
        notes: data.observations || undefined,
        cpfCnpj: data.type === 'venda' ? (data.cpf_cnpj || '').replace(/\D/g, '') || undefined : undefined,
        closerId: data.type === 'venda' && data.closer_id !== NONE_VALUE ? data.closer_id : undefined,
        sdrId: data.type === 'venda' && data.sdr_id !== NONE_VALUE ? data.sdr_id : undefined,
      },
      {
        onSuccess: () => {
          toast({
            title: data.type === 'venda' ? 'Venda registrada!' : 'Renovação registrada!',
            description: 'Empresa ativada e vencimento estendido.',
          });
          onOpenChange(false);
        },
        onError: (error) => {
          toast({ variant: 'destructive', title: 'Erro ao registrar pagamento', description: mapPaymentRpcError(error) });
        },
      },
    );
  };

  const isSubmitting = registerPayment.isPending;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(o) => { if (!isSubmitting) onOpenChange(o); }}
      title="Registrar Pagamento"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={form.handleSubmit(onSubmit)} disabled={isSubmitting} className="flex-1">
            {isSubmitting ? 'Registrando...' : 'Registrar'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-muted p-3 space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Empresa:</span>
            <span className="font-semibold truncate">{company?.name}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Valor do plano:</span>
            <span className="font-semibold">
              {(company?.subscription_value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              {company?.billing_cycle === 'yearly' ? ' /ano' : ' /mês'}
            </span>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Tipo: Venda | Renovação */}
            <FormField control={form.control} name="type" render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo *</FormLabel>
                <FormControl>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={field.value === 'venda' ? 'default' : 'outline'}
                      onClick={() => field.onChange('venda')}
                    >
                      Venda
                    </Button>
                    <Button
                      type="button"
                      variant={field.value === 'renovacao' ? 'default' : 'outline'}
                      onClick={() => field.onChange('renovacao')}
                    >
                      Renovação
                    </Button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="payment_date" render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Data do Pagamento *</FormLabel>
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
              )} />

              <FormField control={form.control} name="payment_value" render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor (R$) *</FormLabel>
                  <FormControl><Input inputMode="decimal" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="payment_method" render={({ field }) => (
              <FormItem>
                <FormLabel>Método de Pagamento *</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            {selectedType === 'venda' && (
              <div className="space-y-4 rounded-lg border p-3">
                {(requiresDocument || !company?.cnpj) && (
                  <FormField control={form.control} name="cpf_cnpj" render={({ field }) => (
                    <FormItem>
                      <FormLabel>CPF/CNPJ {requiresDocument ? '*' : ''}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="000.000.000-00 ou 00.000.000/0000-00"
                          value={field.value || ''}
                          onChange={(e) => field.onChange(cpfCnpjMask(e.target.value))}
                        />
                      </FormControl>
                      {requiresDocument && (
                        <p className="text-xs text-muted-foreground">Esta empresa ainda não tem documento cadastrado.</p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )} />
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="closer_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Closer (quem fechou)</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>Nenhum</SelectItem>
                          {salespeople.map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="sdr_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel>SDR (quem agendou)</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>Nenhum</SelectItem>
                          {sdrs.map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <p className="text-xs text-muted-foreground">
                  Comissão é creditada apenas na 1ª venda da empresa: 50% para o closer, ou 25%/25% quando há SDR.
                </p>
              </div>
            )}

            <FormField control={form.control} name="observations" render={({ field }) => (
              <FormItem>
                <FormLabel>Observações</FormLabel>
                <FormControl><Textarea rows={2} placeholder="Opcional" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="flex items-start gap-2 rounded-lg bg-warning/10 p-2.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-warning" />
              <span>Use apenas para pagamento recebido fora do Asaas. Cobranças do Asaas entram aqui automaticamente.</span>
            </div>
          </form>
        </Form>
      </div>
    </ResponsiveModal>
  );
}

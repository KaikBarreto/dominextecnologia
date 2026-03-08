import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { phoneMask, cpfCnpjMask } from '@/utils/masks';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company?: any;
  onSuccess: () => void;
}

interface FormData {
  name: string;
  cnpj: string;
  email: string;
  phone: string;
  address: string;
  contact_name: string;
  subscription_status: string;
  subscription_plan: string;
  subscription_value: string;
  subscription_expires_at: string;
  billing_cycle: string;
  max_users: string;
  notes: string;
}

export default function CompanyFormModal({ open, onOpenChange, company, onSuccess }: Props) {
  const { toast } = useToast();
  const isEditing = !!company;

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      name: '', cnpj: '', email: '', phone: '', address: '', contact_name: '',
      subscription_status: 'testing', subscription_plan: 'starter', subscription_value: '0',
      subscription_expires_at: '', billing_cycle: 'monthly',
      max_users: '5', notes: '',
    },
  });

  useEffect(() => {
    if (company) {
      reset({
        name: company.name || '',
        cnpj: company.cnpj || '',
        email: company.email || '',
        phone: company.phone || '',
        address: company.address || '',
        contact_name: company.contact_name || '',
        subscription_status: company.subscription_status || 'testing',
        subscription_plan: company.subscription_plan || 'starter',
        subscription_value: String(company.subscription_value || 0),
        subscription_expires_at: company.subscription_expires_at ? company.subscription_expires_at.split('T')[0] : '',
        billing_cycle: company.billing_cycle || 'monthly',
        max_users: String(company.max_users || 5),
        notes: company.notes || '',
      });
    } else {
      reset({
        name: '', cnpj: '', email: '', phone: '', address: '', contact_name: '',
        subscription_status: 'testing', subscription_plan: 'starter', subscription_value: '0',
        subscription_expires_at: '', billing_cycle: 'monthly',
        max_users: '5', notes: '',
      });
    }
  }, [company, reset]);

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        name: data.name,
        cnpj: data.cnpj || null,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        contact_name: data.contact_name || null,
        subscription_status: data.subscription_status,
        subscription_plan: data.subscription_plan,
        subscription_value: parseFloat(data.subscription_value) || 0,
        subscription_expires_at: data.subscription_expires_at || null,
        billing_cycle: data.billing_cycle,
        max_users: parseInt(data.max_users) || 5,
        notes: data.notes || null,
      };

      if (isEditing) {
        const { error } = await supabase.from('companies').update(payload).eq('id', company.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('companies').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: isEditing ? 'Empresa atualizada' : 'Empresa criada' });
      onSuccess();
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Erro', description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Empresa' : 'Nova Empresa'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div>
            <Label>Nome*</Label>
            <Input {...register('name', { required: 'Obrigatório' })} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>CNPJ</Label>
              <Input {...register('cnpj', { onChange: (e) => { e.target.value = cpfCnpjMask(e.target.value); } })} maxLength={18} />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input {...register('phone', { onChange: (e) => { e.target.value = phoneMask(e.target.value); } })} maxLength={15} />
            </div>
          </div>

          <div>
            <Label>Email</Label>
            <Input type="email" {...register('email')} />
          </div>

          <div>
            <Label>Responsável</Label>
            <Input {...register('contact_name')} />
          </div>

          <div>
            <Label>Endereço</Label>
            <Input {...register('address')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Status</Label>
              <Select value={watch('subscription_status')} onValueChange={(v) => setValue('subscription_status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="testing">Em Teste</SelectItem>
                  <SelectItem value="active">Ativa</SelectItem>
                  <SelectItem value="inactive">Inativa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Plano</Label>
              <Select value={watch('subscription_plan')} onValueChange={(v) => setValue('subscription_plan', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" {...register('subscription_value')} />
            </div>
            <div>
              <Label>Máx Usuários</Label>
              <Input type="number" {...register('max_users')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Vencimento</Label>
              <Input type="date" {...register('subscription_expires_at')} />
            </div>
            <div>
              <Label>Ciclo</Label>
              <Select value={watch('billing_cycle')} onValueChange={(v) => setValue('billing_cycle', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="yearly">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea {...register('notes')} rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {isEditing ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, ChevronRight, ChevronLeft, Check, Upload, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CepLookup } from '@/components/CepLookup';
import type { Customer, CustomerType } from '@/types/database';

const customerSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  customer_type: z.enum(['pf', 'pj']),
  company_name: z.string().optional(),
  document: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
  birth_date: z.string().optional(),
  address: z.string().optional(),
  complement: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip_code: z.string().optional(),
  notes: z.string().optional(),
});

type CustomerFormData = z.infer<typeof customerSchema>;

interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer | null;
  onSubmit: (data: CustomerFormData) => Promise<void>;
  isLoading?: boolean;
}

const STEPS = [
  { key: 'dados', label: 'Dados pessoais' },
  { key: 'endereco', label: 'Endereço e observações' },
];

export function CustomerFormDialog({
  open, onOpenChange, customer, onSubmit, isLoading,
}: CustomerFormDialogProps) {
  const [step, setStep] = useState(0);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const { toast } = useToast();

  const form = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: '', customer_type: 'pj', company_name: '', document: '',
      email: '', phone: '', birth_date: '', address: '', complement: '',
      city: '', state: '', zip_code: '', notes: '',
    },
  });

  useEffect(() => {
    if (open) {
      setStep(0);
      setPhotoFile(null);
      setPhotoPreview((customer as any)?.photo_url || null);
      form.reset({
        name: customer?.name ?? '',
        customer_type: (customer?.customer_type as CustomerType) ?? 'pj',
        company_name: (customer as any)?.company_name ?? '',
        document: customer?.document ?? '',
        email: customer?.email ?? '',
        phone: customer?.phone ?? '',
        birth_date: (customer as any)?.birth_date ?? '',
        address: customer?.address ?? '',
        complement: (customer as any)?.complement ?? '',
        city: customer?.city ?? '',
        state: customer?.state ?? '',
        zip_code: customer?.zip_code ?? '',
        notes: customer?.notes ?? '',
      });
    }
  }, [open, customer]);

  const uploadPhoto = async (): Promise<string | undefined> => {
    if (!photoFile) return undefined;
    const ext = photoFile.name.split('.').pop();
    const path = `${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('customer-photos').upload(path, photoFile);
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('customer-photos').getPublicUrl(path);
    return publicUrl;
  };

  const handleSubmit = async (data: CustomerFormData) => {
    setUploadingPhoto(true);
    try {
      let photo_url: string | undefined;
      if (photoFile) {
        photo_url = await uploadPhoto();
      }
      const cleanedData = { ...data, birth_date: data.birth_date || undefined, ...(photo_url ? { photo_url } : {}) };
      await onSubmit(cleanedData);
      form.reset();
      setStep(0);
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const canGoNext = () => {
    const name = form.watch('name');
    return name && name.length >= 2;
  };

  const isLastStep = step === STEPS.length - 1;

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={customer ? 'Editar Cliente' : 'Novo Cliente'}>
      {/* Step indicators */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className={cn(
              'flex items-center justify-center h-8 w-8 rounded-full text-sm font-medium transition-colors',
              i < step ? 'bg-primary text-white' :
              i === step ? 'bg-primary text-white' :
              'bg-muted text-muted-foreground'
            )}>
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn('text-sm hidden sm:inline', i === step ? 'font-medium' : 'text-muted-foreground')}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Photo upload */}
              <div className="sm:col-span-2 flex items-center gap-4">
                {photoPreview ? (
                  <img src={photoPreview} alt="" className="h-16 w-16 rounded-full object-cover border" />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center border">
                    <Users className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setPhotoFile(file);
                        setPhotoPreview(URL.createObjectURL(file));
                      }
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" asChild>
                    <span><Upload className="h-3 w-3 mr-1" /> Foto</span>
                  </Button>
                </label>
              </div>
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Nome *</FormLabel>
                  <FormControl><Input placeholder="Nome do cliente" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="customer_type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="pj">Pessoa Jurídica</SelectItem>
                      <SelectItem value="pf">Pessoa Física</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="company_name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Empresa</FormLabel>
                  <FormControl><Input placeholder="Nome da empresa" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="document" render={({ field }) => (
                <FormItem>
                  <FormLabel>CPF/CNPJ</FormLabel>
                  <FormControl><Input placeholder="Documento" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="birth_date" render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de Nascimento</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" placeholder="email@exemplo.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone</FormLabel>
                  <FormControl><Input placeholder="(00) 00000-0000" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="zip_code" render={({ field }) => (
                <FormItem>
                  <FormLabel>CEP</FormLabel>
                  <FormControl>
                    <CepLookup
                      value={field.value || ''}
                      onChange={field.onChange}
                      onAddressFound={(addr) => {
                        if (addr.logradouro) form.setValue('address', addr.logradouro);
                        if (addr.cidade) form.setValue('city', addr.cidade);
                        if (addr.estado) form.setValue('state', addr.estado);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Endereço</FormLabel>
                  <FormControl><Input placeholder="Rua, número" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="complement" render={({ field }) => (
                <FormItem>
                  <FormLabel>Complemento</FormLabel>
                  <FormControl><Input placeholder="Apto, sala, bloco..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="city" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cidade</FormLabel>
                  <FormControl><Input placeholder="Cidade" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="state" render={({ field }) => (
                <FormItem>
                  <FormLabel>UF</FormLabel>
                  <FormControl><Input placeholder="UF" maxLength={2} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Observações</FormLabel>
                  <FormControl><Textarea placeholder="Observações sobre o cliente" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-4 border-t">
            <div>
              {step > 0 && (
                <Button type="button" variant="outline" onClick={() => setStep(0)}>
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              {isLastStep ? (
                <Button type="submit" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {customer ? 'Salvar' : 'Criar'}
                </Button>
              ) : (
                <Button type="button" onClick={(e) => { e.preventDefault(); if (canGoNext()) setStep(1); }} disabled={!canGoNext()}>
                  Próximo
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </form>
      </Form>
    </ResponsiveModal>
  );
}

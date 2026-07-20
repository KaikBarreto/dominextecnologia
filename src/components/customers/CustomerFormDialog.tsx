import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Upload, Users, User, FileText } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { processImageFile } from '@/utils/imageConvert';
import { useToast } from '@/hooks/use-toast';
import { CepLookup } from '@/components/CepLookup';
import { StateCitySelector } from '@/components/StateCitySelector';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { phoneMask } from '@/utils/masks';
import { CnpjDocumentInput } from '@/components/customers/CnpjDocumentInput';
import { useCustomerOrigins } from '@/hooks/useCustomerOrigins';
import { getErrorMessage } from '@/utils/errorMessages';
import { geocodeAddress, buildCustomerAddress } from '@/utils/geolocation';
import { useFormDraft } from '@/hooks/useFormDraft';
import { DraftResumeDialog } from '@/components/ui/DraftResumeDialog';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
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
  address_number: z.string().optional(),
  complement: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip_code: z.string().optional(),
  notes: z.string().optional(),
  origin: z.string().optional(),
  // Dados fiscais (tomador NFS-e) — todos opcionais
  inscricao_municipal: z.string().optional(),
  ibge_municipality_code: z.string().optional(),
});

type CustomerFormData = z.infer<typeof customerSchema>;

const EMPTY_FORM: CustomerFormData = {
  name: '', customer_type: 'pj', company_name: '', document: '',
  email: '', phone: '', birth_date: '', address: '', address_number: '',
  complement: '', neighborhood: '', city: '', state: '', zip_code: '',
  notes: '', origin: '', inscricao_municipal: '', ibge_municipality_code: '',
};

interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer | null;
  onSubmit: (data: CustomerFormData & { street_number?: string; latitude?: number; longitude?: number }) => Promise<void>;
  isLoading?: boolean;
}

export function CustomerFormDialog({
  open, onOpenChange, customer, onSubmit, isLoading,
}: CustomerFormDialogProps) {
  const [activeTab, setActiveTab] = useState<'contato' | 'fiscal'>('contato');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // Coordenadas capturadas ao escolher uma sugestão do autocomplete de endereço.
  // Se ficar null no save, tentamos geocodificar o endereço digitado (best-effort).
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const { toast } = useToast();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.customers.form;
  const { activeOrigins } = useCustomerOrigins();

  const isEditing = !!customer;
  const draft = useFormDraft<CustomerFormData>({ key: 'customer-form', isOpen: open, isEditing });

  const form = useForm<CustomerFormData>({
    // errorMap traduz as mensagens de validação do schema (definido em pt-br como
    // "chave" estável) para o locale ativo, sem duplicar o schema.
    resolver: zodResolver(customerSchema, {
      errorMap: (issue, ctx) => {
        if (ctx.defaultError === 'Nome deve ter no mínimo 2 caracteres') return { message: t.nameMin };
        if (ctx.defaultError === 'Email inválido') return { message: t.emailInvalid };
        return { message: ctx.defaultError };
      },
    }),
    defaultValues: EMPTY_FORM,
  });

  // Save draft on form changes
  const watchedValues = form.watch();
  useEffect(() => {
    if (open && !isEditing && !draft.showResumePrompt) {
      draft.saveDraft(watchedValues);
    }
  }, [watchedValues, open, isEditing, draft.showResumePrompt]);

  useEffect(() => {
    if (open) {
      setActiveTab('contato');
      setPhotoFile(null);
      setPhotoPreview((customer as any)?.photo_url || null);
      // Pré-carrega coords já salvas no cliente (edição); novo cliente começa sem coords.
      const lat = (customer as any)?.latitude;
      const lng = (customer as any)?.longitude;
      setPickedCoords(
        typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null,
      );
      if (!isEditing && draft.hasDraft && draft.draftData) {
        // Draft will be applied when user accepts via DraftResumeDialog
      } else {
        form.reset({
          name: customer?.name ?? '',
          customer_type: (customer?.customer_type as CustomerType) ?? 'pj',
          company_name: (customer as any)?.company_name ?? '',
          document: customer?.document ?? '',
          email: customer?.email ?? '',
          phone: customer?.phone ?? '',
          birth_date: (customer as any)?.birth_date ?? '',
          address: customer?.address ?? '',
          address_number: (customer as any)?.address_number ?? (customer as any)?.street_number ?? '',
          complement: (customer as any)?.complement ?? '',
          neighborhood: (customer as any)?.neighborhood ?? '',
          city: customer?.city ?? '',
          state: customer?.state ?? '',
          zip_code: customer?.zip_code ?? '',
          notes: customer?.notes ?? '',
          origin: (customer as any)?.origin ?? '',
          inscricao_municipal: (customer as any)?.inscricao_municipal ?? '',
          ibge_municipality_code: (customer as any)?.ibge_municipality_code ?? '',
        });
      }
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

      // Coordenadas do cliente: usa o que foi escolhido no autocomplete; senão,
      // tenta geocodificar o endereço digitado (best-effort, nunca trava o cadastro).
      let coords = pickedCoords;
      if (!coords) {
        const addressStr = buildCustomerAddress({
          address: data.address,
          city: data.city,
          state: data.state,
          zip_code: data.zip_code,
        });
        if (addressStr) {
          coords = await geocodeAddress(addressStr); // retorna null em falha/timeout
        }
      }

      const cleanedData = {
        ...data,
        birth_date: data.birth_date || undefined,
        // Espelha o número do endereço na coluna fiscal usada pela emissão de NFS-e.
        street_number: data.address_number || undefined,
        ...(coords ? { latitude: coords.lat, longitude: coords.lng } : {}),
        ...(photo_url ? { photo_url } : {}),
      };
      await onSubmit(cleanedData);
      draft.clearDraft();
      form.reset();
      setActiveTab('contato');
      onOpenChange(false);
    } catch (error) {
      toast({ variant: 'destructive', title: t.errorTitle, description: getErrorMessage(error) });
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Erro de validação cai sempre num campo da aba Contato (nome) — garante que
  // o usuário veja a mensagem mesmo se estiver na aba Fiscal ao salvar.
  const onInvalid = () => setActiveTab('contato');

  const footer = (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
        {t.cancel}
      </Button>
      <Button type="submit" form="customer-form" disabled={isLoading || uploadingPhoto}>
        {(isLoading || uploadingPhoto) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {customer ? t.save : t.create}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={customer ? t.titleEdit : t.titleNew} footer={footer}>
      <DraftResumeDialog
        open={draft.showResumePrompt}
        onResume={() => {
          if (draft.draftData) form.reset(draft.draftData);
          draft.acceptDraft();
        }}
        onDiscard={() => {
          draft.discardDraft();
          form.reset(EMPTY_FORM);
        }}
      />

      <Form {...form}>
        <form id="customer-form" onSubmit={form.handleSubmit(handleSubmit, onInvalid)} className="space-y-4">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'contato' | 'fiscal')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="contato" className="flex items-center gap-2 text-xs sm:text-sm">
                <User className="h-4 w-4" />
                {t.tabContact}
              </TabsTrigger>
              <TabsTrigger value="fiscal" className="flex items-center gap-2 text-xs sm:text-sm">
                <FileText className="h-4 w-4" />
                {t.tabFiscal}
              </TabsTrigger>
            </TabsList>

            {/* ===== Aba Contato — dados do dia a dia ===== */}
            <TabsContent value="contato" className="mt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Photo upload — coluna centralizada, círculo grande acima do botão */}
                <div className="sm:col-span-2 flex flex-col items-center gap-3">
                  {photoPreview ? (
                    <img src={photoPreview} alt="" className="h-28 w-28 rounded-full object-cover border" />
                  ) : (
                    <div className="h-28 w-28 rounded-full bg-muted flex items-center justify-center border">
                      <Users className="h-10 w-10 text-muted-foreground" />
                    </div>
                  )}
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const processed = await processImageFile(file);
                          setPhotoFile(processed);
                          setPhotoPreview(URL.createObjectURL(processed));
                        }
                      }}
                    />
                    <Button type="button" variant="outline" size="sm" asChild>
                      <span><Upload className="h-3 w-3 mr-1" /> {t.photo}</span>
                    </Button>
                  </label>
                </div>
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>{t.name}</FormLabel>
                    <FormControl><Input placeholder={t.namePlaceholder} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="customer_type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.type}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="pj">{t.typePj}</SelectItem>
                        <SelectItem value="pf">{t.typePf}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="company_name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.company}</FormLabel>
                    <FormControl><Input placeholder={t.companyPlaceholder} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.phone}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="(00) 00000-0000"
                        value={field.value || ''}
                        onChange={(e) => field.onChange(phoneMask(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.email}</FormLabel>
                    <FormControl><Input type="email" placeholder={t.emailPlaceholder} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="birth_date" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.birthDate}</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="origin" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.origin}</FormLabel>
                    <Select onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)} value={field.value || '__none__'}>
                      <FormControl><SelectTrigger><SelectValue placeholder={t.originPlaceholder} /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">{t.originNone}</SelectItem>
                        {activeOrigins.map((o) => {
                          const LucideIcon = o.icon ? (LucideIcons as any)[o.icon] : null;
                          return (
                            <SelectItem key={o.id} value={o.name}>
                              <div className="flex items-center gap-2">
                                {LucideIcon && <div className="h-4 w-4 rounded flex items-center justify-center" style={{ backgroundColor: o.color }}><LucideIcon className="h-2.5 w-2.5 text-white" /></div>}
                                <span>{o.name}</span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>{t.notes}</FormLabel>
                    <FormControl><Textarea placeholder={t.notesPlaceholder} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </TabsContent>

            {/* ===== Aba Fiscal — dados do tomador para NFS-e ===== */}
            <TabsContent value="fiscal" className="mt-4">
              <p className="text-xs text-muted-foreground mb-4">
                {t.fiscalHint}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField control={form.control} name="document" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.document}</FormLabel>
                    <FormControl>
                      <CnpjDocumentInput
                        value={field.value || ''}
                        onChange={field.onChange}
                        placeholder="000.000.000-00"
                        onDataFound={(d) => {
                          // Sobrescreve campos fiscais/endereço com o oficial, mas só quando o dado veio preenchido
                          if (d.razaoSocial) form.setValue('company_name', d.razaoSocial);
                          if (d.email) form.setValue('email', d.email);
                          if (d.phone) form.setValue('phone', phoneMask(d.phone));
                          if (d.zipCode) {
                            const c = d.zipCode.replace(/\D/g, '');
                            form.setValue('zip_code', c.length > 5 ? `${c.slice(0, 5)}-${c.slice(5)}` : c);
                          }
                          if (d.address) form.setValue('address', d.address);
                          if (d.addressNumber) form.setValue('address_number', d.addressNumber);
                          if (d.complement) form.setValue('complement', d.complement);
                          if (d.neighborhood) form.setValue('neighborhood', d.neighborhood);
                          if (d.city) form.setValue('city', d.city);
                          if (d.state) form.setValue('state', d.state);
                          // Nome: só preenche se estiver vazio (não apaga o apelido que o usuário digitou)
                          const currentName = (form.getValues('name') || '').trim();
                          if (!currentName) form.setValue('name', d.nomeFantasia || d.razaoSocial || '');
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="inscricao_municipal" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.inscricaoMunicipal}</FormLabel>
                    <FormControl><Input placeholder={t.inscricaoMunicipalPlaceholder} {...field} value={field.value || ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>{t.fiscalEmail}</FormLabel>
                    <FormControl><Input type="email" placeholder={t.emailPlaceholder} {...field} value={field.value || ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="sm:col-span-2 pt-2 text-sm font-medium text-muted-foreground">
                  {t.fiscalAddress}
                </div>
                <FormField control={form.control} name="zip_code" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.zipCode}</FormLabel>
                    <FormControl>
                      <CepLookup
                        value={field.value || ''}
                        onChange={field.onChange}
                        onAddressFound={(addr) => {
                          if (addr.logradouro) form.setValue('address', addr.logradouro);
                          if (addr.bairro) form.setValue('neighborhood', addr.bairro);
                          if (addr.cidade) form.setValue('city', addr.cidade);
                          if (addr.estado) form.setValue('state', addr.estado);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="address" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.street}</FormLabel>
                    <FormControl>
                      <AddressAutocomplete
                        value={field.value || ''}
                        onChange={(v) => {
                          // Digitação manual invalida a coord da sugestão anterior;
                          // o save re-geocodifica o endereço final.
                          setPickedCoords(null);
                          field.onChange(v);
                        }}
                        onAddressSelected={(addr) => {
                          if (typeof addr.lat === 'number' && typeof addr.lng === 'number') {
                            setPickedCoords({ lat: addr.lat, lng: addr.lng });
                          }
                          if (addr.logradouro) form.setValue('address', addr.logradouro);
                          if (addr.numero) form.setValue('address_number', addr.numero);
                          if (addr.bairro) form.setValue('neighborhood', addr.bairro);
                          if (addr.cidade) form.setValue('city', addr.cidade);
                          if (addr.estado) form.setValue('state', addr.estado);
                          if (addr.cep) {
                            const c = addr.cep.replace(/\D/g, '');
                            form.setValue('zip_code', c.length > 5 ? `${c.slice(0,5)}-${c.slice(5)}` : c);
                          }
                        }}
                        placeholder={t.streetPlaceholder}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="address_number" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.number}</FormLabel>
                    <FormControl><Input placeholder={t.numberPlaceholder} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="complement" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.complement}</FormLabel>
                    <FormControl><Input placeholder={t.complementPlaceholder} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="neighborhood" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.neighborhood}</FormLabel>
                    <FormControl><Input placeholder={t.neighborhoodPlaceholder} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div>
                  <FormLabel>{t.stateCity}</FormLabel>
                  <StateCitySelector
                    selectedState={form.watch('state') || ''}
                    selectedCity={form.watch('city') || ''}
                    onStateChange={(v) => {
                      form.setValue('state', v);
                      form.setValue('city', '');
                      form.setValue('ibge_municipality_code', '');
                    }}
                    onCityChange={(v, ibgeCode) => {
                      form.setValue('city', v);
                      if (ibgeCode) form.setValue('ibge_municipality_code', ibgeCode);
                    }}
                  />
                </div>
                <FormField control={form.control} name="ibge_municipality_code" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.ibgeCode}</FormLabel>
                    <FormControl><Input placeholder={t.ibgeCodePlaceholder} {...field} value={field.value || ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </TabsContent>
          </Tabs>
        </form>
      </Form>
    </ResponsiveModal>
  );
}

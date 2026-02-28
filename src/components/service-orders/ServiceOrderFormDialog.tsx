import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
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
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronRight, ChevronLeft, Plus, Check } from 'lucide-react';
import { useCustomers } from '@/hooks/useCustomers';
import { useEquipment } from '@/hooks/useEquipment';
import { useTechnicians } from '@/hooks/useProfiles';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { EquipmentFormDialog } from '@/components/customers/EquipmentFormDialog';
import type { ServiceOrder } from '@/types/database';
import { cn } from '@/lib/utils';

const serviceOrderSchema = z.object({
  customer_id: z.string().min(1, 'Selecione um cliente'),
  equipment_id: z.string().optional(),
  technician_id: z.string().optional(),
  os_type: z.enum(['manutencao_preventiva', 'manutencao_corretiva', 'instalacao', 'visita_tecnica']),
  service_type_id: z.string().optional(),
  scheduled_date: z.string().optional(),
  scheduled_time: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  form_template_id: z.string().optional(),
});

type ServiceOrderFormData = z.infer<typeof serviceOrderSchema>;

interface ServiceOrderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceOrder?: ServiceOrder | null;
  onSubmit: (data: ServiceOrderFormData) => Promise<void>;
  isLoading?: boolean;
  defaultDate?: string;
  defaultTime?: string;
}

const STEPS = [
  { key: 'client', label: 'Cliente e Serviço' },
  { key: 'equipment', label: 'Equipamento' },
  { key: 'details', label: 'Detalhes' },
];

export function ServiceOrderFormDialog({
  open, onOpenChange, serviceOrder, onSubmit, isLoading, defaultDate, defaultTime,
}: ServiceOrderFormDialogProps) {
  const { customers } = useCustomers();
  const { data: technicians } = useTechnicians();
  const { templates } = useFormTemplates();
  const { serviceTypes } = useServiceTypes();
  const [step, setStep] = useState(0);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>(serviceOrder?.customer_id);
  const [selectedServiceTypeId, setSelectedServiceTypeId] = useState<string | undefined>(serviceOrder?.service_type_id ?? undefined);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const { equipment } = useEquipment(selectedCustomerId);

  const selectedServiceType = useMemo(
    () => serviceTypes.find(st => st.id === selectedServiceTypeId),
    [serviceTypes, selectedServiceTypeId]
  );

  const showEquipmentStep = useMemo(() => {
    if (!selectedServiceTypeId || selectedServiceTypeId === 'none') return true;
    return selectedServiceType?.requires_equipment ?? true;
  }, [selectedServiceTypeId, selectedServiceType]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      if (!t.is_active) return false;
      if (!selectedServiceTypeId) return true;

      const serviceTypeIds = (t as any).service_type_ids as string[] | undefined;
      const appliesToAll = (t as any).applies_to_all_services || !serviceTypeIds || serviceTypeIds.length === 0;
      if (appliesToAll) return true;

      return serviceTypeIds.includes(selectedServiceTypeId);
    });
  }, [templates, selectedServiceTypeId]);

  const computedDate = useMemo(() => {
    if (serviceOrder?.scheduled_date) return serviceOrder.scheduled_date;
    if (defaultDate) return defaultDate;
    return format(new Date(), 'yyyy-MM-dd');
  }, [serviceOrder?.scheduled_date, defaultDate]);

  const computedTime = useMemo(() => {
    if (serviceOrder?.scheduled_time) return serviceOrder.scheduled_time;
    if (defaultTime) return defaultTime;
    return format(new Date(), 'HH:mm');
  }, [serviceOrder?.scheduled_time, defaultTime]);

  const form = useForm<ServiceOrderFormData>({
    resolver: zodResolver(serviceOrderSchema),
    defaultValues: {
      customer_id: serviceOrder?.customer_id ?? '',
      equipment_id: serviceOrder?.equipment_id ?? '',
      technician_id: serviceOrder?.technician_id ?? '',
      os_type: (serviceOrder?.os_type as any) ?? 'manutencao_corretiva',
      service_type_id: serviceOrder?.service_type_id ?? '',
      scheduled_date: computedDate,
      scheduled_time: computedTime,
      description: serviceOrder?.description ?? '',
      notes: serviceOrder?.notes ?? '',
      form_template_id: serviceOrder?.form_template_id ?? '',
    },
  });

  useEffect(() => {
    if (open) {
      setStep(0);
      form.reset({
        customer_id: serviceOrder?.customer_id ?? '',
        equipment_id: serviceOrder?.equipment_id ?? '',
        technician_id: serviceOrder?.technician_id ?? '',
        os_type: (serviceOrder?.os_type as any) ?? 'manutencao_corretiva',
        service_type_id: serviceOrder?.service_type_id ?? '',
        scheduled_date: computedDate,
        scheduled_time: computedTime,
        description: serviceOrder?.description ?? '',
        notes: serviceOrder?.notes ?? '',
        form_template_id: serviceOrder?.form_template_id ?? '',
      });
      setSelectedCustomerId(serviceOrder?.customer_id);
      setSelectedServiceTypeId(serviceOrder?.service_type_id ?? undefined);
    }
  }, [open, serviceOrder, computedDate, computedTime]);

  const handleSubmit = async (data: ServiceOrderFormData) => {
    if (!serviceOrder && !isLastStep) {
      goNext();
      return;
    }

    const cleanedData = {
      ...data,
      equipment_id: data.equipment_id || undefined,
      technician_id: data.technician_id || undefined,
      service_type_id: data.service_type_id === 'none' ? undefined : (data.service_type_id || undefined),
      scheduled_date: data.scheduled_date || undefined,
      scheduled_time: data.scheduled_time || undefined,
      form_template_id: data.form_template_id === 'none' ? undefined : (data.form_template_id || undefined),
    };
    await onSubmit(cleanedData);
    form.reset();
    onOpenChange(false);
  };

  // Determine active steps (skip equipment if not needed)
  const activeSteps = useMemo(() => {
    if (serviceOrder) return STEPS; // Edit mode shows all
    if (!showEquipmentStep) return STEPS.filter(s => s.key !== 'equipment');
    return STEPS;
  }, [showEquipmentStep, serviceOrder]);

  const currentStepKey = activeSteps[step]?.key || 'client';

  const canGoNext = () => {
    if (currentStepKey === 'client') {
      return !!form.getValues('customer_id');
    }
    return true;
  };

  const goNext = () => {
    if (step < activeSteps.length - 1 && canGoNext()) setStep(step + 1);
  };
  const goBack = () => { if (step > 0) setStep(step - 1); };

  const isLastStep = step === activeSteps.length - 1;

  // For edit mode, show flat form
  if (serviceOrder) {
    return (
      <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Editar OS">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="customer_id" render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Cliente *</FormLabel>
                  <Select onValueChange={(v) => { field.onChange(v); setSelectedCustomerId(v); form.setValue('equipment_id', ''); }} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger></FormControl>
                    <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="service_type_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Serviço</FormLabel>
                  <Select onValueChange={(v) => { field.onChange(v); setSelectedServiceTypeId(v === 'none' ? undefined : v); }} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {serviceTypes.filter(t => t.is_active).map((st) => (
                        <SelectItem key={st.id} value={st.id}>
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: st.color }} />
                            {st.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="equipment_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Equipamento</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {equipment.map((eq) => <SelectItem key={eq.id} value={eq.id}>{eq.name} {eq.model && `- ${eq.model}`}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="technician_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Técnico</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                    <SelectContent>{technicians?.map((t) => <SelectItem key={t.user_id} value={t.user_id}>{t.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="form_template_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Questionário</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Sem questionário" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="none">Sem questionário</SelectItem>
                      {filteredTemplates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.questions?.length || 0} perguntas)</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="scheduled_date" render={({ field }) => (
                <FormItem><FormLabel>Data Agendada</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="scheduled_time" render={({ field }) => (
                <FormItem><FormLabel>Horário</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem className="sm:col-span-2"><FormLabel>Descrição</FormLabel><FormControl><Textarea placeholder="Descreva o serviço" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem className="sm:col-span-2"><FormLabel>Observações</FormLabel><FormControl><Textarea placeholder="Observações" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          </form>
        </Form>
      </ResponsiveModal>
    );
  }

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Nova Ordem de Serviço">
      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-6">
        {activeSteps.map((s, i) => (
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
            {i < activeSteps.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {/* Step 1: Client & Service */}
          {currentStepKey === 'client' && (
            <div className="space-y-4">
              <FormField control={form.control} name="customer_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente *</FormLabel>
                  <Select onValueChange={(v) => { field.onChange(v); setSelectedCustomerId(v); form.setValue('equipment_id', ''); }} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger></FormControl>
                    <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="service_type_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Serviço</FormLabel>
                  <Select onValueChange={(v) => { field.onChange(v); setSelectedServiceTypeId(v === 'none' ? undefined : v); }} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {serviceTypes.filter(t => t.is_active).map((st) => (
                        <SelectItem key={st.id} value={st.id}>
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: st.color }} />
                            {st.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="technician_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Técnico</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                    <SelectContent>{technicians?.map((t) => <SelectItem key={t.user_id} value={t.user_id}>{t.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          )}

          {/* Step 2: Equipment */}
          {currentStepKey === 'equipment' && (
            <div className="space-y-4">
              <FormField control={form.control} name="equipment_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Equipamento</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione o equipamento" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {equipment.map((eq) => (
                        <SelectItem key={eq.id} value={eq.id}>
                          {eq.name} {eq.brand && `(${eq.brand})`} {eq.model && `- ${eq.model}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              {selectedCustomerId && (
                <Button type="button" variant="outline" size="sm" onClick={() => setQuickCreateOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Criar equipamento
                </Button>
              )}
              {!selectedCustomerId && (
                <p className="text-sm text-muted-foreground">Selecione um cliente primeiro para ver equipamentos.</p>
              )}
            </div>
          )}

          {/* Step 3: Details */}
          {currentStepKey === 'details' && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField control={form.control} name="scheduled_date" render={({ field }) => (
                  <FormItem><FormLabel>Data Agendada</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="scheduled_time" render={({ field }) => (
                  <FormItem><FormLabel>Horário</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="form_template_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Questionário</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Sem questionário" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="none">Sem questionário</SelectItem>
                      {filteredTemplates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.questions?.length || 0} perguntas)</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Descrição do Serviço</FormLabel><FormControl><Textarea placeholder="Descreva o serviço a ser realizado" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Observações</FormLabel><FormControl><Textarea placeholder="Observações adicionais" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-4 border-t">
            <div>
              {step > 0 && (
                <Button type="button" variant="outline" onClick={goBack}>
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
                  Criar OS
                </Button>
              ) : (
                <Button type="button" onClick={goNext} disabled={!canGoNext()}>
                  Próximo
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </form>
      </Form>

      {/* Quick create equipment */}
      {selectedCustomerId && (
        <EquipmentFormDialog
          open={quickCreateOpen}
          onOpenChange={setQuickCreateOpen}
          equipment={null}
          onSubmit={async (data: any) => {
            const { supabase } = await import('@/integrations/supabase/client');
            const { data: created, error } = await supabase.from('equipment').insert(data as any).select().single();
            if (!error && created) {
              form.setValue('equipment_id', (created as any).id);
            }
          }}
          customers={[customers.find(c => c.id === selectedCustomerId)!].filter(Boolean)}
          isLoading={false}
        />
      )}
    </ResponsiveModal>
  );
}

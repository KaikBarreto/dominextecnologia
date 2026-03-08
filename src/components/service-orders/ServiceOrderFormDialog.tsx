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
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, ChevronRight, ChevronLeft, Plus, Check, Eye, UserPlus } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useCustomers } from '@/hooks/useCustomers';
import { useEquipment } from '@/hooks/useEquipment';
import { useTechnicians } from '@/hooks/useProfiles';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { useTeams } from '@/hooks/useTeams';
import { EquipmentFormDialog } from '@/components/customers/EquipmentFormDialog';
import { CustomerFormDialog } from '@/components/customers/CustomerFormDialog';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { QuestionnairePreviewDialog } from '@/components/service-orders/QuestionnairePreviewDialog';
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
  duration_minutes: z.coerce.number().min(15).default(120),
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
  defaultCustomerId?: string;
}

const STEPS = [
  { key: 'client', label: 'Cliente e Serviço' },
  { key: 'equipment', label: 'Equipamento(s)' },
  { key: 'details', label: 'Detalhes' },
];

export function ServiceOrderFormDialog({
  open, onOpenChange, serviceOrder, onSubmit, isLoading, defaultDate, defaultTime, defaultCustomerId,
}: ServiceOrderFormDialogProps) {
  const { customers, createCustomer } = useCustomers();
  const { data: technicians } = useTechnicians();
  const { templates } = useFormTemplates();
  const { serviceTypes } = useServiceTypes();
  const { teams } = useTeams();
  const [step, setStep] = useState(0);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>(serviceOrder?.customer_id ?? defaultCustomerId);
  const [selectedServiceTypeId, setSelectedServiceTypeId] = useState<string | undefined>(serviceOrder?.service_type_id ?? undefined);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateCustomerOpen, setQuickCreateCustomerOpen] = useState(false);
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);
  const [equipmentTemplateMap, setEquipmentTemplateMap] = useState<Record<string, string>>({});
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [requireTechSignature, setRequireTechSignature] = useState(false);
  const [requireClientSignature, setRequireClientSignature] = useState(false);
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
      duration_minutes: (serviceOrder as any)?.duration_minutes ?? 120,
      description: serviceOrder?.description ?? '',
      notes: serviceOrder?.notes ?? '',
      form_template_id: serviceOrder?.form_template_id ?? '',
    },
  });

  useEffect(() => {
    if (open) {
      setStep(0);
      setSelectedEquipmentIds(serviceOrder?.equipment_id ? [serviceOrder.equipment_id] : []);
      setEquipmentTemplateMap({});
      setRequireTechSignature(false);
      setRequireClientSignature(false);
      form.reset({
        customer_id: serviceOrder?.customer_id ?? defaultCustomerId ?? '',
        equipment_id: serviceOrder?.equipment_id ?? '',
        technician_id: serviceOrder?.technician_id ?? '',
        os_type: (serviceOrder?.os_type as any) ?? 'manutencao_corretiva',
        service_type_id: serviceOrder?.service_type_id ?? '',
        scheduled_date: computedDate,
        scheduled_time: computedTime,
        duration_minutes: (serviceOrder as any)?.duration_minutes ?? 120,
        description: serviceOrder?.description ?? '',
        notes: serviceOrder?.notes ?? '',
        form_template_id: serviceOrder?.form_template_id ?? '',
      });
      setSelectedCustomerId(serviceOrder?.customer_id ?? defaultCustomerId);
      setSelectedServiceTypeId(serviceOrder?.service_type_id ?? undefined);
    }
  }, [open, serviceOrder, computedDate, computedTime]);

  // Single OS with first equipment_id (all equipment tracked via form_template per equipment in the technician link)
  const handleCreateSubmit = async () => {
    const data = form.getValues();
    const assignee = data.technician_id || '';
    const isAll = assignee === 'all';
    const isTechTeam = !isAll && assignee.startsWith('team:');
    const techId = isAll ? undefined : (isTechTeam ? undefined : (assignee.startsWith('user:') ? assignee.slice(5) : assignee) || undefined);
    const teamId = isAll ? undefined : (isTechTeam ? assignee.slice(5) : undefined);

    const baseData = {
      ...data,
      technician_id: techId,
      team_id: teamId,
      service_type_id: data.service_type_id === 'none' ? undefined : (data.service_type_id || undefined),
      scheduled_date: data.scheduled_date || undefined,
      scheduled_time: data.scheduled_time || undefined,
    };

    const equipment_items = selectedEquipmentIds.map(eqId => ({
      equipment_id: eqId,
      form_template_id: equipmentTemplateMap[eqId] || undefined,
    }));

    const cleanedData = {
      ...baseData,
      equipment_id: selectedEquipmentIds[0] || undefined,
      form_template_id: equipmentTemplateMap[selectedEquipmentIds[0] || ''] || (data.form_template_id === 'none' ? undefined : data.form_template_id || undefined),
      require_tech_signature: requireTechSignature,
      require_client_signature: requireClientSignature,
      equipment_items: equipment_items.length > 0 ? equipment_items : undefined,
    };
    await onSubmit(cleanedData);
    form.reset();
    onOpenChange(false);
  };

  const handleEditSubmit = async (data: ServiceOrderFormData) => {
    const assignee = data.technician_id || '';
    const isAll = assignee === 'all';
    const isTechTeam = !isAll && assignee.startsWith('team:');
    const techId = isAll ? undefined : (isTechTeam ? undefined : (assignee.startsWith('user:') ? assignee.slice(5) : assignee) || undefined);
    const teamId = isAll ? undefined : (isTechTeam ? assignee.slice(5) : undefined);

    const cleanedData = {
      ...data,
      equipment_id: data.equipment_id || undefined,
      technician_id: techId,
      team_id: teamId,
      service_type_id: data.service_type_id === 'none' ? undefined : (data.service_type_id || undefined),
      scheduled_date: data.scheduled_date || undefined,
      scheduled_time: data.scheduled_time || undefined,
      form_template_id: data.form_template_id === 'none' ? undefined : (data.form_template_id || undefined),
    };
    await onSubmit(cleanedData);
    form.reset();
    onOpenChange(false);
  };

  const toggleEquipment = (eqId: string) => {
    setSelectedEquipmentIds(prev =>
      prev.includes(eqId) ? prev.filter(id => id !== eqId) : [...prev, eqId]
    );
  };

  const activeSteps = useMemo(() => {
    if (serviceOrder) return STEPS;
    if (!showEquipmentStep) return STEPS.filter(s => s.key !== 'equipment');
    return STEPS;
  }, [showEquipmentStep, serviceOrder]);

  const currentStepKey = activeSteps[step]?.key || 'client';

  const canGoNext = () => {
    if (currentStepKey === 'client') return !!form.getValues('customer_id');
    return true;
  };

  const goNext = () => { if (step < activeSteps.length - 1 && canGoNext()) setStep(step + 1); };
  const goBack = () => { if (step > 0) setStep(step - 1); };
  const isLastStep = step === activeSteps.length - 1;

  const customerOptions = useMemo(() =>
    customers.map(c => ({ value: c.id, label: c.name, sublabel: c.document || c.email || undefined })),
    [customers]
  );

  // Edit mode: flat form
  if (serviceOrder) {
    return (
      <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Editar OS">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleEditSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="customer_id" render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Cliente *</FormLabel>
                  <FormControl>
                    <SearchableSelect
                      options={customerOptions}
                      value={field.value}
                      onValueChange={(v) => { field.onChange(v); setSelectedCustomerId(v); form.setValue('equipment_id', ''); }}
                      placeholder="Selecione o cliente"
                      searchPlaceholder="Buscar cliente..."
                    />
                  </FormControl>
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
                  <FormControl>
                    <SearchableSelect
                      options={equipment.map(eq => ({ value: eq.id, label: eq.name, sublabel: [eq.brand, eq.model].filter(Boolean).join(' - ') || undefined }))}
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder="Selecione"
                      searchPlaceholder="Buscar equipamento..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="technician_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Técnico / Equipe</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="all">👥 Todos (empresa inteira)</SelectItem>
                      <SelectGroup>
                        <SelectLabel>Técnicos</SelectLabel>
                        {technicians?.map((t) => <SelectItem key={t.user_id} value={`user:${t.user_id}`}>{t.full_name}</SelectItem>)}
                      </SelectGroup>
                      {teams.filter(t => t.is_active).length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Equipes</SelectLabel>
                          {teams.filter(t => t.is_active).map((t) => (
                            <SelectItem key={t.id} value={`team:${t.id}`}>
                              <div className="flex items-center gap-2">
                                <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: t.color || 'hsl(var(--primary))' }} />
                                {t.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </SelectContent>
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
      <div className="flex flex-col items-center mb-6">
        <div className="flex items-center justify-center gap-2">
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
        <p className="text-sm font-medium text-foreground mt-2 sm:hidden">{activeSteps[step]?.label}</p>
      </div>

      <Form {...form}>
        <form onSubmit={(e) => { e.preventDefault(); if (isLastStep) handleCreateSubmit(); }} className="space-y-4">
          {/* Step 1: Client & Service */}
          {currentStepKey === 'client' && (
            <div className="space-y-4">
              <FormField control={form.control} name="customer_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente *</FormLabel>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <FormControl>
                        <SearchableSelect
                          options={customerOptions}
                          value={field.value}
                          onValueChange={(v) => { field.onChange(v); setSelectedCustomerId(v); setSelectedEquipmentIds([]); }}
                          placeholder="Selecione o cliente"
                          searchPlaceholder="Buscar cliente..."
                        />
                      </FormControl>
                    </div>
                    <Button type="button" variant="outline" size="icon" title="Criar cliente" onClick={() => setQuickCreateCustomerOpen(true)}>
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  </div>
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
                  <FormLabel>Técnico / Equipe</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="all">👥 Todos (empresa inteira)</SelectItem>
                      <SelectGroup>
                        <SelectLabel>Técnicos</SelectLabel>
                        {technicians?.map((t) => <SelectItem key={t.user_id} value={`user:${t.user_id}`}>{t.full_name}</SelectItem>)}
                      </SelectGroup>
                      {teams.filter(t => t.is_active).length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Equipes</SelectLabel>
                          {teams.filter(t => t.is_active).map((t) => (
                            <SelectItem key={t.id} value={`team:${t.id}`}>
                              <div className="flex items-center gap-2">
                                <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: t.color || 'hsl(var(--primary))' }} />
                                {t.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          )}

          {/* Step 2: Equipment(s) */}
          {currentStepKey === 'equipment' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {equipment.length > 1 ? 'Selecione um ou mais equipamentos para esta OS.' : 'Selecione o equipamento.'}
              </p>
              {equipment.length === 0 && selectedCustomerId && (
                <p className="text-sm text-muted-foreground">Nenhum equipamento cadastrado para este cliente.</p>
              )}
              {!selectedCustomerId && (
                <p className="text-sm text-muted-foreground">Selecione um cliente primeiro para ver equipamentos.</p>
              )}
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {equipment.map((eq) => (
                  <label
                    key={eq.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:bg-muted/50",
                      selectedEquipmentIds.includes(eq.id) && "border-primary bg-primary/5"
                    )}
                  >
                    <Checkbox
                      checked={selectedEquipmentIds.includes(eq.id)}
                      onCheckedChange={() => toggleEquipment(eq.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{eq.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[eq.brand, eq.model].filter(Boolean).join(' - ') || 'Sem detalhes'}
                      </p>
                    </div>
                    {eq.identifier && (
                      <span className="text-xs font-mono text-muted-foreground shrink-0">{eq.identifier}</span>
                    )}
                  </label>
                ))}
              </div>
              {selectedCustomerId && (
                <Button type="button" variant="outline" size="sm" onClick={() => setQuickCreateOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Criar equipamento
                </Button>
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
                <FormField control={form.control} name="duration_minutes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duração</FormLabel>
                    <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value || 120)}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="15">15 min</SelectItem>
                        <SelectItem value="30">30 min</SelectItem>
                        <SelectItem value="45">45 min</SelectItem>
                        <SelectItem value="60">1 hora</SelectItem>
                        <SelectItem value="90">1h30</SelectItem>
                        <SelectItem value="120">2 horas</SelectItem>
                        <SelectItem value="180">3 horas</SelectItem>
                        <SelectItem value="240">4 horas</SelectItem>
                        <SelectItem value="300">5 horas</SelectItem>
                        <SelectItem value="360">6 horas</SelectItem>
                        <SelectItem value="480">8 horas</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Questionnaire per equipment */}
              {selectedEquipmentIds.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Questionário por equipamento</p>
                  {selectedEquipmentIds.map((eqId) => {
                    const eq = equipment.find(e => e.id === eqId);
                    const selectedTemplateId = equipmentTemplateMap[eqId] || '';
                    return (
                      <div key={eqId} className="rounded-lg border p-3 space-y-2">
                        <p className="text-sm font-medium">{eq?.name || 'Equipamento'}</p>
                        <div className="flex gap-2 items-center">
                          <Select
                            value={selectedTemplateId || 'none'}
                            onValueChange={(v) => setEquipmentTemplateMap(prev => ({ ...prev, [eqId]: v === 'none' ? '' : v }))}
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Sem questionário" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sem questionário</SelectItem>
                              {filteredTemplates.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.name} ({t.questions?.length || 0} perguntas)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {selectedTemplateId && selectedTemplateId !== 'none' && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Pré-visualizar questionário"
                              onClick={() => setPreviewTemplateId(selectedTemplateId)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <FormField control={form.control} name="form_template_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Questionário</FormLabel>
                    <div className="flex gap-2 items-center">
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger className="flex-1"><SelectValue placeholder="Sem questionário" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="none">Sem questionário</SelectItem>
                          {filteredTemplates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.questions?.length || 0} perguntas)</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {field.value && field.value !== 'none' && (
                        <Button type="button" variant="ghost" size="icon" title="Pré-visualizar questionário" onClick={() => setPreviewTemplateId(field.value!)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Descrição do Serviço</FormLabel><FormControl><Textarea placeholder="Descreva o serviço a ser realizado" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Observações</FormLabel><FormControl><Textarea placeholder="Observações adicionais" {...field} /></FormControl><FormMessage /></FormItem>
              )} />

              {/* Signature toggles removed - use questionnaire signature questions instead */}
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
                <Button type="submit" disabled={isLoading} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar OS
                </Button>
              ) : (
                <Button type="button" onClick={(e) => { e.preventDefault(); goNext(); }} disabled={!canGoNext()}>
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
              setSelectedEquipmentIds(prev => [...prev, (created as any).id]);
            }
          }}
          customers={[customers.find(c => c.id === selectedCustomerId)!].filter(Boolean)}
          isLoading={false}
        />
      )}

      {/* Quick create customer */}
      <CustomerFormDialog
        open={quickCreateCustomerOpen}
        onOpenChange={setQuickCreateCustomerOpen}
        onSubmit={async (data: any) => {
          const result = await createCustomer.mutateAsync(data);
          if (result) {
            const newId = (result as any).id;
            form.setValue('customer_id', newId);
            setSelectedCustomerId(newId);
            setSelectedEquipmentIds([]);
          }
        }}
        isLoading={createCustomer.isPending}
      />

      {/* Questionnaire preview */}
      <QuestionnairePreviewDialog
        templateId={previewTemplateId}
        open={!!previewTemplateId}
        onOpenChange={(o) => { if (!o) setPreviewTemplateId(null); }}
        templates={templates}
      />
    </ResponsiveModal>
  );
}

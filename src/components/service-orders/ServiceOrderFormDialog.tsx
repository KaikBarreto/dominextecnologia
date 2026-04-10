import { useState, useMemo, useEffect, useCallback } from 'react';
import { StateCitySelector } from '@/components/StateCitySelector';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, addDays, addWeeks, addMonths } from 'date-fns';
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
import { Loader2, ChevronRight, ChevronLeft, Plus, Check, Eye, UserPlus, MapPin, Repeat } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useCustomers } from '@/hooks/useCustomers';
import { useEquipment } from '@/hooks/useEquipment';
import { useProfiles } from '@/hooks/useProfiles';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { useTeams } from '@/hooks/useTeams';
import { EquipmentFormDialog } from '@/components/customers/EquipmentFormDialog';
import { CustomerFormDialog } from '@/components/customers/CustomerFormDialog';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { AssigneeMultiSelect } from '@/components/schedule/AssigneeMultiSelect';
import { QuestionnairePreviewDialog } from '@/components/service-orders/QuestionnairePreviewDialog';
import { CepLookup } from '@/components/CepLookup';
import { useFormDraft } from '@/hooks/useFormDraft';
import { DraftResumeDialog } from '@/components/ui/DraftResumeDialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { ServiceOrder } from '@/types/database';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { normalizeOptionalForeignKeys } from '@/utils/foreignKeys';
import { useAuth } from '@/contexts/AuthContext';

const serviceOrderSchema = z.object({
  customer_id: z.string().optional(),
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
  const { data: technicians } = useProfiles();
  const { templates } = useFormTemplates();
  const { serviceTypes } = useServiceTypes();
  const { teams, teamsWithMembers } = useTeams();
  const isEditing = !!serviceOrder;
  const [step, setStep] = useState(0);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>(serviceOrder?.customer_id ?? defaultCustomerId);
  const [selectedServiceTypeId, setSelectedServiceTypeId] = useState<string | undefined>(serviceOrder?.service_type_id ?? undefined);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateCustomerOpen, setQuickCreateCustomerOpen] = useState(false);
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);
  const [equipmentTemplateMap, setEquipmentTemplateMap] = useState<Record<string, string>>({});
  const [selectedStandaloneTemplateIds, setSelectedStandaloneTemplateIds] = useState<string[]>([]);
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [requireTechSignature, setRequireTechSignature] = useState(false);
  const [requireClientSignature, setRequireClientSignature] = useState(false);
  const [customerMode, setCustomerMode] = useState<'existing' | 'adhoc'>('existing');
  const [adhocName, setAdhocName] = useState('');
  const [adhocPhone, setAdhocPhone] = useState('');
  const [adhocCep, setAdhocCep] = useState('');
  const [adhocAddress, setAdhocAddress] = useState('');
  const [adhocCity, setAdhocCity] = useState('');
  const [adhocState, setAdhocState] = useState('');
  const [adhocNeighborhood, setAdhocNeighborhood] = useState('');
  const [selectedAssigneeUserIds, setSelectedAssigneeUserIds] = useState<string[]>([]);
  const [selectedAssigneeTeamIds, setSelectedAssigneeTeamIds] = useState<string[]>([]);
  const { equipment } = useEquipment(selectedCustomerId);
  const { toast: editToast } = useToast();
  const [contractDateDialogOpen, setContractDateDialogOpen] = useState(false);
  const [recurrenceEditDialogOpen, setRecurrenceEditDialogOpen] = useState(false);
  const [pendingEditData, setPendingEditData] = useState<ServiceOrderFormData | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Recurrence state (create mode only)
  const [recurrenceEnabled, setRecurrenceEnabled] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState('weekly');
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState<number[]>([]);

  const RECURRENCE_OPTIONS = [
    { value: 'daily', label: 'Diária' },
    { value: 'weekly', label: 'Semanal' },
    { value: 'biweekly', label: 'Quinzenal' },
    { value: 'monthly', label: 'Mensal' },
    { value: 'yearly', label: 'Anual' },
    { value: 'custom', label: 'Personalizado' },
  ];
  const WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const toggleWeekday = (day: number) => {
    setRecurrenceWeekdays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

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

  type OSDraft = ServiceOrderFormData & { _selectedCustomerId?: string; _selectedServiceTypeId?: string };
  const draft = useFormDraft<OSDraft>({ key: 'service-order-form', isOpen: open, isEditing });

  // Save draft on changes
  const watchedValues = form.watch();
  useEffect(() => {
    if (open && !isEditing && !draft.showResumePrompt) {
      draft.saveDraft({ ...watchedValues, _selectedCustomerId: selectedCustomerId, _selectedServiceTypeId: selectedServiceTypeId });
    }
  }, [watchedValues, selectedCustomerId, selectedServiceTypeId, open, isEditing, draft.showResumePrompt]);

  // Load existing equipment items when editing
  const loadExistingEquipmentItems = async (osId: string) => {
    const { data } = await supabase
      .from('service_order_equipment')
      .select('equipment_id, form_template_id')
      .eq('service_order_id', osId);
    if (data && data.length > 0) {
      const eqIds: string[] = [];
      const templateMap: Record<string, string> = {};
      const standaloneIds: string[] = [];
      data.forEach((item: any) => {
        if (item.equipment_id) {
          eqIds.push(item.equipment_id);
          if (item.form_template_id) templateMap[item.equipment_id] = item.form_template_id;
        } else if (item.form_template_id) {
          standaloneIds.push(item.form_template_id);
        }
      });
      if (eqIds.length > 0) setSelectedEquipmentIds(eqIds);
      if (Object.keys(templateMap).length > 0) setEquipmentTemplateMap(templateMap);
      if (standaloneIds.length > 0) setSelectedStandaloneTemplateIds(standaloneIds);
    }
  };

  useEffect(() => {
    if (open) {
      setStep(0);
      setSelectedEquipmentIds(serviceOrder?.equipment_id ? [serviceOrder.equipment_id] : []);
      setEquipmentTemplateMap({});
      setSelectedStandaloneTemplateIds([]);
      setRequireClientSignature(false);
      setCustomerMode('existing');
      setAdhocName(''); setAdhocPhone(''); setAdhocCep(''); setAdhocAddress('');
      setAdhocCity(''); setAdhocState(''); setAdhocNeighborhood('');
      const existingAssigneeIds = (serviceOrder as any)?._assignee_user_ids as string[] | undefined;
      if (existingAssigneeIds && existingAssigneeIds.length > 0) {
        setSelectedAssigneeUserIds(existingAssigneeIds);
      } else if (serviceOrder?.technician_id) {
        setSelectedAssigneeUserIds([serviceOrder.technician_id]);
      } else {
        setSelectedAssigneeUserIds([]);
      }
      setSelectedAssigneeTeamIds(serviceOrder?.team_id ? [serviceOrder.team_id] : []);
      setRecurrenceEnabled(false);
      setRecurrenceType('weekly');
      setRecurrenceInterval(1);
      setRecurrenceEndDate('');
      const dayOfWeek = new Date(defaultDate || new Date()).getDay();
      setRecurrenceWeekdays([dayOfWeek]);
      if (!isEditing && draft.hasDraft && draft.draftData) {
        // Draft will be applied via DraftResumeDialog
      } else {
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
      // Load existing equipment items from junction table when editing
      if (isEditing && serviceOrder?.id) {
        loadExistingEquipmentItems(serviceOrder.id);
      }
    }
  }, [open, serviceOrder, computedDate, computedTime]);

  // Single OS with first equipment_id (all equipment tracked via form_template per equipment in the technician link)
  const handleCreateSubmit = async () => {
    const data = form.getValues();

    // If adhoc customer, auto-create first
    let customerId = data.customer_id;
    if (customerMode === 'adhoc') {
      if (!adhocName.trim()) return;
      const result = await createCustomer.mutateAsync({
        name: adhocName.trim(),
        phone: adhocPhone || undefined,
        address: adhocAddress || undefined,
        neighborhood: adhocNeighborhood || undefined,
        city: adhocCity || undefined,
        state: adhocState || undefined,
        zip_code: adhocCep?.replace(/\D/g, '') || undefined,
      } as any);
      if (!result) return;
      customerId = (result as any).id;
    }

    if (!customerId) return;
    const techId = selectedAssigneeUserIds[0] || undefined;
    const teamId = selectedAssigneeTeamIds[0] || undefined;

    const equipment_items = [
      ...selectedEquipmentIds.map(eqId => ({
        equipment_id: eqId,
        form_template_id: equipmentTemplateMap[eqId] || undefined,
      })),
      ...selectedStandaloneTemplateIds.map(tId => ({
        equipment_id: undefined as string | undefined,
        form_template_id: tId,
      })),
    ];

    const formTemplateId = equipmentTemplateMap[selectedEquipmentIds[0] || ''] || selectedStandaloneTemplateIds[0] || (data.form_template_id === 'none' ? undefined : data.form_template_id || undefined);

    // If recurrence is enabled, generate multiple OS entries
    if (recurrenceEnabled && recurrenceEndDate) {
      const startDate = data.scheduled_date || format(new Date(), 'yyyy-MM-dd');
      const dates: string[] = [startDate];
      const endDate = new Date(recurrenceEndDate + 'T12:00:00');

      if (recurrenceType === 'custom' && recurrenceWeekdays.length > 0) {
        let current = addDays(new Date(startDate + 'T12:00:00'), 1);
        while (current <= endDate) {
          if (recurrenceWeekdays.includes(current.getDay())) {
            dates.push(format(current, 'yyyy-MM-dd'));
          }
          current = addDays(current, 1);
        }
      } else {
        let current = new Date(startDate + 'T12:00:00');
        const interval = recurrenceInterval || 1;
        while (true) {
          if (recurrenceType === 'daily') current = addDays(current, interval);
          else if (recurrenceType === 'weekly') current = addWeeks(current, interval);
          else if (recurrenceType === 'biweekly') current = addWeeks(current, 2 * interval);
          else if (recurrenceType === 'monthly') current = addMonths(current, interval);
          else break;
          if (current > endDate) break;
          dates.push(format(current, 'yyyy-MM-dd'));
        }
      }

      const groupId = crypto.randomUUID();
      const inserts = dates.map(date => normalizeOptionalForeignKeys({
        customer_id: customerId,
        technician_id: techId || null,
        team_id: teamId || null,
        os_type: data.os_type,
        service_type_id: data.service_type_id === 'none' ? null : (data.service_type_id || null),
        scheduled_date: date,
        scheduled_time: data.scheduled_time || null,
        duration_minutes: data.duration_minutes || 120,
        description: data.description || null,
        notes: data.notes || null,
        equipment_id: selectedEquipmentIds[0] || null,
        form_template_id: formTemplateId || null,
        require_tech_signature: requireTechSignature,
        require_client_signature: requireClientSignature,
        status: 'pendente',
        created_by: user?.id,
        recurrence_type: recurrenceType,
        recurrence_interval: recurrenceInterval,
        recurrence_end_date: recurrenceEndDate,
        recurrence_group_id: groupId,
      } as any, ['technician_id', 'team_id', 'customer_id', 'equipment_id', 'service_type_id', 'form_template_id']));

      const { data: created, error } = await supabase.from('service_orders').insert(inserts as any).select('id');
      if (error) {
        editToast({ variant: 'destructive', title: 'Erro ao criar OSs recorrentes', description: error.message });
        return;
      }

      // Insert assignees and equipment items for each created OS
      if (created) {
        if (selectedAssigneeUserIds.length > 0) {
          const assigneeRows = created.flatMap((row: any) =>
            selectedAssigneeUserIds.map(uid => ({ service_order_id: row.id, user_id: uid }))
          );
          await supabase.from('service_order_assignees').insert(assigneeRows);
        }
        if (equipment_items.length > 0) {
          const eqRows = created.flatMap((row: any) =>
            equipment_items.map(item => ({
              service_order_id: row.id,
              equipment_id: item.equipment_id || null,
              form_template_id: item.form_template_id || null,
            }))
          );
          await supabase.from('service_order_equipment').insert(eqRows);
        }
      }

      editToast({ title: `${dates.length} OS(s) criada(s) com recorrência!` });
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      draft.clearDraft();
      form.reset();
      onOpenChange(false);
      return;
    }

    // Normal single OS creation
    const cleanedData = {
      ...data,
      customer_id: customerId,
      technician_id: techId,
      team_id: teamId,
      service_type_id: data.service_type_id === 'none' ? undefined : (data.service_type_id || undefined),
      scheduled_date: data.scheduled_date || undefined,
      scheduled_time: data.scheduled_time || undefined,
      equipment_id: selectedEquipmentIds[0] || undefined,
      form_template_id: formTemplateId,
      require_tech_signature: requireTechSignature,
      require_client_signature: requireClientSignature,
      equipment_items: equipment_items.length > 0 ? equipment_items : undefined,
      assignee_user_ids: selectedAssigneeUserIds,
      assignee_team_ids: selectedAssigneeTeamIds,
    };
    await onSubmit(cleanedData);
    draft.clearDraft();
    form.reset();
    onOpenChange(false);
  };

  const buildEditPayload = (data: ServiceOrderFormData) => {
    const techId = selectedAssigneeUserIds[0] || undefined;
    const teamId = selectedAssigneeTeamIds[0] || undefined;
    const equipItems = [
      ...selectedEquipmentIds.map(eqId => ({
        equipment_id: eqId,
        form_template_id: equipmentTemplateMap[eqId] || undefined,
      })),
      ...selectedStandaloneTemplateIds.map(tId => ({
        equipment_id: undefined as string | undefined,
        form_template_id: tId,
      })),
    ];
    return {
      ...data,
      equipment_id: data.equipment_id || undefined,
      technician_id: techId,
      team_id: teamId,
      service_type_id: data.service_type_id === 'none' ? undefined : (data.service_type_id || undefined),
      scheduled_date: data.scheduled_date || undefined,
      scheduled_time: data.scheduled_time || undefined,
      form_template_id: selectedStandaloneTemplateIds[0] || (data.form_template_id === 'none' ? undefined : (data.form_template_id || undefined)),
      assignee_user_ids: selectedAssigneeUserIds,
      equipment_items: equipItems.length > 0 ? equipItems : undefined,
    };
  };

  const handleEditSubmit = async (data: ServiceOrderFormData) => {
    // Check if this is a contract OS and date changed
    const isContractOS = !!(serviceOrder as any)?.contract_id;
    const isRecurrenceOS = !!(serviceOrder as any)?.recurrence_group_id;
    const dateChanged = data.scheduled_date !== serviceOrder?.scheduled_date;

    if (isContractOS && dateChanged) {
      setPendingEditData(data);
      setContractDateDialogOpen(true);
      return;
    }

    // If this OS belongs to a recurrence group, ask if changes should apply to all
    if (isRecurrenceOS) {
      setPendingEditData(data);
      setRecurrenceEditDialogOpen(true);
      return;
    }

    const cleanedData = buildEditPayload(data);
    await onSubmit(cleanedData);
    form.reset();
    onOpenChange(false);
  };

  const handleContractDateChoice = async (applyToFuture: boolean) => {
    if (!pendingEditData || !serviceOrder) return;
    setContractDateDialogOpen(false);
    
    const cleanedData = buildEditPayload(pendingEditData);
    await onSubmit(cleanedData);

    if (applyToFuture) {
      try {
        const contractId = (serviceOrder as any).contract_id;
        const oldDate = serviceOrder.scheduled_date;
        const newDate = pendingEditData.scheduled_date;
        if (contractId && oldDate && newDate) {
          const diffMs = new Date(newDate + 'T12:00:00').getTime() - new Date(oldDate + 'T12:00:00').getTime();
          const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

          // Get all future occurrences from the same contract
          const { data: futureOccurrences } = await supabase
            .from('contract_occurrences')
            .select('id, scheduled_date, service_order_id')
            .eq('contract_id', contractId)
            .gt('scheduled_date', oldDate)
            .order('scheduled_date', { ascending: true });

          if (futureOccurrences && futureOccurrences.length > 0) {
            for (const occ of futureOccurrences) {
              const newOccDate = new Date(new Date(occ.scheduled_date + 'T12:00:00').getTime() + diffDays * 24 * 60 * 60 * 1000);
              const formattedDate = newOccDate.toISOString().split('T')[0];

              // Update occurrence
              await supabase
                .from('contract_occurrences')
                .update({ scheduled_date: formattedDate })
                .eq('id', occ.id);

              // Update linked service order if exists
              if (occ.service_order_id) {
                await supabase
                  .from('service_orders')
                  .update({ scheduled_date: formattedDate })
                  .eq('id', occ.service_order_id);
              }
            }
            editToast({ title: `${futureOccurrences.length} ocorrência(s) futura(s) ajustada(s)` });
          }
        }
      } catch (err: any) {
        editToast({ variant: 'destructive', title: 'Erro ao ajustar datas futuras', description: err.message });
      }
    }

    setPendingEditData(null);
    form.reset();
    onOpenChange(false);
  };

  const handleRecurrenceEditChoice = async (applyToAll: boolean) => {
    if (!pendingEditData || !serviceOrder) return;
    setRecurrenceEditDialogOpen(false);

    const cleanedData = buildEditPayload(pendingEditData);
    await onSubmit(cleanedData);

    if (applyToAll) {
      try {
        const groupId = (serviceOrder as any).recurrence_group_id;
        const { data: groupOrders } = await supabase
          .from('service_orders')
          .select('id, scheduled_date')
          .eq('recurrence_group_id', groupId)
          .neq('id', serviceOrder.id);

        if (groupOrders && groupOrders.length > 0) {
          const { scheduled_date, scheduled_time, ...editableFields } = cleanedData;
          const updatePayload = normalizeOptionalForeignKeys(editableFields, [
            'technician_id', 'team_id', 'customer_id', 'equipment_id', 'service_type_id', 'form_template_id',
          ] as any);

          for (const os of groupOrders) {
            await supabase
              .from('service_orders')
              .update(updatePayload as any)
              .eq('id', os.id);

            if (cleanedData.assignee_user_ids) {
              await supabase.from('service_order_assignees').delete().eq('service_order_id', os.id);
              if (cleanedData.assignee_user_ids.length > 0) {
                await supabase.from('service_order_assignees').insert(
                  cleanedData.assignee_user_ids.map((uid: string) => ({ service_order_id: os.id, user_id: uid }))
                );
              }
            }
          }
          queryClient.invalidateQueries({ queryKey: ['service-orders'] });
          editToast({ title: `${groupOrders.length + 1} OS(s) da recorrência atualizadas!` });
        }
      } catch (err: any) {
        editToast({ variant: 'destructive', title: 'Erro ao atualizar recorrência', description: err.message });
      }
    }

    setPendingEditData(null);
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
    if (customerMode === 'adhoc') return STEPS.filter(s => s.key !== 'equipment');
    if (!showEquipmentStep) return STEPS.filter(s => s.key !== 'equipment');
    return STEPS;
  }, [showEquipmentStep, serviceOrder, customerMode]);

  const currentStepKey = activeSteps[step]?.key || 'client';

  const canGoNext = () => {
    if (currentStepKey === 'client') {
      if (customerMode === 'adhoc') return !!adhocName.trim();
      return !!form.getValues('customer_id');
    }
    return true;
  };

  const goNext = () => { if (step < activeSteps.length - 1 && canGoNext()) setStep(step + 1); };
  const goBack = () => { if (step > 0) setStep(step - 1); };
  const isLastStep = step === activeSteps.length - 1;

  const customerOptions = useMemo(() =>
    customers.map(c => ({ value: c.id, label: c.name, sublabel: c.document || c.email || undefined })),
    [customers]
  );

  // Edit mode: same multi-step form as create
  if (serviceOrder) {
    return (
      <>
      <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Editar OS">
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
          <form onSubmit={(e) => { e.preventDefault(); if (isLastStep) form.handleSubmit(handleEditSubmit)(); }} className="space-y-4">
            {/* Step 1: Client & Service */}
            {currentStepKey === 'client' && (
              <div className="space-y-4">
                <FormField control={form.control} name="customer_id" render={({ field }) => (
                  <FormItem>
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
                    <FormControl>
                      <SearchableSelect
                        options={[
                          { value: 'none', label: 'Nenhum' },
                          ...serviceTypes.filter(t => t.is_active).map((st) => ({
                            value: st.id,
                            label: st.name,
                            icon: <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: st.color }} />,
                          })),
                        ]}
                        value={field.value || 'none'}
                        onValueChange={(v) => { field.onChange(v); setSelectedServiceTypeId(v === 'none' ? undefined : v); }}
                        placeholder="Selecione"
                        searchPlaceholder="Buscar tipo de serviço..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <AssigneeMultiSelect
                  technicians={technicians || []}
                  teams={teamsWithMembers}
                  selectedUserIds={selectedAssigneeUserIds}
                  selectedTeamIds={selectedAssigneeTeamIds}
                  onChangeUsers={setSelectedAssigneeUserIds}
                  onChangeTeams={setSelectedAssigneeTeamIds}
                  label="Responsáveis"
                />
              </div>
            )}

            {/* Step 2: Equipment */}
            {currentStepKey === 'equipment' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Selecione o(s) equipamento(s).</p>
                  {equipment.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (selectedEquipmentIds.length === equipment.length) {
                          setSelectedEquipmentIds([]);
                        } else {
                          setSelectedEquipmentIds(equipment.map(eq => eq.id));
                        }
                      }}
                    >
                      {selectedEquipmentIds.length === equipment.length ? 'Desmarcar todos' : 'Selecionar todos'}
                    </Button>
                  )}
                </div>
                {equipment.map((eq) => (
                  <label key={eq.id} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                    <Checkbox
                      checked={selectedEquipmentIds.includes(eq.id)}
                      onCheckedChange={(checked) => {
                        setSelectedEquipmentIds(prev =>
                          checked ? [...prev, eq.id] : prev.filter(id => id !== eq.id)
                        );
                      }}
                    />
                    <div>
                      <p className="text-sm font-medium">{eq.name}</p>
                      {(eq.brand || eq.model) && (
                        <p className="text-xs text-muted-foreground">{[eq.brand, eq.model].filter(Boolean).join(' - ')}</p>
                      )}
                    </div>
                  </label>
                ))}
                {equipment.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum equipamento cadastrado para este cliente.</p>
                )}
              </div>
            )}

            {/* Step 3: Details */}
            {currentStepKey === 'details' && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField control={form.control} name="service_type_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo da OS</FormLabel>
                      <FormControl>
                        <SearchableSelect
                          value={field.value || 'none'}
                          options={[
                            { value: 'none', label: 'Sem tipo' },
                            ...serviceTypes.filter(st => st.is_active).map(st => ({
                              value: st.id,
                              label: st.name,
                            })),
                          ]}
                          onValueChange={(v) => { field.onChange(v); setSelectedServiceTypeId(v === 'none' ? undefined : v); }}
                          placeholder="Selecione"
                          searchPlaceholder="Buscar tipo de serviço..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="scheduled_date" render={({ field }) => (
                    <FormItem><FormLabel>Data Agendada</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="scheduled_time" render={({ field }) => (
                    <FormItem><FormLabel>Horário</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
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
                          <Select
                            value={selectedTemplateId || 'none'}
                            onValueChange={(v) => setEquipmentTemplateMap(prev => ({ ...prev, [eqId]: v === 'none' ? '' : v }))}
                          >
                            <SelectTrigger><SelectValue placeholder="Sem questionário" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sem questionário</SelectItem>
                              {filteredTemplates.map((t) => (
                                <SelectItem key={t.id} value={t.id}>{t.name} ({t.questions?.length || 0} perguntas)</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Questionários</Label>
                    {selectedStandaloneTemplateIds.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {selectedStandaloneTemplateIds.map(tId => {
                          const tmpl = filteredTemplates.find(t => t.id === tId);
                          return (
                            <Badge key={tId} variant="secondary" className="gap-1 pr-1">
                              {tmpl?.name || 'Questionário'}
                              <button type="button" className="ml-1 rounded-full hover:bg-muted p-0.5" onClick={() => setSelectedStandaloneTemplateIds(prev => prev.filter(id => id !== tId))}>
                                ✕
                              </button>
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex gap-2 items-center">
                      <Select value="" onValueChange={(v) => { if (v && v !== 'none' && !selectedStandaloneTemplateIds.includes(v)) setSelectedStandaloneTemplateIds(prev => [...prev, v]); }}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Adicionar questionário..." /></SelectTrigger>
                        <SelectContent>
                          {filteredTemplates.filter(t => !selectedStandaloneTemplateIds.includes(t.id)).map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name} ({t.questions?.length || 0} perguntas)</SelectItem>
                          ))}
                          {filteredTemplates.filter(t => !selectedStandaloneTemplateIds.includes(t.id)).length === 0 && (
                            <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum questionário disponível</div>
                          )}
                        </SelectContent>
                      </Select>
                      {selectedStandaloneTemplateIds.length > 0 && (
                        <Button type="button" variant="ghost" size="icon" title="Pré-visualizar" onClick={() => setPreviewTemplateId(selectedStandaloneTemplateIds[0])}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                )}

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
                  <Button type="submit" disabled={isLoading} className="bg-primary text-primary-foreground hover:bg-primary/90">
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar
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
      </ResponsiveModal>

      {/* Contract date propagation dialog */}
      <AlertDialog open={contractDateDialogOpen} onOpenChange={setContractDateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar data da recorrência?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta OS pertence a um contrato recorrente. Deseja ajustar apenas esta data ou todas as ocorrências futuras?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => { setPendingEditData(null); }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => handleContractDateChoice(false)}>
              Apenas esta
            </AlertDialogAction>
            <AlertDialogAction onClick={() => handleContractDateChoice(true)}>
              Esta e futuras
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </>
    );
  }

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Nova Ordem de Serviço">
      <DraftResumeDialog
        open={draft.showResumePrompt}
        onResume={() => {
          if (draft.draftData) {
            const { _selectedCustomerId, _selectedServiceTypeId, ...formValues } = draft.draftData;
            form.reset(formValues);
            if (_selectedCustomerId) setSelectedCustomerId(_selectedCustomerId);
            if (_selectedServiceTypeId) setSelectedServiceTypeId(_selectedServiceTypeId);
          }
          draft.acceptDraft();
        }}
        onDiscard={() => {
          draft.discardDraft();
          form.reset({
            customer_id: '', equipment_id: '', technician_id: '',
            os_type: 'manutencao_corretiva', service_type_id: '',
            scheduled_date: computedDate, scheduled_time: computedTime,
            duration_minutes: 120, description: '', notes: '', form_template_id: '',
          });
        }}
      />
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
              {/* Customer mode toggle */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={customerMode === 'existing' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => { setCustomerMode('existing'); }}
                >
                  Cliente cadastrado
                </Button>
                <Button
                  type="button"
                  variant={customerMode === 'adhoc' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => { setCustomerMode('adhoc'); form.setValue('customer_id', ''); setSelectedCustomerId(undefined); setSelectedEquipmentIds([]); }}
                >
                  Cliente avulso
                </Button>
              </div>

              {customerMode === 'existing' ? (
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
              ) : (
                <div className="space-y-3 rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">O cliente será criado automaticamente com os dados abaixo.</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label>Nome *</Label>
                      <Input value={adhocName} onChange={e => setAdhocName(e.target.value)} placeholder="Nome do cliente" />
                    </div>
                    <div>
                      <Label>Telefone</Label>
                      <Input value={adhocPhone} onChange={e => setAdhocPhone(e.target.value)} placeholder="(00) 00000-0000" />
                    </div>
                    <div>
                      <Label>CEP</Label>
                      <CepLookup
                        value={adhocCep}
                        onChange={setAdhocCep}
                        onAddressFound={(addr) => {
                          setAdhocAddress(addr.logradouro);
                          setAdhocNeighborhood(addr.bairro);
                          setAdhocCity(addr.cidade);
                          setAdhocState(addr.estado);
                        }}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Endereço</Label>
                      <AddressAutocomplete
                        value={adhocAddress}
                        onChange={setAdhocAddress}
                        onAddressSelected={(addr) => {
                          setAdhocAddress(addr.logradouro);
                          setAdhocNeighborhood(addr.bairro);
                          setAdhocCity(addr.cidade);
                          setAdhocState(addr.estado);
                          if (addr.cep) {
                            const c = addr.cep.replace(/\D/g, '');
                            setAdhocCep(c.length > 5 ? `${c.slice(0,5)}-${c.slice(5)}` : c);
                          }
                        }}
                        placeholder="Rua, Avenida..."
                      />
                    </div>
                    <div>
                      <Label>Bairro</Label>
                      <Input value={adhocNeighborhood} onChange={e => setAdhocNeighborhood(e.target.value)} placeholder="Bairro" />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>UF / Cidade</Label>
                      <StateCitySelector
                        selectedState={adhocState}
                        selectedCity={adhocCity}
                        onStateChange={setAdhocState}
                        onCityChange={setAdhocCity}
                      />
                    </div>
                  </div>
                </div>
              )}

              <FormField control={form.control} name="service_type_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Serviço</FormLabel>
                  <FormControl>
                    <SearchableSelect
                      options={[
                        { value: 'none', label: 'Nenhum' },
                        ...serviceTypes.filter(t => t.is_active).map((st) => ({
                          value: st.id,
                          label: st.name,
                          icon: <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: st.color }} />,
                        })),
                      ]}
                      value={field.value || 'none'}
                      onValueChange={(v) => { field.onChange(v); setSelectedServiceTypeId(v === 'none' ? undefined : v); }}
                      placeholder="Selecione"
                      searchPlaceholder="Buscar tipo de serviço..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <AssigneeMultiSelect
                technicians={technicians || []}
                teams={teamsWithMembers}
                selectedUserIds={selectedAssigneeUserIds}
                selectedTeamIds={selectedAssigneeTeamIds}
                onChangeUsers={setSelectedAssigneeUserIds}
                onChangeTeams={setSelectedAssigneeTeamIds}
                label="Responsáveis"
              />
            </div>
          )}

          {/* Step 2: Equipment(s) */}
          {currentStepKey === 'equipment' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {equipment.length > 1 ? 'Selecione um ou mais equipamentos para esta OS.' : 'Selecione o equipamento.'}
                </p>
                {equipment.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (selectedEquipmentIds.length === equipment.length) {
                        setSelectedEquipmentIds([]);
                      } else {
                        setSelectedEquipmentIds(equipment.map(eq => eq.id));
                      }
                    }}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    {selectedEquipmentIds.length === equipment.length ? 'Desmarcar todos' : 'Selecionar todos'}
                  </Button>
                )}
              </div>
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
                    {(eq as any).photo_url && (
                      <img
                        src={(eq as any).photo_url}
                        alt={eq.name}
                        className="h-12 w-12 rounded-lg object-cover shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{eq.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[eq.brand, eq.model].filter(Boolean).join(' - ') || 'Sem detalhes'}
                      </p>
                      {(eq as any).location && (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {(eq as any).location}
                        </p>
                      )}
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
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Questionários</Label>
                  {selectedStandaloneTemplateIds.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedStandaloneTemplateIds.map(tId => {
                        const tmpl = filteredTemplates.find(t => t.id === tId);
                        return (
                          <Badge key={tId} variant="secondary" className="gap-1 pr-1">
                            {tmpl?.name || 'Questionário'}
                            <button type="button" className="ml-1 rounded-full hover:bg-muted p-0.5" onClick={() => setSelectedStandaloneTemplateIds(prev => prev.filter(id => id !== tId))}>
                              ✕
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex gap-2 items-center">
                    <Select value="" onValueChange={(v) => { if (v && v !== 'none' && !selectedStandaloneTemplateIds.includes(v)) setSelectedStandaloneTemplateIds(prev => [...prev, v]); }}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Adicionar questionário..." /></SelectTrigger>
                      <SelectContent>
                        {filteredTemplates.filter(t => !selectedStandaloneTemplateIds.includes(t.id)).map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name} ({t.questions?.length || 0} perguntas)</SelectItem>
                        ))}
                        {filteredTemplates.filter(t => !selectedStandaloneTemplateIds.includes(t.id)).length === 0 && (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum questionário disponível</div>
                        )}
                      </SelectContent>
                    </Select>
                    {selectedStandaloneTemplateIds.length > 0 && (
                      <Button type="button" variant="ghost" size="icon" title="Pré-visualizar" onClick={() => setPreviewTemplateId(selectedStandaloneTemplateIds[0])}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Descrição do Serviço</FormLabel><FormControl><Textarea placeholder="Descreva o serviço a ser realizado" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Observações</FormLabel><FormControl><Textarea placeholder="Observações adicionais" {...field} /></FormControl><FormMessage /></FormItem>
              )} />

              {/* Recurrence */}
              <div className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Switch checked={recurrenceEnabled} onCheckedChange={setRecurrenceEnabled} />
                  <Label className="cursor-pointer flex items-center gap-1.5">
                    <Repeat className="h-4 w-4" />
                    Recorrência
                  </Label>
                </div>
                {recurrenceEnabled && (
                  <div className="space-y-3 pt-1">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Frequência</Label>
                        <Select value={recurrenceType} onValueChange={setRecurrenceType}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {RECURRENCE_OPTIONS.map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">A cada</Label>
                        <div className="flex items-center gap-1.5">
                          <Input type="number" min={1} max={12} value={recurrenceInterval} onChange={(e) => setRecurrenceInterval(Number(e.target.value))} />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {recurrenceType === 'daily' ? 'dia(s)' :
                             recurrenceType === 'monthly' ? 'mês(es)' :
                             recurrenceType === 'yearly' ? 'ano(s)' :
                             'semana(s)'}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Até</Label>
                        <Input type="date" value={recurrenceEndDate} onChange={(e) => setRecurrenceEndDate(e.target.value)} />
                      </div>
                    </div>
                    {(recurrenceType === 'custom' || recurrenceType === 'weekly') && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Repetir em:</Label>
                        <div className="flex gap-1">
                          {WEEKDAY_LABELS.map((label, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => toggleWeekday(idx)}
                              className={cn(
                                'h-8 w-8 rounded-md text-xs font-medium transition-colors border',
                                recurrenceWeekdays.includes(idx)
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-muted text-muted-foreground border-border hover:bg-accent'
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

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
                  {recurrenceEnabled ? 'Criar OS Recorrentes' : 'Criar OS'}
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

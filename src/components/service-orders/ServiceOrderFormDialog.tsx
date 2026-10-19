import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { StateCitySelector } from '@/components/StateCitySelector';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/DatePicker';
import { NumericInput } from '@/components/ui/numeric-input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, ChevronRight, ChevronLeft, ChevronDown, Plus, Check, Eye, MapPin, Repeat, AlertTriangle, MapPinned, ClipboardList, Wrench, X, Copy } from 'lucide-react';
import { geocodeAddress, buildServiceAddress } from '@/utils/geolocation';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useCustomers } from '@/hooks/useCustomers';
import { useEquipment } from '@/hooks/useEquipment';
import { useProfiles } from '@/hooks/useProfiles';
import { getErrorMessage } from '@/utils/errorMessages';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { useTeams } from '@/hooks/useTeams';
import { useNpsSettings } from '@/hooks/useNpsSettings';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { Star } from 'lucide-react';
import { EquipmentFormDialog } from '@/components/customers/EquipmentFormDialog';
import { CustomerFormDialog } from '@/components/customers/CustomerFormDialog';
import { CustomerSelectField } from '@/components/customers/CustomerSelectField';
import { QuickServiceTypeDialog } from '@/components/service-orders/QuickServiceTypeDialog';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { AssigneeMultiSelect } from '@/components/schedule/AssigneeMultiSelect';
import { ChecklistPreviewDialog } from '@/components/service-orders/ChecklistPreviewDialog';
import { CepLookup } from '@/components/CepLookup';
import { useFormDraft } from '@/hooks/useFormDraft';
import { DraftResumeDialog } from '@/components/ui/DraftResumeDialog';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { ServiceOrder, ServiceOrderScheduleSlot, OsStatus } from '@/types/database';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { normalizeOptionalForeignKeys } from '@/utils/foreignKeys';
import { useAuth } from '@/contexts/AuthContext';
import { useIsPmocOrder } from '@/hooks/useIsPmocOrder';
import { PmocComplianceBadge } from '@/components/pmoc/PmocComplianceBadge';
import { StepTransition } from '@/components/ui/step-transition';
import { MESSAGES } from '@/lib/i18n/messages';
import { generateRecurrenceDates, findRecurrenceIssue, weekdaysToPersist, resolveEditingWeekdays, type RecurrenceIssue, type RecurrenceSpec } from '@/lib/taskRecurrence';
import { formatDate } from '@/lib/format';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { OsMaterialsSection } from '@/components/service-orders/OsMaterialsSection';
import { ServiceTypesMultiSelect } from '@/components/service-orders/ServiceTypesMultiSelect';
import { ServiceOrderBudgetSection } from '@/components/service-orders/ServiceOrderBudgetSection';
import {
  syncServiceOrderBudget,
  syncServiceOrderServiceTypes,
  useServiceOrderBudget,
  useServiceOrderServiceTypes,
} from '@/hooks/useServiceOrderBudget';
import {
  serviceOrderBudgetSignature,
  type ServiceOrderBudgetItem,
} from '@/lib/serviceOrderBudget';
import { groupScopeItems } from '@/hooks/useServiceOrders';
import {
  checklistMatchesEquipmentServices,
  checklistMatchesSelectedServices,
  mergeServiceTypeIds,
  reconcileEquipmentChecklistTemplateIds,
} from '@/lib/serviceOrderServices';
import { ServiceOrderSchedulePlanner } from '@/components/service-orders/ServiceOrderSchedulePlanner';
import {
  normalizeServiceOrderSchedulePlan,
  shiftSchedulePlanToStart,
} from '@/lib/serviceOrderSchedule';

const scheduleSlotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/),
  duration_minutes: z.coerce.number().int().min(15).max(480),
});

const serviceOrderSchema = z.object({
  customer_id: z.string().optional(),
  equipment_id: z.string().optional(),
  technician_id: z.string().optional(),
  os_type: z.enum(['manutencao_preventiva', 'manutencao_corretiva', 'instalacao', 'visita_tecnica']),
  service_type_id: z.string().optional(),
  scheduled_date: z.string().optional(),
  scheduled_time: z.string().optional(),
  duration_minutes: z.coerce.number().int().min(15).max(480).default(120),
  schedule_plan: z.array(scheduleSlotSchema).min(1).max(31),
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
  // Status pré-preenchido quando a OS é criada via "+" de uma coluna do kanban.
  // Quando ausente, o backend usa o default do schema ('pendente').
  defaultStatus?: OsStatus;
  /** Descrição pré-preenchida (ex: título da oportunidade, ao criar OS a partir do CRM). Só criação. */
  defaultDescription?: string;
  /** Responsáveis pré-selecionados (ex: vendedor da oportunidade, ao criar OS a partir do CRM). Só criação. */
  defaultAssigneeUserIds?: string[];
}

const STEPS = [
  { key: 'client' as const },
  { key: 'equipment' as const },
  { key: 'details' as const },
];

/**
 * Assinatura estável do escopo (conjunto de pares equipamento×checklist) de uma
 * OS, pra detectar se o usuário REALMENTE mexeu no escopo antes de mandar
 * `equipment_items` no save. Importa quem está no conjunto, não a ordem.
 */
export const scopeSignature = (
  items: Array<{
    equipment_id?: string | null;
    form_template_id?: string | null;
    service_type_ids?: string[];
  }>,
): string =>
  items
    .map(i => `${i.equipment_id ?? ''}::${i.form_template_id ?? ''}::${Array.from(new Set(i.service_type_ids ?? [])).sort().join(',')}`)
    .sort()
    .join('|');

export function ServiceOrderFormDialog({
  open, onOpenChange, serviceOrder, onSubmit, isLoading, defaultDate, defaultTime, defaultCustomerId, defaultStatus,
  defaultDescription, defaultAssigneeUserIds,
}: ServiceOrderFormDialogProps) {
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.form;
  const { customers, createCustomer } = useCustomers();
  const { data: technicians } = useProfiles();
  const { templates } = useFormTemplates();
  const { serviceTypes } = useServiceTypes();
  const { teams, teamsWithMembers } = useTeams();
  const { settings: npsSettings } = useNpsSettings();
  const isEditing = !!serviceOrder;
  const [step, setStep] = useState(0);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>(serviceOrder?.customer_id ?? defaultCustomerId);
  const [selectedServiceTypeIds, setSelectedServiceTypeIds] = useState<string[]>(
    serviceOrder?.service_type_id ? [serviceOrder.service_type_id] : [],
  );
  const [budgetItems, setBudgetItems] = useState<ServiceOrderBudgetItem[]>([]);
  const loadedBudgetSigRef = useRef<string | null>(null);
  const loadedServiceTypesSigRef = useRef<string | null>(null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateCustomerOpen, setQuickCreateCustomerOpen] = useState(false);
  const [quickCreateServiceTypeOpen, setQuickCreateServiceTypeOpen] = useState(false);
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);
  const [equipmentTemplateMap, setEquipmentTemplateMap] = useState<Record<string, string[]>>({});
  const [equipmentServiceTypeMap, setEquipmentServiceTypeMap] = useState<Record<string, string[]>>({});
  const [selectedStandaloneTemplateIds, setSelectedStandaloneTemplateIds] = useState<string[]>([]);
  // Trava contra corrida: `loadExistingEquipmentItems` é assíncrono e só popula os
  // estados acima quando termina. Se o usuário salvar ANTES disso, os estados
  // ainda estão vazios — mandar `equipment_items: []` nesse momento apagaria o
  // escopo real da OS (equipamentos + checklists) e as respostas já preenchidas.
  // `scopeLoaded` vira true no `finally` do load (inclusive quando a OS não tem
  // nenhuma linha de escopo — "carregou e está vazio" é informação válida).
  const [scopeLoaded, setScopeLoaded] = useState(false);
  // Assinatura do escopo COMO VEIO DO BANCO. O save só manda `equipment_items`
  // quando ela difere da assinatura montada na tela — ou seja, quando o usuário
  // mexeu de fato no escopo. Sem isso, editar só a data dispararia a RPC
  // `sync_service_order_scope` à toa, e quem tem permissão de mexer na OS mas
  // não de editar escopo (técnico sem `fn:edit_os`) tomaria erro num save que
  // nem encosta em equipamento/checklist.
  const loadedScopeSigRef = useRef<string | null>(null);
  // Equipamentos com o painel de checklists expandido (chevron) na etapa 2.
  const [expandedEquipmentIds, setExpandedEquipmentIds] = useState<string[]>([]);
  const [copySourceEquipmentId, setCopySourceEquipmentId] = useState<string | null>(null);
  const [copyTargetEquipmentIds, setCopyTargetEquipmentIds] = useState<string[]>([]);
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [requireTechSignature, setRequireTechSignature] = useState(false);
  const [requireClientSignature, setRequireClientSignature] = useState(false);
  // Gerar Pesquisa de Satisfação ao finalizar? OS nova herda o padrão da empresa;
  // OS existente reflete generate_nps_survey (null = herda o padrão).
  const [generateNpsSurvey, setGenerateNpsSurvey] = useState(true);
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
  // Endereço de serviço próprio da OS (diferente do cliente). Alavanca + campos estruturados.
  const [useServiceAddress, setUseServiceAddress] = useState(false);
  const [svcCep, setSvcCep] = useState('');
  const [svcAddress, setSvcAddress] = useState('');
  const [svcNumber, setSvcNumber] = useState('');
  const [svcNeighborhood, setSvcNeighborhood] = useState('');
  const [svcCity, setSvcCity] = useState('');
  const [svcState, setSvcState] = useState('');
  const { equipment: rawEquipment } = useEquipment(selectedCustomerId);
  // BUG 1.23.x — sem customerId, useEquipment devolve TODOS os equipamentos da
  // empresa (comportamento correto pra outras telas, ex. página de Equipamentos,
  // onde não mexemos). Aqui, sem cliente selecionado (ex. modo "Cliente avulso",
  // onde o cliente ainda não existe), a lista efetiva TEM que ficar vazia —
  // nunca mostrar/permitir marcar equipamento de outro cliente da empresa.
  const equipment = useMemo(
    () => (selectedCustomerId ? rawEquipment : []),
    [selectedCustomerId, rawEquipment],
  );
  const { toast: editToast } = useToast();
  const [contractDateDialogOpen, setContractDateDialogOpen] = useState(false);
  const [recurrenceEditDialogOpen, setRecurrenceEditDialogOpen] = useState(false);
  const [pendingEditData, setPendingEditData] = useState<ServiceOrderFormData | null>(null);
  const [scopeRemovalConfirmed, setScopeRemovalConfirmed] = useState(false);
  const [scopeRemovalWarning, setScopeRemovalWarning] = useState<{
    data: ServiceOrderFormData;
    answeredResponses: number;
    checklists: number;
    mode?: 'continue' | 'recurrence_all';
  } | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const budgetQuery = useServiceOrderBudget(isEditing ? serviceOrder?.id : null);
  const serviceTypesQuery = useServiceOrderServiceTypes(isEditing ? serviceOrder?.id : null);

  // Onda B v1.9.1 — warning na descrição quando a OS pertence a contrato PMOC.
  // Os primeiros 200 caracteres aparecem no portal público da unidade.
  const { isPmoc: isPmocOrder } = useIsPmocOrder(isEditing ? serviceOrder?.id : null);

  // Recurrence state (create mode only)
  const [recurrenceEnabled, setRecurrenceEnabled] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState('weekly');
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState<number[]>([]);

  const RECURRENCE_OPTIONS = [
    { value: 'daily', label: t.recurrenceOptions.daily },
    { value: 'weekly', label: t.recurrenceOptions.weekly },
    { value: 'biweekly', label: t.recurrenceOptions.biweekly },
    { value: 'monthly', label: t.recurrenceOptions.monthly },
    { value: 'yearly', label: t.recurrenceOptions.yearly },
    { value: 'custom', label: t.recurrenceOptions.custom },
  ];
  const WEEKDAY_LABELS = t.weekdayLabels;
  const toggleWeekday = (day: number) => {
    setRecurrenceWeekdays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  // Spec da recorrência no formato do motor único (src/lib/taskRecurrence.ts).
  const recurrenceSpec: RecurrenceSpec = useMemo(() => ({
    recurrence_type: recurrenceType,
    recurrence_interval: recurrenceInterval,
    recurrence_end_date: recurrenceEndDate || null,
    recurrence_weekdays: recurrenceWeekdays,
  }), [recurrenceType, recurrenceInterval, recurrenceEndDate, recurrenceWeekdays]);

  const describeRecurrenceIssue = useCallback((issue: RecurrenceIssue): string => {
    switch (issue.code) {
      case 'missing_end_date': return t.recurrenceErrorNoEndDate;
      case 'custom_without_weekdays': return t.recurrenceErrorNoWeekday;
      case 'unsupported_type': return t.recurrenceErrorUnsupported;
      default: return t.recurrenceErrorUnsupported;
    }
  }, [t]);

  const showEquipmentStep = useMemo(() => {
    if (selectedServiceTypeIds.length === 0) return true;
    return selectedServiceTypeIds.some(id => serviceTypes.find(st => st.id === id)?.requires_equipment ?? true);
  }, [selectedServiceTypeIds, serviceTypes]);

  const filteredTemplates = useMemo(() => {
    return templates.filter(template => (
      checklistMatchesSelectedServices(template, selectedServiceTypeIds)
    ));
  }, [templates, selectedServiceTypeIds]);

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

  const computedSchedulePlan = useMemo(() => normalizeServiceOrderSchedulePlan({
    scheduled_date: computedDate,
    scheduled_time: computedTime,
    duration_minutes: serviceOrder?.duration_minutes ?? 120,
    schedule_plan: serviceOrder?.schedule_plan,
  }), [computedDate, computedTime, serviceOrder?.duration_minutes, serviceOrder?.schedule_plan]);

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
      schedule_plan: computedSchedulePlan,
      description: serviceOrder?.description ?? defaultDescription ?? '',
      notes: serviceOrder?.notes ?? '',
      form_template_id: serviceOrder?.form_template_id ?? '',
    },
  });

  type OSDraft = ServiceOrderFormData & {
    _selectedCustomerId?: string;
    _selectedServiceTypeIds?: string[];
    _budgetItems?: ServiceOrderBudgetItem[];
  };
  const draft = useFormDraft<OSDraft>({ key: 'service-order-form', isOpen: open, isEditing });

  // Save draft on changes
  const watchedValues = form.watch();

  // Prévia da série ANTES de salvar: quantas OS saem e de quando até quando.
  // É a trava contra o silêncio — se a combinação escolhida gerar uma OS só,
  // a tela diz isso na hora, em vez de criar uma e o cliente descobrir depois.
  const recurrencePreview = useMemo<{ error?: string; text?: string } | null>(() => {
    if (!recurrenceEnabled) return null;
    const issue = findRecurrenceIssue(recurrenceSpec);
    if (issue) return { error: describeRecurrenceIssue(issue) };
    const startDate = watchedValues.scheduled_date || format(new Date(), 'yyyy-MM-dd');
    try {
      const dates = generateRecurrenceDates(startDate, recurrenceSpec);
      if (dates.length <= 1) return { error: t.recurrencePreviewSingle };
      return {
        text: t.recurrencePreviewCount
          .replace('{n}', String(dates.length))
          .replace('{inicio}', formatDate(dates[0], locale, timezone))
          .replace('{fim}', formatDate(dates[dates.length - 1], locale, timezone)),
      };
    } catch (err) {
      return { error: getErrorMessage(err) };
    }
  }, [recurrenceEnabled, recurrenceSpec, describeRecurrenceIssue, watchedValues.scheduled_date, t, locale, timezone]);

  useEffect(() => {
    if (open && !isEditing && !draft.showResumePrompt) {
      draft.saveDraft({
        ...watchedValues,
        _selectedCustomerId: selectedCustomerId,
        _selectedServiceTypeIds: selectedServiceTypeIds,
        _budgetItems: budgetItems,
      });
    }
  }, [watchedValues, selectedCustomerId, selectedServiceTypeIds, budgetItems, open, isEditing, draft.showResumePrompt]);

  // Load existing equipment items when editing
  const loadExistingEquipmentItems = async (osId: string) => {
    try {
      const [scopeResult, servicesResult] = await Promise.all([
        supabase
          .from('service_order_equipment')
          .select('equipment_id, form_template_id')
          .eq('service_order_id', osId),
        supabase
          .from('service_order_equipment_service_types')
          .select('equipment_id, service_type_id, position')
          .eq('service_order_id', osId)
          .order('position', { ascending: true }),
      ]);
      const { data, error } = scopeResult;
      // Leitura falhou: NÃO liberar `scopeLoaded`. Com a trava fechada o save
      // manda `equipment_items: undefined` (não encosta no escopo) em vez de
      // assumir "a OS não tem escopo" e apagar tudo.
      if (error || servicesResult.error) return;
      const serviceMap: Record<string, string[]> = {};
      (servicesResult.data ?? []).forEach((row: any) => {
        if (!serviceMap[row.equipment_id]) serviceMap[row.equipment_id] = [];
        if (!serviceMap[row.equipment_id].includes(row.service_type_id)) {
          serviceMap[row.equipment_id].push(row.service_type_id);
        }
      });
      const scopeWithServices = ((data as any[]) ?? []).map(item => ({
        ...item,
        service_type_ids: item.equipment_id ? (serviceMap[item.equipment_id] ?? []) : [],
      }));
      loadedScopeSigRef.current = scopeSignature(scopeWithServices);
      if (data && data.length > 0) {
        const eqIdSet = new Set<string>();
        const templateMap: Record<string, string[]> = {};
        const standaloneIds: string[] = [];
        data.forEach((item: any) => {
          if (item.equipment_id) {
            eqIdSet.add(item.equipment_id);
            if (item.form_template_id) {
              if (!templateMap[item.equipment_id]) templateMap[item.equipment_id] = [];
              if (!templateMap[item.equipment_id].includes(item.form_template_id)) {
                templateMap[item.equipment_id].push(item.form_template_id);
              }
            }
          } else if (item.form_template_id) {
            standaloneIds.push(item.form_template_id);
          }
        });
        const eqIds = Array.from(eqIdSet);
        if (eqIds.length > 0) setSelectedEquipmentIds(eqIds);
        if (Object.keys(templateMap).length > 0) setEquipmentTemplateMap(templateMap);
        setEquipmentServiceTypeMap(serviceMap);
        if (standaloneIds.length > 0) setSelectedStandaloneTemplateIds(standaloneIds);
      }
      // Só aqui, com a leitura confirmada: destrava o envio de `equipment_items`.
      setScopeLoaded(true);
    } catch {
      // Idem: exceção de rede mantém a trava fechada.
    }
  };

  useEffect(() => {
    if (open) {
      setStep(0);
      setBudgetItems([]);
      loadedBudgetSigRef.current = null;
      const fallbackServiceIds = serviceOrder?.service_type_id ? [serviceOrder.service_type_id] : [];
      setSelectedServiceTypeIds(fallbackServiceIds);
      loadedServiceTypesSigRef.current = null;
      setSelectedEquipmentIds(serviceOrder?.equipment_id ? [serviceOrder.equipment_id] : []);
      setEquipmentTemplateMap({});
      setEquipmentServiceTypeMap({});
      setSelectedStandaloneTemplateIds([]);
      setScopeLoaded(false);
      loadedScopeSigRef.current = null;
      setExpandedEquipmentIds([]);
      setRequireClientSignature(false);
      setCustomerMode('existing');
      setAdhocName(''); setAdhocPhone(''); setAdhocCep(''); setAdhocAddress('');
      setAdhocCity(''); setAdhocState(''); setAdhocNeighborhood('');
      // Endereço de serviço: edição reflete o estado salvo; criação começa vazio.
      const so = serviceOrder as any;
      const hasSvc = !!(so?.service_address || so?.service_city || so?.service_zip_code);
      setUseServiceAddress(hasSvc);
      const formatCep = (raw?: string | null) => {
        const c = (raw || '').replace(/\D/g, '');
        return c.length > 5 ? `${c.slice(0, 5)}-${c.slice(5)}` : c;
      };
      setSvcCep(formatCep(so?.service_zip_code));
      setSvcAddress(so?.service_address ?? '');
      setSvcNumber(so?.service_address_number ?? '');
      setSvcNeighborhood(so?.service_neighborhood ?? '');
      setSvcCity(so?.service_city ?? '');
      setSvcState(so?.service_state ?? '');
      const existingAssigneeIds = (serviceOrder as any)?._assignee_user_ids as string[] | undefined;
      if (existingAssigneeIds && existingAssigneeIds.length > 0) {
        setSelectedAssigneeUserIds(existingAssigneeIds);
      } else if (serviceOrder?.technician_id) {
        setSelectedAssigneeUserIds([serviceOrder.technician_id]);
      } else if (!isEditing && defaultAssigneeUserIds && defaultAssigneeUserIds.length > 0) {
        // Só na criação (ex: vendedor responsável da oportunidade, ao criar OS a partir do CRM).
        setSelectedAssigneeUserIds(defaultAssigneeUserIds);
      } else {
        setSelectedAssigneeUserIds([]);
      }
      setSelectedAssigneeTeamIds(serviceOrder?.team_id ? [serviceOrder.team_id] : []);
      setRecurrenceEnabled(false);
      setRecurrenceType('weekly');
      setRecurrenceInterval(1);
      setRecurrenceEndDate('');
      if (isEditing) {
        // BUG CORRIGIDO — antes chutava sempre `[dayOfWeek]` (o dia da semana
        // da própria data agendada), mesmo a OS pertencendo a uma série
        // "Personalizada" com vários dias gravados. Como este estado hoje não
        // é usado no submit de edição (a tela ainda não permite alterar o
        // padrão de recorrência de uma série existente — ver relato ao Tech
        // Lead), o chute nunca chegava a corromper nada salvo. Mesmo assim,
        // remontar certo aqui evita a mesma pegadinha do bug de tarefa
        // reaparecer no dia em que a edição de recorrência da OS for ligada.
        const { weekdays } = resolveEditingWeekdays(serviceOrder as any);
        setRecurrenceWeekdays(weekdays);
      } else {
        const dayOfWeek = new Date(defaultDate || new Date()).getDay();
        setRecurrenceWeekdays([dayOfWeek]);
      }
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
          schedule_plan: computedSchedulePlan,
          description: serviceOrder?.description ?? defaultDescription ?? '',
          notes: serviceOrder?.notes ?? '',
          form_template_id: serviceOrder?.form_template_id ?? '',
        });
        setSelectedCustomerId(serviceOrder?.customer_id ?? defaultCustomerId);
      }
      // Load existing equipment items from junction table when editing
      if (isEditing && serviceOrder?.id) {
        loadExistingEquipmentItems(serviceOrder.id);
      }
    }
  }, [open, serviceOrder, computedDate, computedTime, computedSchedulePlan]);

  useEffect(() => {
    if (!open || !isEditing || !budgetQuery.data) return;
    setBudgetItems(budgetQuery.data);
    loadedBudgetSigRef.current = serviceOrderBudgetSignature(budgetQuery.data);
  }, [open, isEditing, budgetQuery.data]);

  useEffect(() => {
    if (!open || !isEditing || !serviceTypesQuery.data) return;
    const ids = serviceTypesQuery.data.length > 0
      ? serviceTypesQuery.data
      : serviceOrder?.service_type_id
        ? [serviceOrder.service_type_id]
        : [];
    setSelectedServiceTypeIds(ids);
    form.setValue('service_type_id', ids[0] ?? '');
    loadedServiceTypesSigRef.current = JSON.stringify(ids);
  }, [open, isEditing, serviceTypesQuery.data, serviceOrder?.service_type_id]);

  // Seed do toggle "Gerar Pesquisa de Satisfação?" — separado para reagir ao
  // carregamento assíncrono do padrão da empresa sem clobberar os demais campos.
  // OS existente: generate_nps_survey se não-null, senão o padrão da empresa.
  // OS nova: padrão da empresa (generate_on_finish).
  useEffect(() => {
    if (!open) return;
    const existingNps = (serviceOrder as any)?.generate_nps_survey as boolean | null | undefined;
    setGenerateNpsSurvey(
      existingNps === null || existingNps === undefined
        ? npsSettings.generate_on_finish
        : existingNps,
    );
  }, [open, serviceOrder, npsSettings.generate_on_finish]);

  // Monta os campos service_* da OS. Quando a alavanca está ligada, geocoda o
  // endereço (não-bloqueante: falhou o geocode, salva os textos com coords null
  // → o mapa cai no fallback por endereço). Desligada → tudo null.
  const buildServiceAddressPayload = async () => {
    if (!useServiceAddress) {
      return {
        service_address: null,
        service_address_number: null,
        service_neighborhood: null,
        service_city: null,
        service_state: null,
        service_zip_code: null,
        service_latitude: null,
        service_longitude: null,
      };
    }
    const cep = svcCep.replace(/\D/g, '') || null;
    const base = {
      service_address: svcAddress.trim() || null,
      service_address_number: svcNumber.trim() || null,
      service_neighborhood: svcNeighborhood.trim() || null,
      service_city: svcCity.trim() || null,
      service_state: svcState.trim() || null,
      service_zip_code: cep,
    };
    const fullAddress = buildServiceAddress(base);
    let coords: { lat: number; lng: number } | null = null;
    if (fullAddress) {
      try { coords = await geocodeAddress(fullAddress); } catch { coords = null; }
    }
    return {
      ...base,
      service_latitude: coords?.lat ?? null,
      service_longitude: coords?.lng ?? null,
    };
  };

  // Single OS with first equipment_id (all equipment tracked via form_template per equipment in the technician link)
  const handleCreateSubmit = async () => {
    const data = form.getValues();
    const serviceAddressPayload = await buildServiceAddressPayload();

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

    // Defesa extra (a lista de equipamentos já fica vazia na UI em modo avulso):
    // cliente criado na hora nunca tem equipamento próprio ainda, então nunca
    // manda equipment_id/equipment_items de outro cliente da empresa.
    const effectiveEquipmentIds = customerMode === 'adhoc' ? [] : selectedEquipmentIds;

    const equipment_items = [
      ...effectiveEquipmentIds.flatMap(eqId => {
        const templates = equipmentTemplateMap[eqId] || [];
        const serviceTypeIds = equipmentServiceTypeMap[eqId] || [];
        if (templates.length === 0) {
          return [{
            equipment_id: eqId,
            form_template_id: undefined as string | undefined,
            service_type_ids: serviceTypeIds,
          }];
        }
        return templates.map(tId => ({
          equipment_id: eqId,
          form_template_id: tId as string | undefined,
          service_type_ids: serviceTypeIds,
        }));
      }),
      ...selectedStandaloneTemplateIds.map(tId => ({
        equipment_id: undefined as string | undefined,
        form_template_id: tId as string | undefined,
      })),
    ];

    const formTemplateId = equipmentTemplateMap[effectiveEquipmentIds[0] || '']?.[0]
      || selectedStandaloneTemplateIds[0]
      || (data.form_template_id === 'none' ? undefined : data.form_template_id || undefined);

    // Recorrência ligada → gera a série inteira pelo motor único
    // (src/lib/taskRecurrence.ts). A validação abaixo repete a da tela porque
    // este submit também é chamado direto pelo botão: recorrência que não
    // renderia série é BLOQUEADA com mensagem, nunca vira uma OS só em silêncio.
    if (recurrenceEnabled) {
      const issue = findRecurrenceIssue(recurrenceSpec);
      if (issue) {
        editToast({ variant: 'destructive', title: t.toastErrorRecurring, description: describeRecurrenceIssue(issue) });
        return;
      }

      const startDate = data.scheduled_date || format(new Date(), 'yyyy-MM-dd');
      let dates: string[];
      try {
        dates = generateRecurrenceDates(startDate, recurrenceSpec);
      } catch (err) {
        editToast({ variant: 'destructive', title: t.toastErrorRecurring, description: getErrorMessage(err) });
        return;
      }

      const groupId = crypto.randomUUID();
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();
      const inserts = dates.map(date => {
        const occurrencePlan = shiftSchedulePlanToStart(
          data.schedule_plan as ServiceOrderScheduleSlot[],
          date,
        );
        const firstSlot = occurrencePlan[0];
        return normalizeOptionalForeignKeys({
        customer_id: customerId,
        technician_id: techId || null,
        team_id: teamId || null,
        os_type: data.os_type,
        service_type_id: data.service_type_id === 'none' ? null : (data.service_type_id || null),
        scheduled_date: firstSlot?.date ?? date,
        scheduled_time: firstSlot?.time ?? data.scheduled_time ?? null,
        duration_minutes: firstSlot?.duration_minutes ?? data.duration_minutes ?? 120,
        schedule_plan: occurrencePlan,
        description: data.description || null,
        notes: data.notes || null,
        equipment_id: effectiveEquipmentIds[0] || null,
        form_template_id: formTemplateId || null,
        require_tech_signature: requireTechSignature,
        require_client_signature: requireClientSignature,
        generate_nps_survey: generateNpsSurvey,
        // Quando criada via "+" de coluna do kanban, defaultStatus respeita aquela coluna.
        status: defaultStatus ?? 'pendente',
        created_by: user?.id,
        recurrence_type: recurrenceType,
        recurrence_interval: recurrenceInterval,
        recurrence_end_date: recurrenceEndDate,
        // BUG CORRIGIDO — os dias marcados eram usados só pra calcular as datas
        // (generateRecurrenceDates) e nunca gravados na linha. A série nascia
        // com `recurrence_weekdays` null, mesmo o usuário tendo escolhido dias
        // específicos (ex.: "Personalizada" segunda + sábado). `null` (nunca
        // `[]`) quando a frequência não usa dia da semana ou nenhum foi marcado.
        recurrence_weekdays: weekdaysToPersist(recurrenceSpec),
        recurrence_group_id: groupId,
        company_id,
        ...serviceAddressPayload,
        } as any, ['technician_id', 'team_id', 'customer_id', 'equipment_id', 'service_type_id', 'form_template_id']);
      });

      const { data: created, error } = await supabase.from('service_orders').insert(inserts as any).select('id');
      if (error) {
        editToast({ variant: 'destructive', title: t.toastErrorRecurring, description: getErrorMessage(error) });
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
        await Promise.all(created.map(async (row: any) => {
          await syncServiceOrderServiceTypes(row.id, selectedServiceTypeIds);
          if (equipment_items.length > 0) {
            const { error: scopeError } = await supabase.rpc('sync_service_order_scope_with_services' as any, {
              _service_order_id: row.id,
              _items: groupScopeItems(equipment_items) as any,
            });
            if (scopeError) throw scopeError;
          }
          await syncServiceOrderBudget(row.id, budgetItems);
        }));
      }

      editToast({ title: t.toastRecurringCreated.replace('{n}', String(dates.length)) });
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
      service_type_ids: selectedServiceTypeIds,
      budget_items: budgetItems,
      scheduled_date: data.scheduled_date || undefined,
      scheduled_time: data.scheduled_time || undefined,
      equipment_id: effectiveEquipmentIds[0] || undefined,
      form_template_id: formTemplateId,
      require_tech_signature: requireTechSignature,
      require_client_signature: requireClientSignature,
      generate_nps_survey: generateNpsSurvey,
      equipment_items: equipment_items.length > 0 ? equipment_items : undefined,
      assignee_user_ids: selectedAssigneeUserIds,
      assignee_team_ids: selectedAssigneeTeamIds,
      ...serviceAddressPayload,
      // Status pré-preenchido pela coluna do kanban (se aplicável).
      // Sem defaultStatus, omitimos pra o backend usar o default do schema.
      ...(defaultStatus ? { status: defaultStatus } : {}),
    };
    await onSubmit(cleanedData);
    draft.clearDraft();
    form.reset();
    onOpenChange(false);
  };

  const buildEditPayload = async (data: ServiceOrderFormData) => {
    const techId = selectedAssigneeUserIds[0] || undefined;
    const teamId = selectedAssigneeTeamIds[0] || undefined;
    const serviceAddressPayload = await buildServiceAddressPayload();
    const equipItems = [
      ...selectedEquipmentIds.flatMap(eqId => {
        const templates = equipmentTemplateMap[eqId] || [];
        const serviceTypeIds = equipmentServiceTypeMap[eqId] || [];
        if (templates.length === 0) {
          return [{
            equipment_id: eqId,
            form_template_id: undefined as string | undefined,
            service_type_ids: serviceTypeIds,
          }];
        }
        return templates.map(tId => ({
          equipment_id: eqId,
          form_template_id: tId as string | undefined,
          service_type_ids: serviceTypeIds,
        }));
      }),
      ...selectedStandaloneTemplateIds.map(tId => ({
        equipment_id: undefined as string | undefined,
        form_template_id: tId as string | undefined,
      })),
    ];
    return {
      ...data,
      equipment_id: data.equipment_id || undefined,
      technician_id: techId,
      team_id: teamId,
      service_type_id: data.service_type_id === 'none' ? undefined : (data.service_type_id || undefined),
      service_type_ids:
        loadedServiceTypesSigRef.current !== null
        && JSON.stringify(selectedServiceTypeIds) !== loadedServiceTypesSigRef.current
          ? selectedServiceTypeIds
          : undefined,
      budget_items:
        loadedBudgetSigRef.current !== null
        && serviceOrderBudgetSignature(budgetItems) !== loadedBudgetSigRef.current
          ? budgetItems
          : undefined,
      scheduled_date: data.scheduled_date || undefined,
      scheduled_time: data.scheduled_time || undefined,
      form_template_id: equipmentTemplateMap[selectedEquipmentIds[0] || '']?.[0]
        || selectedStandaloneTemplateIds[0]
        || (data.form_template_id === 'none' ? undefined : (data.form_template_id || undefined)),
      assignee_user_ids: selectedAssigneeUserIds,
      // Duas travas antes de mandar o escopo:
      // 1) `scopeLoaded` evita apagar o escopo real da OS (equipamentos +
      //    checklists + respostas já preenchidas) numa corrida: salvar antes de
      //    `loadExistingEquipmentItems` terminar mandaria `[]` e destruiria tudo.
      // 2) assinatura igual à do banco = usuário não mexeu no escopo; mandar
      //    `undefined` deixa a RPC de escopo de fora do save (ver comentário do
      //    `loadedScopeSigRef`). Mudou de verdade — inclusive pra vazio — vai.
      equipment_items:
        scopeLoaded && scopeSignature(equipItems) !== loadedScopeSigRef.current
          ? equipItems
          : undefined,
      generate_nps_survey: generateNpsSurvey,
      ...serviceAddressPayload,
    };
  };

  const continueEditSubmit = async (data: ServiceOrderFormData, confirmedRemoval = false) => {
    // Check if this is a contract OS and date changed
    const isContractOS = !!(serviceOrder as any)?.contract_id;
    const isRecurrenceOS = !!(serviceOrder as any)?.recurrence_group_id;
    const dateChanged = data.scheduled_date !== serviceOrder?.scheduled_date;

    if (isContractOS && dateChanged) {
      setPendingEditData(data);
      setScopeRemovalConfirmed(confirmedRemoval);
      setContractDateDialogOpen(true);
      return;
    }

    // If this OS belongs to a recurrence group, ask if changes should apply to all
    if (isRecurrenceOS) {
      setPendingEditData(data);
      setScopeRemovalConfirmed(confirmedRemoval);
      setRecurrenceEditDialogOpen(true);
      return;
    }

    const cleanedData = await buildEditPayload(data);
    await onSubmit({
      ...cleanedData,
      ...(confirmedRemoval ? { confirm_scope_response_deletion: true } : {}),
    } as any);
    form.reset();
    onOpenChange(false);
  };

  const handleEditSubmit = async (data: ServiceOrderFormData) => {
    if (!serviceOrder) return;
    const payload = await buildEditPayload(data);
    if (payload.equipment_items !== undefined) {
      const { data: preview, error } = await supabase.rpc('preview_service_order_scope_removal' as any, {
        _service_order_id: serviceOrder.id,
        _items: groupScopeItems(payload.equipment_items) as any,
      });
      if (error) {
        editToast({ variant: 'destructive', title: t.scopeRemovalPreviewError, description: getErrorMessage(error) });
        return;
      }
      const answeredResponses = Number((preview as any)?.answered_responses ?? 0);
      const checklists = Number((preview as any)?.checklists ?? 0);
      if (answeredResponses > 0) {
        setScopeRemovalWarning({ data, answeredResponses, checklists, mode: 'continue' });
        return;
      }
    }
    await continueEditSubmit(data);
  };

  const handleContractDateChoice = async (applyToFuture: boolean) => {
    if (!pendingEditData || !serviceOrder) return;
    setContractDateDialogOpen(false);

    const cleanedData = await buildEditPayload(pendingEditData);
    await onSubmit({
      ...cleanedData,
      ...(scopeRemovalConfirmed ? { confirm_scope_response_deletion: true } : {}),
    } as any);

    if (applyToFuture) {
      try {
        const contractId = (serviceOrder as any).contract_id;
        const oldDate = serviceOrder.scheduled_date;
        const newDate = pendingEditData.scheduled_date;
        if (contractId && oldDate && newDate) {
          const diffMs = new Date(newDate + 'T12:00:00').getTime() - new Date(oldDate + 'T12:00:00').getTime();
          const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

          // Get all future service orders from the same contract
          const { data: futureOrders } = await supabase
            .from('service_orders')
            .select('id, scheduled_date')
            .eq('contract_id', contractId)
            .gt('scheduled_date', oldDate)
            .order('scheduled_date', { ascending: true });

          if (futureOrders && futureOrders.length > 0) {
            for (const os of futureOrders) {
              if (!os.scheduled_date) continue;
              const newOsDate = new Date(new Date(os.scheduled_date + 'T12:00:00').getTime() + diffDays * 24 * 60 * 60 * 1000);
              const formattedDate = newOsDate.toISOString().split('T')[0];

              await supabase
                .from('service_orders')
                .update({ scheduled_date: formattedDate })
                .eq('id', os.id);
            }
            editToast({ title: t.toastFutureAdjusted.replace('{n}', String(futureOrders.length)) });
          }
        }
      } catch (err: any) {
        editToast({ variant: 'destructive', title: t.toastErrorFutureDates, description: getErrorMessage(err) });
      }
    }

    setPendingEditData(null);
    setScopeRemovalConfirmed(false);
    form.reset();
    onOpenChange(false);
  };

  const handleRecurrenceEditChoice = async (applyToAll: boolean, confirmedFutureRemoval = false) => {
    if (!pendingEditData || !serviceOrder) return;

    const cleanedData = await buildEditPayload(pendingEditData);
    if (applyToAll && !confirmedFutureRemoval && cleanedData.equipment_items !== undefined) {
      const groupId = (serviceOrder as any).recurrence_group_id;
      const { data: groupOrders, error: groupError } = await supabase
        .from('service_orders')
        .select('id, scheduled_date')
        .eq('recurrence_group_id', groupId)
        .neq('id', serviceOrder.id);
      if (groupError) {
        editToast({ variant: 'destructive', title: t.scopeRemovalPreviewError, description: getErrorMessage(groupError) });
        return;
      }
      const todayStr = new Date().toISOString().split('T')[0];
      const futureOrders = (groupOrders ?? []).filter(order => order.scheduled_date && order.scheduled_date >= todayStr);
      const previews = await Promise.all(futureOrders.map(order => supabase.rpc('preview_service_order_scope_removal' as any, {
        _service_order_id: order.id,
        _items: groupScopeItems(cleanedData.equipment_items!) as any,
      })));
      const previewError = previews.find(result => result.error)?.error;
      if (previewError) {
        editToast({ variant: 'destructive', title: t.scopeRemovalPreviewError, description: getErrorMessage(previewError) });
        return;
      }
      const answeredResponses = previews.reduce((total, result) => total + Number((result.data as any)?.answered_responses ?? 0), 0);
      const checklists = previews.reduce((total, result) => total + Number((result.data as any)?.checklists ?? 0), 0);
      if (answeredResponses > 0) {
        setRecurrenceEditDialogOpen(false);
        setScopeRemovalWarning({
          data: pendingEditData,
          answeredResponses,
          checklists,
          mode: 'recurrence_all',
        });
        return;
      }
    }

    setRecurrenceEditDialogOpen(false);
    await onSubmit({
      ...cleanedData,
      ...((scopeRemovalConfirmed || confirmedFutureRemoval) ? { confirm_scope_response_deletion: true } : {}),
    } as any);

    if (applyToAll) {
      try {
        const groupId = (serviceOrder as any).recurrence_group_id;
        const { data: groupOrders } = await supabase
          .from('service_orders')
          .select('id, scheduled_date')
          .eq('recurrence_group_id', groupId)
          .neq('id', serviceOrder.id);

        if (groupOrders && groupOrders.length > 0) {
          const todayStr = new Date().toISOString().split('T')[0];
          const futureOrders = groupOrders.filter(o => o.scheduled_date && o.scheduled_date >= todayStr);

          if (futureOrders.length > 0) {
            const {
              scheduled_date,
              scheduled_time,
              service_type_ids,
              budget_items,
              equipment_items,
              ...editableFields
            } = cleanedData;
            const updatePayload = normalizeOptionalForeignKeys(editableFields, [
              'technician_id', 'team_id', 'customer_id', 'equipment_id', 'service_type_id', 'form_template_id',
            ] as any);

            for (const os of futureOrders) {
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
              if (service_type_ids !== undefined) {
                await syncServiceOrderServiceTypes(os.id, service_type_ids);
              }
              if (equipment_items !== undefined) {
                const { error: scopeError } = await supabase.rpc('sync_service_order_scope_with_services' as any, {
                  _service_order_id: os.id,
                  _items: groupScopeItems(equipment_items) as any,
                  _confirm_response_deletion: scopeRemovalConfirmed || confirmedFutureRemoval,
                });
                if (scopeError) throw scopeError;
              }
              if (budget_items !== undefined) {
                await syncServiceOrderBudget(os.id, budget_items);
              }
            }
          }
          queryClient.invalidateQueries({ queryKey: ['service-orders'] });
          editToast({ title: t.toastRecurrenceUpdated.replace('{n}', String(groupOrders.length + 1)) });
        }
      } catch (err: any) {
        editToast({ variant: 'destructive', title: t.toastErrorRecurrenceUpdate, description: getErrorMessage(err) });
      }
    }

    setPendingEditData(null);
    setScopeRemovalConfirmed(false);
    form.reset();
    onOpenChange(false);
  };

  // Troca de cliente (ou troca de modo cadastrado/avulso) invalida qualquer
  // seleção de equipamentos/checklists feita para o cliente anterior — senão um
  // equipamento marcado antes da troca segue no submit mesmo já não aparecendo
  // mais na lista (vazamento do bug 1.23.x).
  const resetEquipmentSelection = () => {
    setSelectedEquipmentIds([]);
    setEquipmentTemplateMap({});
    setEquipmentServiceTypeMap({});
    setExpandedEquipmentIds([]);
  };

  const toggleEquipment = (eqId: string) => {
    setSelectedEquipmentIds(prev => {
      if (prev.includes(eqId)) return prev.filter(id => id !== eqId);
      const serviceTypeIds = equipmentServiceTypeMap[eqId] ?? selectedServiceTypeIds;
      setEquipmentServiceTypeMap(current => ({ ...current, [eqId]: serviceTypeIds }));
      setEquipmentTemplateMap(current => ({
        ...current,
        [eqId]: reconcileEquipmentChecklistTemplateIds(
          templates,
          current[eqId] || [],
          serviceTypeIds,
          selectedServiceTypeIds,
        ),
      }));
      return [...prev, eqId];
    });
  };

  const toggleEquipmentExpanded = (eqId: string) => {
    setExpandedEquipmentIds(prev =>
      prev.includes(eqId) ? prev.filter(id => id !== eqId) : [...prev, eqId]
    );
  };

  const STEPS_WITH_LABELS = useMemo(() => [
    { key: 'client' as const, label: t.stepClient },
    { key: 'budget' as const, label: t.stepBudget },
    { key: 'equipment' as const, label: t.stepEquipment },
    { key: 'details' as const, label: t.stepDetails },
  ], [t.stepClient, t.stepBudget, t.stepEquipment, t.stepDetails]);

  // A etapa "Equipamentos e Checklists" agora sempre aparece: além do CRUD de
  // equipamentos (condicional ao tipo de serviço), ela hospeda os "Checklists
  // avulsos", que são sempre relevantes. Nunca some por completo.
  const activeSteps = useMemo(() => STEPS_WITH_LABELS, [STEPS_WITH_LABELS]);

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

  const handleServiceTypesChange = (ids: string[]) => {
    // Uma linha de serviço no orçamento também define o escopo operacional da
    // OS. Enquanto a linha existir, o tipo não pode desaparecer do seletor —
    // senão o valor seria faturado sem levar seus checklists/equipamentos.
    const reconciledIds = mergeServiceTypeIds(
      ids,
      budgetItems.map(item => item.service_type_id),
    );
    const addedIds = reconciledIds.filter(id => !selectedServiceTypeIds.includes(id));
    setSelectedServiceTypeIds(reconciledIds);
    form.setValue('service_type_id', reconciledIds[0] ?? '');

    // Serviço novo entra, por padrão, nos equipamentos já marcados. A partir daí
    // cada card pode ser refinado separadamente. Serviço removido da OS sai de
    // todos os equipamentos e seus checklists exclusivos deixam o escopo.
    const nextEquipmentServices = { ...equipmentServiceTypeMap };
    const nextEquipmentTemplates = { ...equipmentTemplateMap };
    for (const equipmentId of selectedEquipmentIds) {
      const currentIds = nextEquipmentServices[equipmentId] ?? selectedServiceTypeIds;
      let nextIds = Array.from(new Set([
        ...currentIds.filter(id => reconciledIds.includes(id)),
        ...addedIds,
      ]));
      if (nextIds.length === 0 && reconciledIds.length > 0) nextIds = [reconciledIds[0]];
      nextEquipmentServices[equipmentId] = nextIds;
      nextEquipmentTemplates[equipmentId] = reconcileEquipmentChecklistTemplateIds(
        templates,
        nextEquipmentTemplates[equipmentId] || [],
        nextIds,
        reconciledIds,
      );
    }
    setEquipmentServiceTypeMap(nextEquipmentServices);
    setEquipmentTemplateMap(nextEquipmentTemplates);
  };

  const handleEquipmentServicesChange = (equipmentId: string, ids: string[]) => {
    const nextIds = Array.from(new Set(ids.filter(id => selectedServiceTypeIds.includes(id))));
    // Enquanto a OS tiver serviços, todo equipamento precisa dizer ao menos um.
    if (selectedServiceTypeIds.length > 0 && nextIds.length === 0) return;

    setEquipmentServiceTypeMap(prev => ({ ...prev, [equipmentId]: nextIds }));
    setEquipmentTemplateMap(prev => ({
      ...prev,
      [equipmentId]: reconcileEquipmentChecklistTemplateIds(
        templates,
        prev[equipmentId] || [],
        nextIds,
        selectedServiceTypeIds,
      ),
    }));
  };

  const openCopyScope = (sourceEquipmentId: string) => {
    setCopySourceEquipmentId(sourceEquipmentId);
    setCopyTargetEquipmentIds(selectedEquipmentIds.filter(id => id !== sourceEquipmentId));
  };

  const applyCopiedScope = () => {
    if (!copySourceEquipmentId) return;
    const sourceServices = equipmentServiceTypeMap[copySourceEquipmentId] ?? selectedServiceTypeIds;
    const sourceTemplates = equipmentTemplateMap[copySourceEquipmentId] ?? [];
    setEquipmentServiceTypeMap(prev => ({
      ...prev,
      ...Object.fromEntries(copyTargetEquipmentIds.map(id => [id, [...sourceServices]])),
    }));
    setEquipmentTemplateMap(prev => ({
      ...prev,
      ...Object.fromEntries(copyTargetEquipmentIds.map(id => [id, [...sourceTemplates]])),
    }));
    editToast({
      title: t.copyScopeSuccess,
      description: t.copyScopeSuccessDescription.replace('{n}', String(copyTargetEquipmentIds.length)),
    });
    setCopySourceEquipmentId(null);
    setCopyTargetEquipmentIds([]);
  };

  const handleBudgetItemsChange = (items: ServiceOrderBudgetItem[]) => {
    setBudgetItems(items);
    const merged = mergeServiceTypeIds(
      selectedServiceTypeIds,
      items.map(item => item.service_type_id),
    );
    if (merged.length !== selectedServiceTypeIds.length) handleServiceTypesChange(merged);
  };

  // Bloco reutilizado nos dois modos (criar/editar): endereço de serviço próprio
  // da OS. Alavanca ligada revela campos estruturados (mesmo padrão do avulso).
  const serviceAddressSection = (
    <div className="rounded-lg bg-muted/30 p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Label className="cursor-default flex items-center gap-1.5 text-sm">
          <MapPinned className="h-4 w-4 text-primary" />
          {t.serviceAddressLabel}
        </Label>
        <LabeledSwitch
          value={useServiceAddress ? 'on' : 'off'}
          onChange={(v) => setUseServiceAddress(v === 'on')}
          off={{ value: 'off', label: t.switchNo }}
          on={{ value: 'on', label: t.switchYes }}
          aria-label={t.serviceAddressLabel}
        />
      </div>
      {useServiceAddress && (
        <div className="space-y-3 pt-1">
          <p className="text-xs text-muted-foreground">
            {t.serviceAddressNote}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t.labelZip}</Label>
              <CepLookup
                value={svcCep}
                onChange={setSvcCep}
                onAddressFound={(addr) => {
                  setSvcAddress(addr.logradouro);
                  setSvcNeighborhood(addr.bairro);
                  setSvcCity(addr.cidade);
                  setSvcState(addr.estado);
                }}
              />
            </div>
            <div>
              <Label>{t.labelNumber}</Label>
              <Input value={svcNumber} onChange={e => setSvcNumber(e.target.value)} placeholder={t.placeholderNumber} />
            </div>
            <div className="sm:col-span-2">
              <Label>{t.labelAddress}</Label>
              <AddressAutocomplete
                value={svcAddress}
                onChange={setSvcAddress}
                onAddressSelected={(addr) => {
                  setSvcAddress(addr.logradouro);
                  setSvcNeighborhood(addr.bairro);
                  setSvcCity(addr.cidade);
                  setSvcState(addr.estado);
                  if (addr.cep) {
                    const c = addr.cep.replace(/\D/g, '');
                    setSvcCep(c.length > 5 ? `${c.slice(0, 5)}-${c.slice(5)}` : c);
                  }
                }}
                placeholder={t.placeholderAddress}
              />
            </div>
            <div>
              <Label>{t.labelNeighborhood}</Label>
              <Input value={svcNeighborhood} onChange={e => setSvcNeighborhood(e.target.value)} placeholder={t.labelNeighborhood} />
            </div>
            <div className="sm:col-span-2">
              <Label>{t.labelStateCity}</Label>
              <StateCitySelector
                selectedState={svcState}
                selectedCity={svcCity}
                onStateChange={setSvcState}
                onCityChange={setSvcCity}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Bloco reutilizado nos dois modos (criar/editar): "Responsáveis" (técnicos /
  // equipes). Fica junto do agendamento na etapa "Agendamento e Detalhes".
  const assigneeSection = (
    <AssigneeMultiSelect
      technicians={technicians || []}
      teams={teamsWithMembers}
      selectedUserIds={selectedAssigneeUserIds}
      selectedTeamIds={selectedAssigneeTeamIds}
      onChangeUsers={setSelectedAssigneeUserIds}
      onChangeTeams={setSelectedAssigneeTeamIds}
      label={t.labelAssignees}
    />
  );

  const handleSchedulePlanChange = (plan: ServiceOrderScheduleSlot[]) => {
    const firstSlot = plan[0];
    form.setValue('schedule_plan', plan, { shouldDirty: true, shouldValidate: true });
    if (firstSlot) {
      form.setValue('scheduled_date', firstSlot.date, { shouldDirty: true });
      form.setValue('scheduled_time', firstSlot.time, { shouldDirty: true });
      form.setValue('duration_minutes', firstSlot.duration_minutes, { shouldDirty: true });
    }
  };

  const schedulePlanningSection = (
    <ServiceOrderSchedulePlanner
      plan={(watchedValues.schedule_plan ?? []) as ServiceOrderScheduleSlot[]}
      onChange={handleSchedulePlanChange}
      locale={locale}
      labels={{
        period: t.schedulePeriod,
        startDate: t.scheduleStartDate,
        endDate: t.scheduleEndDate,
        dailyPlan: t.dailySchedule,
        dailyPlanHelp: t.dailyScheduleHelp,
        applyFirstToAll: t.applyScheduleToAll,
        scheduledDaySingular: t.scheduledDaySingular,
        scheduledDayPlural: t.scheduledDayPlural,
        startTime: t.scheduleStartTime,
        endTime: t.scheduleEndTime,
        invalidTimeRange: t.scheduleInvalidTimeRange,
      }}
    />
  );

  const scopeSummary = (
    <section className="rounded-lg border bg-card p-3 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{t.scopeSummaryTitle}</h3>
        <p className="text-xs text-muted-foreground">{t.scopeSummaryDescription}</p>
      </div>
      {selectedEquipmentIds.length === 0 && selectedStandaloneTemplateIds.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.scopeSummaryEmpty}</p>
      ) : (
        <div className="divide-y">
          {selectedEquipmentIds.map(equipmentId => {
            const item = equipment.find(eq => eq.id === equipmentId);
            const services = (equipmentServiceTypeMap[equipmentId] ?? selectedServiceTypeIds)
              .map(id => serviceTypes.find(service => service.id === id))
              .filter((service): service is NonNullable<typeof service> => !!service);
            const checklistNames = (equipmentTemplateMap[equipmentId] ?? [])
              .map(id => templates.find(template => template.id === id)?.name)
              .filter((name): name is string => !!name);
            return (
              <div key={equipmentId} className="py-3 first:pt-0 last:pb-0 space-y-2">
                <p className="text-sm font-medium">{item?.name ?? t.checklistEquipmentFallback}</p>
                <div className="flex flex-wrap gap-1.5">
                  {services.map(service => (
                    <Badge key={service.id} variant="secondary" className="gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: service.color || '#64748b' }} />
                      {service.name}
                    </Badge>
                  ))}
                  {services.length === 0 && <span className="text-xs text-destructive">{t.scopeSummaryNoService}</span>}
                </div>
                <p className="text-xs text-muted-foreground">
                  <ClipboardList className="mr-1 inline h-3.5 w-3.5" />
                  {checklistNames.length > 0 ? checklistNames.join(' · ') : t.scopeSummaryNoChecklist}
                </p>
              </div>
            );
          })}
          {selectedStandaloneTemplateIds.length > 0 && (
            <div className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium">{t.standaloneSectionTitle}</p>
              <p className="text-xs text-muted-foreground">
                {selectedStandaloneTemplateIds
                  .map(id => templates.find(template => template.id === id)?.name)
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );

  // Etapa 2 completa — "Equipamentos e Checklists". Reunimos o CRUD de
  // equipamentos (cada um expansível com os checklists dele dentro, espelhando a
  // UX do EditOsScopeDrawer) e, logo abaixo, a seção fixa de "Checklists avulsos"
  // (sempre disponível). Usada de forma idêntica em criar e editar.
  const equipmentAndChecklistsStep = (
    <div className="space-y-5">
      {/* ── Equipamentos (condicional ao tipo de serviço exigir equipamento) ── */}
      {showEquipmentStep && (
        <div className="space-y-3">
          <Label className="text-sm font-medium flex items-center gap-1.5">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            {t.equipmentSectionTitle}
          </Label>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {equipment.length > 1 ? t.equipmentSelectMany : t.equipmentSelectOne}
            </p>
            <div className="flex items-center">
              {equipment.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(selectedCustomerId && 'rounded-r-none')}
                  onClick={() => {
                    if (selectedEquipmentIds.length === equipment.length) {
                      setSelectedEquipmentIds([]);
                    } else {
                      const ids = equipment.map(eq => eq.id);
                      setSelectedEquipmentIds(ids);
                      setEquipmentServiceTypeMap(prev => Object.fromEntries(
                        ids.map(id => [id, prev[id] ?? selectedServiceTypeIds]),
                      ));
                      setEquipmentTemplateMap(prev => Object.fromEntries(
                        ids.map(id => {
                          const serviceTypeIds = equipmentServiceTypeMap[id] ?? selectedServiceTypeIds;
                          return [
                            id,
                            reconcileEquipmentChecklistTemplateIds(
                              templates,
                              prev[id] || [],
                              serviceTypeIds,
                              selectedServiceTypeIds,
                            ),
                          ];
                        }),
                      ));
                    }
                  }}
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  {selectedEquipmentIds.length === equipment.length ? t.btnDeselectAll : t.btnSelectAll}
                </Button>
              )}
              {selectedCustomerId && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t.btnCreateEquipment}
                  title={t.btnCreateEquipment}
                  onClick={() => setQuickCreateOpen(true)}
                  className={cn(
                    'h-9 w-9 shrink-0 bg-muted hover:bg-primary hover:text-primary-foreground',
                    equipment.length > 1 && 'rounded-l-none border-l-0',
                  )}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {equipment.length === 0 && selectedCustomerId && (
            <p className="text-sm text-muted-foreground">{t.equipmentNone}</p>
          )}
          {!selectedCustomerId && (
            <p className="text-sm text-muted-foreground">
              {customerMode === 'adhoc' ? t.equipmentAdhocNote : t.equipmentSelectFirst}
            </p>
          )}

          <div className="space-y-2 max-h-[340px] overflow-y-auto">
            {equipment.map((eq) => {
              const checked = selectedEquipmentIds.includes(eq.id);
              const expanded = expandedEquipmentIds.includes(eq.id);
              const selectedTemplates = equipmentTemplateMap[eq.id] || [];
              const equipmentServiceTypeIds = equipmentServiceTypeMap[eq.id] ?? selectedServiceTypeIds;
              const equipmentTemplates = templates.filter(template => checklistMatchesEquipmentServices(
                template,
                equipmentServiceTypeIds,
                selectedServiceTypeIds,
              ));
              const availableTemplates = equipmentTemplates.filter(tmpl => !selectedTemplates.includes(tmpl.id));
              const equipmentServices = equipmentServiceTypeIds
                .map(serviceId => serviceTypes.find(service => service.id === serviceId))
                .filter((service): service is NonNullable<typeof service> => !!service);
              const availableEquipmentServices = selectedServiceTypeIds
                .filter(serviceId => !equipmentServiceTypeIds.includes(serviceId))
                .map(serviceId => serviceTypes.find(service => service.id === serviceId))
                .filter((service): service is NonNullable<typeof service> => !!service);
              return (
                <div
                  key={eq.id}
                  className={cn(
                    'rounded-lg transition-colors',
                    checked ? 'border border-primary bg-primary/5' : 'bg-muted/30'
                  )}
                >
                  {/* Linha do equipamento — seleção + expandir */}
                  <div className="flex items-center gap-3 p-3">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        toggleEquipment(eq.id);
                        // Ao selecionar, já abre o painel de checklists.
                        if (v && !expandedEquipmentIds.includes(eq.id)) {
                          setExpandedEquipmentIds(prev => [...prev, eq.id]);
                        }
                      }}
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
                        {[eq.brand, eq.model].filter(Boolean).join(' - ') || t.equipmentNoDetails}
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
                    {checked && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 gap-1 text-xs text-muted-foreground"
                        onClick={() => toggleEquipmentExpanded(eq.id)}
                        aria-expanded={expanded}
                      >
                        <ClipboardList className="h-3.5 w-3.5" />
                        {selectedTemplates.length > 0
                          ? t.equipmentChecklistCount.replace('{n}', String(selectedTemplates.length))
                          : t.equipmentChecklistToggle}
                        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
                      </Button>
                    )}
                  </div>

                  {/* Painel expansível de checklists deste equipamento */}
                  {checked && expanded && (
                    <div className="border-t px-3 py-3 space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                              {t.equipmentServicesTitle}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t.equipmentServicesHelp}
                            </p>
                          </div>
                          {selectedEquipmentIds.length > 1 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 shrink-0 gap-1.5 text-xs"
                              onClick={() => openCopyScope(eq.id)}
                            >
                              <Copy className="h-3.5 w-3.5" />
                              {t.copyScopeButton}
                            </Button>
                          )}
                        </div>
                        {equipmentServices.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {equipmentServices.map(service => (
                              <Badge
                                key={service.id}
                                variant="secondary"
                                className="h-7 gap-1.5 pl-2 pr-1 text-xs font-medium"
                              >
                                <span
                                  className="h-2 w-2 rounded-full shrink-0"
                                  style={{ backgroundColor: service.color || '#64748b' }}
                                />
                                <span className="max-w-48 truncate">{service.name}</span>
                                <button
                                  type="button"
                                  className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                                  disabled={equipmentServiceTypeIds.length === 1 && selectedServiceTypeIds.length > 0}
                                  title={equipmentServiceTypeIds.length === 1 ? t.equipmentServiceRequired : `${t.btnRemoveEquipmentService} ${service.name}`}
                                  aria-label={`${t.btnRemoveEquipmentService} ${service.name}`}
                                  onClick={() => handleEquipmentServicesChange(
                                    eq.id,
                                    equipmentServiceTypeIds.filter(id => id !== service.id),
                                  )}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">{t.equipmentServicesEmpty}</p>
                        )}
                        {availableEquipmentServices.length > 0 && (
                          <SearchableSelect
                            value=""
                            onValueChange={(value) => {
                              if (value && value !== 'none') {
                                handleEquipmentServicesChange(eq.id, [...equipmentServiceTypeIds, value]);
                              }
                            }}
                            options={availableEquipmentServices.map(service => ({
                              value: service.id,
                              label: service.name,
                            }))}
                            placeholder={t.placeholderAddEquipmentService}
                            searchPlaceholder={t.searchServicePlaceholder}
                            emptyMessage={t.noServicesFound}
                          />
                        )}
                      </div>

                      <div className="border-t border-border/60 pt-3 space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                          {t.equipmentChecklistsTitle}
                        </p>
                      {selectedTemplates.length > 0 && (
                        <div className="space-y-2">
                          {selectedTemplates.map(tId => {
                            const tmpl = templates.find(item => item.id === tId);
                            const linkedServices = (tmpl?.service_type_ids ?? [])
                              .map(serviceId => serviceTypes.find(service => service.id === serviceId))
                              .filter((service): service is NonNullable<typeof service> => (
                                !!service && equipmentServiceTypeIds.includes(service.id)
                              ));
                            return (
                              <div key={tId} className="flex items-start gap-2 rounded-lg border bg-card px-2.5 py-2 shadow-sm">
                                <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                <div className="min-w-0 flex-1 space-y-1">
                                  <p className="text-sm font-medium leading-5">{tmpl?.name || t.checklistStandalone}</p>
                                  {linkedServices.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {linkedServices.map(service => (
                                        <Badge key={service.id} variant="secondary" className="gap-1 px-1.5 py-0 text-[10px] font-medium">
                                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: service.color || '#64748b' }} />
                                          {service.name}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 shrink-0"
                                  title={t.btnPreviewChecklist}
                                  aria-label={`${t.btnPreviewChecklist}: ${tmpl?.name || t.checklistStandalone}`}
                                  onClick={() => setPreviewTemplateId(tId)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                  title={`Remover ${tmpl?.name || t.checklistStandalone}`}
                                  aria-label={`Remover ${tmpl?.name || t.checklistStandalone}`}
                                  onClick={() => setEquipmentTemplateMap(prev => ({
                                    ...prev,
                                    [eq.id]: (prev[eq.id] || []).filter(id => id !== tId),
                                  }))}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <SearchableSelect
                          className="flex-1"
                          value=""
                          onValueChange={(v) => {
                            if (v && v !== 'none' && !(equipmentTemplateMap[eq.id] || []).includes(v)) {
                              setEquipmentTemplateMap(prev => ({
                                ...prev,
                                [eq.id]: [...(prev[eq.id] || []), v],
                              }));
                            }
                          }}
                          options={availableTemplates.map((tmpl) => ({
                            value: tmpl.id,
                            label: `${tmpl.name} (${tmpl.questions?.length || 0} ${t.checklistQuestionCount.replace('{n}', '').trim()})`,
                          }))}
                          placeholder={t.placeholderAddChecklist}
                          searchPlaceholder={t.searchChecklistPlaceholder}
                          emptyMessage={t.checklistNoneAvailable}
                        />
                      </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* ── Checklists avulsos — seção fixa, sempre disponível ── */}
      <div className="space-y-3">
        {showEquipmentStep && <div className="border-t border-border/40" />}
        <div className="space-y-1">
          <Label className="text-sm font-medium flex items-center gap-1.5">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            {t.standaloneSectionTitle}
          </Label>
          <p className="text-xs text-muted-foreground">{t.standaloneSectionHint}</p>
        </div>
        {selectedStandaloneTemplateIds.length > 0 && (
          <div className="space-y-2">
            {selectedStandaloneTemplateIds.map(tId => {
              const tmpl = filteredTemplates.find(item => item.id === tId);
              const linkedServices = (tmpl?.service_type_ids ?? [])
                .map(serviceId => serviceTypes.find(service => service.id === serviceId))
                .filter((service): service is NonNullable<typeof service> => !!service);
              return (
                <div key={tId} className="flex items-start gap-2 rounded-lg border bg-card px-2.5 py-2 shadow-sm">
                  <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium leading-5">{tmpl?.name || t.checklistStandalone}</p>
                    {linkedServices.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {linkedServices.map(service => (
                          <Badge key={service.id} variant="secondary" className="gap-1 px-1.5 py-0 text-[10px] font-medium">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: service.color || '#64748b' }} />
                            {service.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" title={t.btnPreview} onClick={() => setPreviewTemplateId(tId)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    title={`Remover ${tmpl?.name || t.checklistStandalone}`}
                    aria-label={`Remover ${tmpl?.name || t.checklistStandalone}`}
                    onClick={() => setSelectedStandaloneTemplateIds(prev => prev.filter(id => id !== tId))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex gap-2 items-center">
          <SearchableSelect
            className="flex-1"
            value=""
            onValueChange={(v) => { if (v && v !== 'none' && !selectedStandaloneTemplateIds.includes(v)) setSelectedStandaloneTemplateIds(prev => [...prev, v]); }}
            options={filteredTemplates.filter(tmpl => !selectedStandaloneTemplateIds.includes(tmpl.id)).map((tmpl) => ({
              value: tmpl.id,
              label: `${tmpl.name} (${tmpl.questions?.length || 0} ${t.checklistQuestionCount.replace('{n}', '').trim()})`,
            }))}
            placeholder={t.placeholderAddChecklist}
            searchPlaceholder={t.searchChecklistPlaceholder}
            emptyMessage={t.checklistNoneAvailable}
          />
        </div>
      </div>

      <AlertDialog open={!!copySourceEquipmentId} onOpenChange={(value) => { if (!value) setCopySourceEquipmentId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.copyScopeTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.copyScopeDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-64 space-y-2 overflow-y-auto py-1">
            {selectedEquipmentIds.filter(id => id !== copySourceEquipmentId).map(id => {
              const item = equipment.find(eq => eq.id === id);
              return (
                <label key={id} className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5">
                  <Checkbox
                    checked={copyTargetEquipmentIds.includes(id)}
                    onCheckedChange={() => setCopyTargetEquipmentIds(prev => (
                      prev.includes(id) ? prev.filter(value => value !== id) : [...prev, id]
                    ))}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{item?.name ?? t.checklistEquipmentFallback}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[item?.brand, item?.model, item?.identifier].filter(Boolean).join(' · ') || t.equipmentNoDetails}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.btnCancel}</AlertDialogCancel>
            <AlertDialogAction disabled={copyTargetEquipmentIds.length === 0} onClick={applyCopiedScope}>
              {t.copyScopeConfirm.replace('{n}', String(copyTargetEquipmentIds.length))}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  // Edit mode: same multi-step form as create
  if (serviceOrder) {
    const editFooter = (
      <div className="flex justify-between w-full">
        <div>
          {step > 0 && (
            <Button type="button" variant="outline" onClick={goBack}>
              <ChevronLeft className="mr-2 h-4 w-4" />
              {t.btnBack}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t.btnCancel}
          </Button>
          {isLastStep ? (
            <Button type="submit" form="os-edit-form" disabled={isLoading} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t.btnSave}
            </Button>
          ) : (
            <Button type="button" onClick={(e) => { e.preventDefault(); goNext(); }} disabled={!canGoNext()}>
              {t.btnNext}
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );

    return (
      <>
      <ResponsiveModal open={open} onOpenChange={onOpenChange} title={t.titleEdit} className="sm:max-w-[920px]" footer={editFooter}>
        {isPmocOrder && (
          <PmocComplianceBadge variant="ribbon" withTooltip className="mb-4" />
        )}
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
          <form id="os-edit-form" onSubmit={(e) => { e.preventDefault(); if (isLastStep) form.handleSubmit(handleEditSubmit)(); }} className="space-y-4">
            <StepTransition stepKey={currentStepKey} index={step} className="space-y-4">
            {/* Step 1: Client & Service */}
            {currentStepKey === 'client' && (
              <div className="space-y-4">
                <FormField control={form.control} name="customer_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.labelCustomer}</FormLabel>
                    <FormControl>
                      <CustomerSelectField
                        customers={customers}
                        value={field.value}
                        onValueChange={(v) => { field.onChange(v); setSelectedCustomerId(v); form.setValue('equipment_id', ''); resetEquipmentSelection(); }}
                        placeholder={t.placeholderSelectCustomer}
                        searchPlaceholder={t.placeholderSearchCustomer}
                        requireDocument={false}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Endereço de serviço (diferente do cliente) — alternativa ao endereço do cliente */}
                {serviceAddressSection}

                <FormField control={form.control} name="service_type_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.labelServiceType}</FormLabel>
                    <FormControl>
                      <ServiceTypesMultiSelect
                        services={serviceTypes.filter(st => st.is_active)}
                        selectedIds={selectedServiceTypeIds}
                        onChange={handleServiceTypesChange}
                        lockedIds={budgetItems.map(item => item.service_type_id).filter((id): id is string => !!id)}
                        onCreate={() => setQuickCreateServiceTypeOpen(true)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            )}

            {currentStepKey === 'budget' && (
              <ServiceOrderBudgetSection
                items={budgetItems}
                onChange={handleBudgetItemsChange}
                loading={isEditing && budgetQuery.isLoading}
              />
            )}

            {/* Step 2: Equipamentos e Checklists */}
            {currentStepKey === 'equipment' && equipmentAndChecklistsStep}

            {/* Step 3: Agendamento e Detalhes */}
            {currentStepKey === 'details' && (
              <div className="space-y-4">
                {scopeSummary}
                {assigneeSection}
                {schedulePlanningSection}

                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.labelDescription}</FormLabel>
                    {isPmocOrder && (
                      <NoticeBanner variant="warning">{t.pmocDescriptionWarning}</NoticeBanner>
                    )}
                    <FormControl><Textarea placeholder={t.placeholderDescription} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem><FormLabel>{t.labelNotes}</FormLabel><FormControl><Textarea placeholder={t.placeholderNotes} {...field} /></FormControl><FormMessage /></FormItem>
                )} />

                {/* Consumo de estoque (v1.22.0) — bloco somente leitura pra gestão,
                    que abre a OS pela AGENDA. Tem que ficar neste bloco (o de dentro
                    do `if (serviceOrder)`, modo edição); o bloco de baixo é o de
                    CRIAÇÃO e lá `isEditing` nunca é true, então não renderiza nada.
                    Some sozinho quando não há material lançado. */}
                {serviceOrder?.id && <OsMaterialsSection serviceOrderId={serviceOrder.id} />}

                {/* Pesquisa de Satisfação (NPS) ao finalizar */}
                <div className="flex items-center justify-between gap-3 border-t pt-3">
                  <Label className="cursor-default flex items-center gap-1.5 text-sm">
                    <Star className="h-4 w-4 text-warning" />
                    {t.npsLabel}
                  </Label>
                  <LabeledSwitch
                    value={generateNpsSurvey ? 'on' : 'off'}
                    onChange={(v) => setGenerateNpsSurvey(v === 'on')}
                    off={{ value: 'off', label: t.switchNo }}
                    on={{ value: 'on', label: t.switchYes }}
                    aria-label={t.npsLabel}
                  />
                </div>
              </div>
            )}
            </StepTransition>
          </form>
        </Form>
      </ResponsiveModal>

      {/* Contract date propagation dialog */}
      <AlertDialog open={contractDateDialogOpen} onOpenChange={setContractDateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.contractDateDialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.contractDateDialogDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => { setPendingEditData(null); }}>
              {t.btnCancel}
            </AlertDialogCancel>
            <AlertDialogAction className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => handleContractDateChoice(false)}>
              {t.contractDateOnlyThis}
            </AlertDialogAction>
            <AlertDialogAction onClick={() => handleContractDateChoice(true)}>
              {t.contractDateThisAndFuture}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Recurrence group edit dialog */}
      <AlertDialog open={recurrenceEditDialogOpen} onOpenChange={setRecurrenceEditDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.recurrenceEditDialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.recurrenceEditDialogDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => { setPendingEditData(null); }}>
              {t.btnCancel}
            </AlertDialogCancel>
            <AlertDialogAction className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => handleRecurrenceEditChoice(false)}>
              {t.recurrenceEditOnlyThis}
            </AlertDialogAction>
            <AlertDialogAction onClick={() => handleRecurrenceEditChoice(true)}>
              {t.recurrenceEditAll}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!scopeRemovalWarning} onOpenChange={(value) => { if (!value) setScopeRemovalWarning(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.scopeRemovalTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.scopeRemovalDescription
                .replace('{answers}', String(scopeRemovalWarning?.answeredResponses ?? 0))
                .replace('{checklists}', String(scopeRemovalWarning?.checklists ?? 0))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <NoticeBanner variant="warning">{t.scopeRemovalWarning}</NoticeBanner>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.btnCancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const warning = scopeRemovalWarning;
                const pending = warning?.data;
                setScopeRemovalWarning(null);
                if (warning?.mode === 'recurrence_all') {
                  void handleRecurrenceEditChoice(true, true);
                } else if (pending) {
                  void continueEditSubmit(pending, true);
                }
              }}
            >
              {t.scopeRemovalConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </>
    );
  }

  const createFooter = (
    <div className="flex justify-between w-full">
      <div>
        {step > 0 && (
          <Button type="button" variant="outline" onClick={goBack}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            {t.btnBack}
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          {t.btnCancel}
        </Button>
        {isLastStep ? (
          <Button type="submit" form="os-create-form" disabled={isLoading} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {recurrenceEnabled ? t.btnCreateRecurring : t.btnCreate}
          </Button>
        ) : (
          <Button type="button" onClick={(e) => { e.preventDefault(); goNext(); }} disabled={!canGoNext()}>
            {t.btnNext}
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={t.titleCreate} className="sm:max-w-[920px]" footer={createFooter}>
      <DraftResumeDialog
        open={draft.showResumePrompt}
        onResume={() => {
          if (draft.draftData) {
            const { _selectedCustomerId, _selectedServiceTypeIds, _budgetItems, ...formValues } = draft.draftData;
            form.reset({
              ...formValues,
              schedule_plan: formValues.schedule_plan?.length ? formValues.schedule_plan : computedSchedulePlan,
            });
            if (_selectedCustomerId) setSelectedCustomerId(_selectedCustomerId);
            if (_selectedServiceTypeIds) {
              setSelectedServiceTypeIds(_selectedServiceTypeIds);
              form.setValue('service_type_id', _selectedServiceTypeIds[0] ?? '');
            }
            if (_budgetItems) setBudgetItems(_budgetItems);
          }
          draft.acceptDraft();
        }}
        onDiscard={() => {
          draft.discardDraft();
          form.reset({
            customer_id: '', equipment_id: '', technician_id: '',
            os_type: 'manutencao_corretiva', service_type_id: '',
            scheduled_date: computedDate, scheduled_time: computedTime,
            duration_minutes: 120, schedule_plan: computedSchedulePlan, description: '', notes: '', form_template_id: '',
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
        <form id="os-create-form" onSubmit={(e) => { e.preventDefault(); if (isLastStep) handleCreateSubmit(); }} className="space-y-4">
          <StepTransition stepKey={currentStepKey} index={step} className="space-y-4">
          {/* Step 1: Client & Service */}
          {currentStepKey === 'client' && (
            <div className="space-y-4">
              {/* Customer mode toggle — alavanca centralizada */}
              <div className="flex justify-center">
                <LabeledSwitch
                  value={customerMode}
                  onChange={(v) => {
                    if (v === 'existing') {
                      setCustomerMode('existing');
                    } else {
                      setCustomerMode('adhoc');
                      form.setValue('customer_id', '');
                      setSelectedCustomerId(undefined);
                      resetEquipmentSelection();
                    }
                  }}
                  off={{ value: 'existing', label: t.customerRegistered }}
                  on={{ value: 'adhoc', label: t.customerAdhoc }}
                  aria-label={t.customerRegistered}
                />
              </div>

              {customerMode === 'existing' ? (
                <FormField control={form.control} name="customer_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.labelCustomer}</FormLabel>
                    <FormControl>
                      <CustomerSelectField
                        customers={customers}
                        value={field.value}
                        onValueChange={(v) => { field.onChange(v); setSelectedCustomerId(v); resetEquipmentSelection(); }}
                        placeholder={t.placeholderSelectCustomer}
                        searchPlaceholder={t.placeholderSearchCustomer}
                        onCreateFull={() => setQuickCreateCustomerOpen(true)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              ) : (
                <div className="space-y-3 rounded-lg bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">{t.adhocNote}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label>{t.labelName}</Label>
                      <Input value={adhocName} onChange={e => setAdhocName(e.target.value)} placeholder={t.labelName.replace(' *', '')} />
                    </div>
                    <div>
                      <Label>{t.labelPhone}</Label>
                      <Input value={adhocPhone} onChange={e => setAdhocPhone(e.target.value)} placeholder="(00) 00000-0000" />
                    </div>
                    <div>
                      <Label>{t.labelZip}</Label>
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
                      <Label>{t.labelAddress}</Label>
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
                        placeholder={t.placeholderAddress}
                      />
                    </div>
                    <div>
                      <Label>{t.labelNeighborhood}</Label>
                      <Input value={adhocNeighborhood} onChange={e => setAdhocNeighborhood(e.target.value)} placeholder={t.labelNeighborhood} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>{t.labelStateCity}</Label>
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

              {/* Endereço de serviço (diferente do cliente) — alternativa ao endereço do cliente */}
              {serviceAddressSection}

              <FormField control={form.control} name="service_type_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.labelServiceType}</FormLabel>
                  <FormControl>
                    <ServiceTypesMultiSelect
                      services={serviceTypes.filter(st => st.is_active)}
                      selectedIds={selectedServiceTypeIds}
                      onChange={handleServiceTypesChange}
                      lockedIds={budgetItems.map(item => item.service_type_id).filter((id): id is string => !!id)}
                      onCreate={() => setQuickCreateServiceTypeOpen(true)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          )}

          {currentStepKey === 'budget' && (
            <ServiceOrderBudgetSection
              items={budgetItems}
              onChange={handleBudgetItemsChange}
            />
          )}

          {/* Step 2: Equipamentos e Checklists */}
          {currentStepKey === 'equipment' && equipmentAndChecklistsStep}

          {/* Step 3: Agendamento e Detalhes */}
          {currentStepKey === 'details' && (
            <div className="space-y-4">
              {scopeSummary}
              {assigneeSection}
              {schedulePlanningSection}

              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>{t.labelDescription}</FormLabel><FormControl><Textarea placeholder={t.placeholderDescription} {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>{t.labelNotes}</FormLabel><FormControl><Textarea placeholder={t.placeholderNotes} {...field} /></FormControl><FormMessage /></FormItem>
              )} />

              {/* Recurrence */}
              <div className="rounded-lg bg-muted/30 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Switch checked={recurrenceEnabled} onCheckedChange={setRecurrenceEnabled} />
                  <Label className="cursor-pointer flex items-center gap-1.5">
                    <Repeat className="h-4 w-4" />
                    {t.recurrenceLabel}
                  </Label>
                </div>
                {recurrenceEnabled && (
                  <div className="space-y-3 pt-1">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t.recurrenceFrequency}</Label>
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
                        <Label className="text-xs">{t.recurrenceEvery}</Label>
                        <div className="flex items-center gap-1.5">
                          <NumericInput value={String(recurrenceInterval ?? '')} onValueChange={(v) => setRecurrenceInterval(Number(v) || 0)} />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {recurrenceType === 'daily' ? t.recurrenceUnitDays :
                             recurrenceType === 'monthly' ? t.recurrenceUnitMonths :
                             recurrenceType === 'yearly' ? t.recurrenceUnitYears :
                             t.recurrenceUnitWeeks}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">
                          {t.recurrenceUntil} <span className="text-destructive">*</span>
                        </Label>
                        <DatePicker
                          value={recurrenceEndDate}
                          onValueChange={setRecurrenceEndDate}
                          placeholder={MESSAGES[locale].app.common.datePicker.placeholder}
                          ariaInvalid={!recurrenceEndDate}
                        />
                      </div>
                    </div>
                    {(recurrenceType === 'custom' || recurrenceType === 'weekly') && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t.recurrenceRepeatOn}</Label>
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

                    {/* Prévia/bloqueio da série — a escolha do usuário nunca é
                        descartada em silêncio. */}
                    {recurrencePreview?.error && (
                      <p className="flex items-start gap-1.5 text-xs text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>{recurrencePreview.error}</span>
                      </p>
                    )}
                    {recurrencePreview?.text && (
                      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <Repeat className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>{recurrencePreview.text}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Pesquisa de Satisfação (NPS) ao finalizar */}
              <div className="flex items-center justify-between gap-3 border-t pt-3">
                <Label className="cursor-default flex items-center gap-1.5 text-sm">
                  <Star className="h-4 w-4 text-warning" />
                  {t.npsLabel}
                </Label>
                <LabeledSwitch
                  value={generateNpsSurvey ? 'on' : 'off'}
                  onChange={(v) => setGenerateNpsSurvey(v === 'on')}
                  off={{ value: 'off', label: t.switchNo }}
                  on={{ value: 'on', label: t.switchYes }}
                  aria-label={t.npsLabel}
                />
              </div>
            </div>
          )}
          </StepTransition>
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
            const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
            const company_id = await getCurrentUserCompanyId();
            const { data: created, error } = await supabase.from('equipment').insert({ ...data, company_id } as any).select().single();
            if (!error && created) {
              setSelectedEquipmentIds(prev => [...prev, (created as any).id]);
            }
          }}
          customers={[customers.find(c => c.id === selectedCustomerId)!].filter(Boolean)}
          isLoading={false}
        />
      )}

      {/* Quick create customer — nasce "Serviço" (criado de dentro de uma OS). */}
      <CustomerFormDialog
        open={quickCreateCustomerOpen}
        onOpenChange={setQuickCreateCustomerOpen}
        defaultCustomerKind="servico"
        onSubmit={async (data: any) => {
          const result = await createCustomer.mutateAsync(data);
          if (result) {
            const newId = (result as any).id;
            form.setValue('customer_id', newId);
            setSelectedCustomerId(newId);
            resetEquipmentSelection();
          }
          return result;
        }}
        isLoading={createCustomer.isPending}
      />

      {/* Quick create service type */}
      <QuickServiceTypeDialog
        open={quickCreateServiceTypeOpen}
        onOpenChange={setQuickCreateServiceTypeOpen}
        onCreated={(created) => {
          // A lista de tipos já é invalidada pela mutation; seleciona o recém-criado.
          handleServiceTypesChange([...selectedServiceTypeIds, created.id]);
        }}
      />

      {/* Checklist preview */}
      <ChecklistPreviewDialog
        templateId={previewTemplateId}
        open={!!previewTemplateId}
        onOpenChange={(o) => { if (!o) setPreviewTemplateId(null); }}
        templates={templates}
      />
    </ResponsiveModal>
  );
}

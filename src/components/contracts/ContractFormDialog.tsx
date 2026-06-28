import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Progress } from '@/components/ui/progress';
import { AssigneeMultiSelect } from '@/components/schedule/AssigneeMultiSelect';
import { useContracts, useContractPlanActivities, generateOccurrences, getFrequencyLabel, type PlanActivityInput, type FreqCode, activityPeriodMonths, generateGroupedVisits, REGENERABLE_OS_STATUSES } from '@/hooks/useContracts';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { StepTransition } from '@/components/ui/step-transition';
import { DraftResumeDialog } from '@/components/ui/DraftResumeDialog';
import { useFormDraft } from '@/hooks/useFormDraft';
import { useCustomers, CustomerInput } from '@/hooks/useCustomers';
import { CustomerFormDialog } from '@/components/customers/CustomerFormDialog';
import { useEquipment } from '@/hooks/useEquipment';
import { useEquipmentCategories } from '@/hooks/useEquipmentCategories';
import { EquipmentFormDialog } from '@/components/customers/EquipmentFormDialog';
import { useTechnicians, useProfiles } from '@/hooks/useProfiles';
import { useTeams } from '@/hooks/useTeams';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { getErrorMessage } from '@/utils/errorMessages';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { useResponsibleTechnicians } from '@/hooks/useResponsibleTechnicians';
import { usePmocActivityCatalog, type PmocCatalogActivity, PMOC_DEFAULT_SECTION } from '@/hooks/usePmocActivityCatalog';
import {
  type PmocMachineScope,
  type PlanActivityRow,
  type MachineConfig,
  START_VISIT_OPTIONS,
  startVisitLabel,
  firstVisitContents,
  machineCatalogActivities,
  catalogToPlanRow,
  planRowToInput,
  planRowToFreqCode,
  buildDefaultMachineConfig as buildDefaultMachineConfigShared,
  reconstructMachineConfigs,
  buildPmocPlanFromMachines,
  buildPmocItemsWithScope,
} from '@/components/contracts/pmocMachineRoutine';
import { PmocChecklistPicker } from '@/components/contracts/PmocChecklistPicker';
import { CommonChecklistEditor, type ChecklistTemplateOption } from '@/components/contracts/CommonChecklistEditor';
import { isEveryVisit } from '@/components/contracts/questionFrequency';
import { AreaCalculatorModal } from '@/components/contracts/AreaCalculatorModal';
import { CargaTermicaCalculatorModal } from '@/components/contracts/CargaTermicaCalculatorModal';
import { EquipmentAvatar } from '@/components/contracts/EquipmentAvatar';
import { EnvironmentPhotoField } from '@/components/contracts/EnvironmentPhotoField';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { PmocQuickCreateRTDialog } from '@/components/pmoc/PmocQuickCreateRTDialog';
import { autoGeneratePmocDocsV1 } from '@/hooks/useGeneratePmocDocument';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, ChevronDown, Check, Search, Plus, CalendarCheck, AlertTriangle, ShieldCheck, ExternalLink, Info, Trash2, Wrench, Lock, HelpCircle, Loader2, Calculator } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/mobile/EmptyState';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ContractFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (contractId: string) => void;
  editContract?: any;
  defaultCustomerId?: string;
}

// A etapa `items` é contextual: contrato PMOC organiza por AMBIENTES; contrato
// comum mantém a lista FLAT de equipamentos/itens. Ela vem ANTES da frequência
// (escolher os equipamentos antes de cadenciar). A etapa `team` (Equipe &
// Cobrança) reúne técnicos, cobrança, tipo de serviço, checklist, observações e
// status — desafogando a Identificação.
const STEPS_COMMON = [
  { key: 'info', label: 'Identificação' },
  { key: 'items', label: 'Ambientes e Equipamentos' },
  { key: 'frequency', label: 'Frequência' },
  { key: 'team', label: 'Equipe & Cobrança' },
  { key: 'review', label: 'Revisão' },
];
const STEPS_PMOC = [
  { key: 'info', label: 'Identificação' },
  { key: 'unit', label: 'Unidade & RT' },
  { key: 'items', label: 'Ambientes e Equipamentos' },
  { key: 'frequency', label: 'Frequência' },
  { key: 'team', label: 'Equipe & Cobrança' },
  { key: 'review', label: 'Revisão' },
];

const QUICK_MONTHS = [
  { label: 'Mensal', value: 1 },
  { label: 'Bimestral', value: 2 },
  { label: 'Trimestral', value: 3 },
  { label: 'Semestral', value: 6 },
  { label: 'Anual', value: 12 },
];

const QUICK_DAYS = [
  { label: 'Semanal', value: 7 },
  { label: 'Quinzenal', value: 15 },
  { label: '30 dias', value: 30 },
  { label: '45 dias', value: 45 },
  { label: '60 dias', value: 60 },
  { label: '90 dias', value: 90 },
];

// Frequências por serviço (notação da norma PMOC, vale pra qualquer contrato).
// 'E' (eventual) é registrado mas não entra no cronograma automático.
const ACTIVITY_FREQ_OPTIONS: { code: FreqCode; label: string }[] = [
  { code: 'M', label: 'Mensal' },
  { code: 'T', label: 'Trimestral' },
  { code: 'S', label: 'Semestral' },
  { code: 'A', label: 'Anual' },
  { code: 'E', label: 'Eventual' },
];

// Rotina POR MÁQUINA (escopo/fase/checklists do catálogo) e helpers do plano
// vivem em @/components/contracts/pmocMachineRoutine (fonte ÚNICA compartilhada
// com a aba Ambientes). Tipos PmocMachineScope/MachineConfig/PlanActivityRow,
// constantes (LOCAL_SCOPE_SECTIONS, AC_EQUIPMENT_SECTIONS, START_VISIT_OPTIONS) e
// funções (machineCatalogActivities, catalogToPlanRow, planRowToInput,
// reconstructMachineConfigs, buildPmocPlanFromMachines, buildPmocItemsWithScope…)
// são importados acima.

// Parse de input numérico no padrão BR (vírgula decimal) → number | null.
// String vazia/só espaço → null. Valor inválido → null (não trava o submit).
function parseDecimalBR(raw: string): number | null {
  const t = (raw ?? '').trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Parse de inteiro (ocupantes). Vazio → null; inválido → null.
function parseIntOrNull(raw: string): number | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

// Número persistido → string BR pra input (null → vazio; ponto → vírgula).
function numToStrBR(v: number | null | undefined): string {
  return v === null || v === undefined ? '' : String(v).replace('.', ',');
}

// Ambiente climatizado no estado da UI (etapa 3, PMOC). Strings cruas nos campos
// numéricos; `equipment_ids` aponta pros equipamentos do cliente. `id` presente
// só quando o ambiente já está persistido (edição). `key` é estável pra React.
interface EnvRow {
  id?: string;
  key: string;
  identificacao: string;
  tipo_atividade: string;
  area_climatizada_m2: string;
  ocupantes_fixos: string;
  ocupantes_flutuantes: string;
  carga_termica_tr: string;
  photo_url?: string | null;
  equipment_ids: string[];
}

// Chave virtual do grupo "Sem ambiente" (só contrato comum). NÃO é um registro de
// contract_environments — agrupa contract_items soltos (environment_id NULL).
const LOOSE_ENV_KEY = '__loose__';

// Item solto do contrato comum (sem ambiente). Espelha contract_items com
// environment_id NULL: equipment_id (ou item manual) + snapshot pra não perder.
interface LooseItem {
  equipment_id?: string;
  item_name: string;
  item_description?: string | null;
  form_template_id?: string | null;
}

let envKeySeq = 0;
function newEnvRow(): EnvRow {
  envKeySeq += 1;
  return {
    key: `env-${Date.now()}-${envKeySeq}`,
    identificacao: '',
    tipo_atividade: '',
    area_climatizada_m2: '',
    ocupantes_fixos: '',
    ocupantes_flutuantes: '',
    carga_termica_tr: '',
    photo_url: null,
    equipment_ids: [],
  };
}

export function ContractFormDialog({ open, onOpenChange, onCreated, editContract, defaultCustomerId }: ContractFormDialogProps) {
  const { createContract, updateContract } = useContracts();
  // Plano de serviços já persistido (só carrega em edição). Hook é a fronteira
  // do Supabase — o componente nunca lê contract_plan_activities direto.
  const { data: existingPlan } = useContractPlanActivities(editContract?.id);
  const { customers, createCustomer } = useCustomers();
  const { data: technicians } = useTechnicians();
  const { data: allProfiles } = useProfiles();
  const { teams, teamsWithMembers } = useTeams();
  const { serviceTypes } = useServiceTypes();
  const { templates, isLoading: templatesLoading } = useFormTemplates();
  // Segmento da empresa logada — gateia o PMOC, que é exclusivo de refrigeração.
  const { settings: companySettings } = useCompanySettings();
  // Lista de RTs ativos do tenant — usada quando o contrato é marcado como PMOC.
  const { technicians: responsibleTechnicians, isLoading: rtLoading } = useResponsibleTechnicians({ activeOnly: true });
  // Catálogo PMOC (149 atividades da norma) — alimenta o picker por seção e a
  // pré-carga automática do plano padrão (seção condicionadores) num PMOC novo.
  const { activities: catalogActivities, groups: catalogGroups, defaultSectionActivities, isLoading: catalogLoading } = usePmocActivityCatalog();
  const { toast } = useToast();

  const isEditing = !!editContract;
  // PMOC é exclusivo do segmento de refrigeração (decisão CEO). Liberamos também
  // quando o contrato em edição JÁ é PMOC — assim contratos PMOC legados de
  // empresas que (por qualquer motivo) não estejam marcadas como refrigeração
  // continuam editáveis sem perder a estrutura PMOC.
  const canUsePmoc =
    companySettings?.segment === 'refrigeracao' || (isEditing && !!editContract?.is_pmoc);

  const [step, setStep] = useState(0);
  // Etapa mais avançada já visitada — libera o clique direto no cabeçalho do
  // wizard pra navegar livremente (ida e volta) entre etapas já alcançadas, sem
  // pular uma etapa obrigatória ainda não preenchida (item 5 do lote PMOC).
  const [maxStepReached, setMaxStepReached] = useState(0);
  // PMOC organiza a etapa 3 por ambientes; comum mantém a lista flat. (isPmoc é
  // declarado mais abaixo; STEPS é derivado num useMemo após isPmoc existir.)
  const [submitting, setSubmitting] = useState(false);
  const [showQuickCustomer, setShowQuickCustomer] = useState(false);

  // Step 1
  const [name, setName] = useState('');
  const [customerId, setCustomerId] = useState(defaultCustomerId || '');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [billingUserIds, setBillingUserIds] = useState<string[]>([]);
  const [billingTeamIds, setBillingTeamIds] = useState<string[]>([]);
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [formTemplateId, setFormTemplateId] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Step 2
  const [freqType, setFreqType] = useState<'months' | 'days'>('months');
  const [freqValue, setFreqValue] = useState(1);
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [horizonMonths, setHorizonMonths] = useState(12);
  // Prévia das visitas: alterna entre lista (default) e calendário mensal.
  const [visitsView, setVisitsView] = useState<'list' | 'calendar'>('list');
  // Dia selecionado no calendário de prévia (mostra as atividades abaixo).
  const [previewSelectedDay, setPreviewSelectedDay] = useState<Date | null>(null);

  // Step 2 — Plano de serviços com frequência por linha (Fase 1). Quando há ao
  // menos um serviço, o motor de visitas agrupadas (1 OS/mês = união do que
  // vence) assume; vazio = frequência única (legado). Captura mínima funcional;
  // o redesign visual é outra tarefa.
  const [planActivities, setPlanActivities] = useState<PlanActivityRow[]>([]);
  const [newActivityDesc, setNewActivityDesc] = useState('');
  const [newActivityFreq, setNewActivityFreq] = useState<FreqCode>('M');
  // Snapshot do plano carregado do banco (modo edição) — base pra detectar se o
  // plano mudou e o cronograma precisa ser recalculado.
  const [initialPlanSig, setInitialPlanSig] = useState('');
  // Confirmação antes de recalcular visitas futuras numa edição de cronograma.
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [regenCount, setRegenCount] = useState(0);

  // Picker do catálogo PMOC (Fase 2). Abre por seção; seleção multi vira linhas
  // do plano. `pickerSelection` = ids do catálogo marcados no modal aberto.
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);
  const [pickerSelection, setPickerSelection] = useState<Set<string>>(new Set());
  // Seleção dos checklists PERSONALIZADOS (form_templates) no modal aberto, por
  // máquina. Gerenciada à parte da seleção do catálogo da norma.
  const [pickerTemplateSelection, setPickerTemplateSelection] = useState<Set<string>>(new Set());
  // 1ª OS por pergunta dos PERSONALIZADOS da máquina no modal aberto: ids de
  // perguntas TIRADAS da 1ª OS. Aplicado à machineConfig no confirmar.
  const [pickerExcludedQuestions, setPickerExcludedQuestions] = useState<Set<string>>(new Set());
  // Guarda contra re-empurrar o plano padrão PMOC mais de uma vez por abertura.
  const [pmocDefaultSeeded, setPmocDefaultSeeded] = useState(false);
  // Controle EXPLÍCITO do padrão PMOC da norma (substitui a auto-carga silenciosa).
  //  - pmocStandardOn: o plano recebe as atividades do catálogo (default ON num PMOC novo).
  //  - pmocStandardScope: 'ac' = só condicionadores (~41) | 'all' = toda a norma (~149).
  const [pmocStandardOn, setPmocStandardOn] = useState(true);
  const [pmocStandardScope, setPmocStandardScope] = useState<'ac' | 'all'>('ac');
  // "Opções avançadas — serviços com frequência própria": recolhido por padrão
  // pra não competir com o caminho principal (cadência mensal pelo plano).
  const [showAdvancedFrequency, setShowAdvancedFrequency] = useState(false);

  // Step 3 (contrato comum) — equipamentos/itens SOLTOS (sem ambiente). Espelham
  // contract_items com environment_id NULL. No comum o usuário organiza por
  // ambientes (como o PMOC), mas pode deixar equipamentos/itens manuais soltos.
  const [looseItems, setLooseItems] = useState<LooseItem[]>([]);
  const [showManualItem, setShowManualItem] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualDesc, setManualDesc] = useState('');

  // PMOC (Onda A v1.9.0). Toggle inline na seção Informações; quando true,
  // exige seleção de Responsável Técnico (RT). Desligar pede confirmação se já tinha RT.
  const [isPmoc, setIsPmoc] = useState(false);
  const [responsibleTechnicianId, setResponsibleTechnicianId] = useState<string>('');
  // Identificação da UNIDADE (Seção 1 da Planilha PMOC). 1 contrato = 1 loja/site;
  // a unidade pode ter endereço PRÓPRIO (≠ do cliente/proprietário). Pré-preenche
  // do cliente quando vazio; rede com várias lojas edita. Só em contrato PMOC.
  const [unidadeNome, setUnidadeNome] = useState('');
  const [unidadeEndereco, setUnidadeEndereco] = useState('');
  const [unidadeNumero, setUnidadeNumero] = useState('');
  const [unidadeComplemento, setUnidadeComplemento] = useState('');
  const [unidadeBairro, setUnidadeBairro] = useState('');
  const [unidadeCidade, setUnidadeCidade] = useState('');
  const [unidadeUf, setUnidadeUf] = useState('');
  const [unidadeCep, setUnidadeCep] = useState('');
  const [showPmocOffConfirm, setShowPmocOffConfirm] = useState(false);
  // Quick-create RT (Onda UI-1.2): botão "+" abre dialog nested.
  const [showQuickCreateRT, setShowQuickCreateRT] = useState(false);
  // Ambientes climatizados (multi-ambiente PMOC). Cada ambiente carrega os 6
  // campos da Seção 4 (strings cruas, parseadas no submit) + a lista de
  // equipamentos do cliente que pertencem a ele. Um equipamento pertence a UM
  // ambiente (exclusivo entre ambientes). Só aparece quando o contrato é PMOC.
  const [environments, setEnvironments] = useState<EnvRow[]>([]);
  // Master-detail da etapa "Ambientes e Equipamentos" (mesma UX da aba de
  // detalhe): null = LISTA de ambientes; preenchido = detalhe daquele ambiente.
  // LOOSE_ENV_KEY abre o grupo virtual "Sem ambiente" (só comum).
  const [selectedEnvKey, setSelectedEnvKey] = useState<string | null>(null);
  // Expansão da config POR MÁQUINA (PMOC). Set de equipment_id expandidos. Fechado
  // por padrão; SEPARADO da membership (abrir/fechar NUNCA remove o equipamento).
  const [expandedEqIds, setExpandedEqIds] = useState<Set<string>>(new Set());
  // Contrato COMUM (não-PMOC): checklist por equipamento + exclusões da 1ª OS.
  // Keyed por equipment_id (espelha machineConfigs do PMOC). Cada entrada guarda o
  // form_template_id escolhido e os ids de perguntas que NÃO entram na 1ª OS
  // (first_os_excluded_questions). Itens manuais (sem equipment_id) não têm
  // checklist por equipamento. Só usado em contrato comum.
  // formTemplateIds = LISTA de checklists do equipamento (ordem de adição). Item
  // legado salvo com 1 só (form_template_id) é carregado como [esse id].
  const [commonChecklists, setCommonChecklists] = useState<Record<string, { formTemplateIds: string[]; excluded: string[] }>>({});
  // Em edição, marca que os checklists por equipamento já foram carregados do
  // banco (evita sobrescrever com vazio antes do contrato chegar).
  const [commonChecklistsLoaded, setCommonChecklistsLoaded] = useState(false);
  // Picker de equipamentos do ambiente (multi-seleção + busca). envKey = alvo
  // (null = fechado). LOOSE_ENV_KEY = adicionar ao grupo "Sem ambiente".
  const [memberPickerEnvKey, setMemberPickerEnvKey] = useState<string | null>(null);
  const [memberPickerSearch, setMemberPickerSearch] = useState('');
  const [memberPickerSelection, setMemberPickerSelection] = useState<Set<string>>(new Set());
  // Confirmação de remover ambiente (key alvo).
  const [removingEnvKey, setRemovingEnvKey] = useState<string | null>(null);
  // Confirmação de remover equipamento. mode 'env' = tira do ambiente (no comum
  // volta pro grupo "Sem ambiente"; no PMOC sai do contrato). mode 'loose' = tira
  // de vez do contrato. envKey = ambiente alvo (mode 'env').
  const [removingMember, setRemovingMember] = useState<{ mode: 'env' | 'loose'; envKey?: string; eqId?: string; looseIdx?: number } | null>(null);
  // "Mover para ambiente": item solto a realocar (null = fechado). looseIdx =
  // posição no looseItems (cobre itens manuais sem equipment_id).
  const [movingLooseIdx, setMovingLooseIdx] = useState<number | null>(null);
  // Rotina POR MÁQUINA (Fase 3). Chave = equipment_id. Cada máquina selecionada
  // num ambiente tem escopo da norma + posição inicial no ciclo de 12 visitas +
  // sua listagem própria de atividades (checklists). Defaults bons: 'ac' /
  // começa na 12 (anual) / segue a norma do escopo. Só usado em PMOC.
  const [machineConfigs, setMachineConfigs] = useState<Record<string, MachineConfig>>({});
  // Em edição, marca que as configs por máquina já foram reconstruídas do banco
  // (evita o auto-sync sobrescrever com defaults antes de carregar o salvo).
  const [machineConfigsLoaded, setMachineConfigsLoaded] = useState(false);
  // Em edição, marca que os AMBIENTES já foram reconstruídos do banco. Sem isso,
  // o `refetchOnWindowFocus`/`refetchOnMount` do contrato troca a referência de
  // `editContract` e o efeito reconstruiria os ambientes a cada foco — apagando
  // o que o gestor digitou (carga térmica, ocupantes…) e/ou voltando ao salvo.
  // Reconstrói só na 1ª vez que o contrato chega com os dados.
  const [environmentsLoaded, setEnvironmentsLoaded] = useState(false);
  // Picker do catálogo POR MÁQUINA: quando aberto a partir de um equipamento,
  // guarda o equipment_id alvo; ao confirmar, a seleção vira a listagem daquela
  // máquina. `null` = picker do modo personalizado por contrato (legado).
  const [pickerMachineEqId, setPickerMachineEqId] = useState<string | null>(null);
  // Escopo da máquina cujo picker está aberto — filtra as seções exibidas (item 1).
  const [pickerMachineScope, setPickerMachineScope] = useState<PmocMachineScope | null>(null);
  // Em modo edição, guarda a chamada que ficou esperando confirmação do "desligar PMOC".
  const initialIsPmocRef = useState<{ value: boolean }>({ value: false })[0];

  const { equipment, createEquipment } = useEquipment(customerId || undefined);
  const { categories: equipmentCategories } = useEquipmentCategories();
  const activeEquipment = equipment.filter(eq => eq.status === 'active');

  // Quick-create de equipamento dentro de um ambiente (PMOC). Guarda a KEY do
  // ambiente que disparou o cadastro pra, no sucesso, marcar o novo equipamento
  // exatamente naquele ambiente.
  // Criar equipamento do cliente na hora (a partir do picker do ambiente). O alvo
  // (ambiente ou grupo "Sem ambiente") é o próprio memberPickerEnvKey aberto.
  const [showQuickEquip, setShowQuickEquip] = useState(false);
  // Calculadora de área (largura × comprimento → m²): guarda a key do ambiente alvo.
  const [areaCalcEnvKey, setAreaCalcEnvKey] = useState<string | null>(null);
  // Calculadora de carga térmica (ferramenta da Área do Técnico → TR): key do ambiente alvo.
  const [cargaCalcEnvKey, setCargaCalcEnvKey] = useState<string | null>(null);
  // Viewer da foto do equipamento (ampliada). null = fechado.
  const [previewPhoto, setPreviewPhoto] = useState<{ src: string; alt: string } | null>(null);

  // Cliente do contrato como lista de 1 — trava a seleção no EquipmentFormDialog.
  const contractCustomerAsList = useMemo(
    () => customers.filter(c => c.id === customerId),
    [customers, customerId],
  );

  // Wizard dinâmico: PMOC tem 6 etapas (info → unit → items → frequency → team →
  // review); comum tem 5 (info → items → frequency → team → review). O conteúdo é
  // renderizado pela KEY do step atual (nunca por índice numérico) pra não dar
  // drift quando o PMOC liga/desliga.
  const STEPS = isPmoc ? STEPS_PMOC : STEPS_COMMON;
  const currentStepKey = STEPS[step]?.key ?? 'info';

  // Ligar/desligar PMOC muda a contagem de etapas (5 ↔ 6). Se o índice atual
  // estourar o novo array, recua pra última etapa válida (evita tela em branco).
  useEffect(() => {
    if (step > STEPS.length - 1) setStep(STEPS.length - 1);
  }, [STEPS.length, step]);

  // Mantém o "mais avançado já visitado" sempre ≥ etapa atual.
  useEffect(() => {
    setMaxStepReached(prev => (step > prev ? step : prev));
  }, [step]);

  // Em edição, todas as etapas já estão preenchidas (o contrato existe) → libera
  // navegação livre por todas elas desde o início.
  useEffect(() => {
    if (open && isEditing) setMaxStepReached(STEPS.length - 1);
  }, [open, isEditing, STEPS.length]);

  // Ao SAIR da etapa "Ambientes e Equipamentos", volta o master-detail pra LISTA
  // (não mantém um ambiente aberto ao avançar/voltar no wizard).
  useEffect(() => {
    if (currentStepKey !== 'items' && selectedEnvKey !== null) setSelectedEnvKey(null);
  }, [currentStepKey, selectedEnvKey]);

  // Esvaziou o grupo "Sem ambiente" (moveu/removeu o último item) → volta à lista.
  useEffect(() => {
    if (selectedEnvKey === LOOSE_ENV_KEY && looseItems.length === 0) setSelectedEnvKey(null);
  }, [selectedEnvKey, looseItems.length]);

  // Navega para a etapa `target` clicando no cabeçalho. Permite ir a qualquer
  // etapa já visitada (≤ maxStepReached). Avançar para uma etapa nova só é
  // liberado quando a etapa atual está válida (canNext) — não pula obrigatória.
  const goToStep = (target: number) => {
    if (target === step) return;
    if (target <= maxStepReached) { setStep(target); return; }
    if (target === step + 1 && canNext()) setStep(target);
  };

  // Rascunho (só em CRIAÇÃO). Persiste TODO o estado de preenchimento das etapas
  // em sessionStorage e, ao reabrir com rascunho salvo, oferece o DraftResumeDialog.
  // Espelha o padrão do QuoteFormDialog (useFormDraft + DraftResumeDialog). Agora
  // o rascunho cobre também a Unidade & RT, os Ambientes (com equipamentos), os
  // itens do contrato comum e a config POR MÁQUINA (Fase 3 — escopo/começa-na-
  // visita/checklists), pra não perder o trabalho ao fechar/recarregar o modal.
  type ContractDraft = {
    name: string; customerId: string; serviceTypeId: string; formTemplateId: string;
    notes: string; isActive: boolean; isPmoc: boolean; responsibleTechnicianId: string;
    freqType: 'months' | 'days'; freqValue: number; startDate: string; horizonMonths: number;
    // Etapa atual (restaura onde parou).
    step: number;
    // Unidade & RT (Seção 1, só PMOC).
    unidadeNome: string; unidadeEndereco: string; unidadeNumero: string;
    unidadeComplemento: string; unidadeBairro: string; unidadeCidade: string;
    unidadeUf: string; unidadeCep: string;
    // Ambientes (PMOC e comum) — strings cruas + equipamentos por ambiente.
    environments: EnvRow[];
    // Itens SOLTOS do contrato comum (sem ambiente; environment_id NULL).
    looseItems: LooseItem[];
    // Config por máquina (Fase 3). Guarda a config inteira: escopo, fase, flag
    // de personalização e a listagem de atividades reidratável.
    machineConfigs: Record<string, MachineConfig>;
    // Contrato comum: checklists (lista) por equipamento + exclusões da 1ª OS.
    commonChecklists: Record<string, { formTemplateIds: string[]; excluded: string[] }>;
  };
  const draft = useFormDraft<ContractDraft>({
    key: 'contract-form',
    isOpen: open,
    isEditing,
    // Campos com default não-vazio (que não representam preenchimento real do
    // usuário) são ignorados na detecção de "tem rascunho" — evita falso prompt
    // num form recém-aberto. step/arrays vazios também não contam.
    ignoreKeys: [
      'isActive', 'freqType', 'freqValue', 'startDate', 'horizonMonths', 'step',
      'unidadeNome', 'unidadeEndereco', 'unidadeNumero', 'unidadeComplemento',
      'unidadeBairro', 'unidadeCidade', 'unidadeUf', 'unidadeCep',
    ],
  });

  // Persiste a cada mudança (só criação, e não enquanto o prompt de retomar está aberto).
  useEffect(() => {
    if (open && !isEditing && !draft.showResumePrompt) {
      draft.saveDraft({
        name, customerId, serviceTypeId, formTemplateId, notes, isActive, isPmoc,
        responsibleTechnicianId, freqType, freqValue, startDate, horizonMonths, step,
        unidadeNome, unidadeEndereco, unidadeNumero, unidadeComplemento,
        unidadeBairro, unidadeCidade, unidadeUf, unidadeCep,
        environments, looseItems, machineConfigs, commonChecklists,
      });
    }
  }, [name, customerId, serviceTypeId, formTemplateId, notes, isActive, isPmoc, responsibleTechnicianId, freqType, freqValue, startDate, horizonMonths, step, unidadeNome, unidadeEndereco, unidadeNumero, unidadeComplemento, unidadeBairro, unidadeCidade, unidadeUf, unidadeCep, environments, looseItems, machineConfigs, commonChecklists, open, isEditing, draft.showResumePrompt]);

  const applyContractDraft = (d: ContractDraft) => {
    setName(d.name || '');
    setCustomerId(d.customerId || '');
    setServiceTypeId(d.serviceTypeId || '');
    setFormTemplateId(d.formTemplateId || '');
    setNotes(d.notes || '');
    setIsActive(d.isActive !== false);
    setIsPmoc(!!d.isPmoc);
    setResponsibleTechnicianId(d.responsibleTechnicianId || '');
    setFreqType(d.freqType || 'months');
    setFreqValue(d.freqValue || 1);
    setStartDate(d.startDate || format(new Date(), 'yyyy-MM-dd'));
    setHorizonMonths(d.horizonMonths || 12);
    // Unidade & RT.
    setUnidadeNome(d.unidadeNome || '');
    setUnidadeEndereco(d.unidadeEndereco || '');
    setUnidadeNumero(d.unidadeNumero || '');
    setUnidadeComplemento(d.unidadeComplemento || '');
    setUnidadeBairro(d.unidadeBairro || '');
    setUnidadeCidade(d.unidadeCidade || '');
    setUnidadeUf(d.unidadeUf || '');
    setUnidadeCep(d.unidadeCep || '');
    // Ambientes — regenera a `key` (estável p/ React, mas não precisa sobreviver)
    // preservando o resto. Sem `id` (rascunho é sempre contrato novo).
    const restoredEnvs: EnvRow[] = (d.environments || []).map((e) => {
      envKeySeq += 1;
      return {
        key: `env-${Date.now()}-${envKeySeq}`,
        identificacao: e.identificacao || '',
        tipo_atividade: e.tipo_atividade || '',
        area_climatizada_m2: e.area_climatizada_m2 || '',
        ocupantes_fixos: e.ocupantes_fixos || '',
        ocupantes_flutuantes: e.ocupantes_flutuantes || '',
        carga_termica_tr: e.carga_termica_tr || '',
        photo_url: e.photo_url ?? null,
        equipment_ids: Array.isArray(e.equipment_ids) ? e.equipment_ids : [],
      };
    });
    setEnvironments(restoredEnvs);
    // Itens soltos do contrato comum.
    setLooseItems(Array.isArray(d.looseItems) ? d.looseItems : []);
    // Config por máquina (Fase 3) — restaura ANTES do auto-sync poder rodar e
    // marca o guard pra que o efeito de auto-sync (que cria defaults) NÃO
    // sobrescreva os configs restaurados; ele só ADICIONA default p/ equipamento
    // novo sem config.
    const restoredConfigs = (d.machineConfigs && typeof d.machineConfigs === 'object')
      ? d.machineConfigs
      : {};
    setMachineConfigs(restoredConfigs);
    setMachineConfigsLoaded(true);
    // Checklists por equipamento do contrato comum (rascunho). Normaliza rascunho
    // antigo que guardava `formTemplateId` (single) → lista [esse id].
    const restoredChecklists: Record<string, { formTemplateIds: string[]; excluded: string[] }> = {};
    if (d.commonChecklists && typeof d.commonChecklists === 'object') {
      for (const [eqId, raw] of Object.entries(d.commonChecklists as Record<string, any>)) {
        const ids = Array.isArray(raw?.formTemplateIds)
          ? (raw.formTemplateIds as any[]).filter((x) => typeof x === 'string')
          : raw?.formTemplateId
            ? [raw.formTemplateId as string]
            : [];
        const ex = Array.isArray(raw?.excluded)
          ? (raw.excluded as any[]).filter((x) => typeof x === 'string')
          : [];
        restoredChecklists[eqId] = { formTemplateIds: ids, excluded: ex };
      }
    }
    setCommonChecklists(restoredChecklists);
    setCommonChecklistsLoaded(true);
    // Restaura a etapa onde parou (clampa pro range válido — depende de isPmoc).
    const stepsLen = (d.isPmoc ? STEPS_PMOC : STEPS_COMMON).length;
    setStep(Math.min(Math.max(d.step ?? 0, 0), stepsLen - 1));
  };

  useEffect(() => {
    if (!open) {
      setStep(0);
      setMaxStepReached(0);
      setShowManualItem(false); setManualName(''); setManualDesc('');
      setShowCatalogPicker(false); setPickerSelection(new Set()); setPickerTemplateSelection(new Set()); setPmocDefaultSeeded(false);
      setPmocStandardOn(true); setPmocStandardScope('ac'); setShowAdvancedFrequency(false);
      setMachineConfigs({}); setMachineConfigsLoaded(false); setPickerMachineEqId(null);
      setCommonChecklists({}); setCommonChecklistsLoaded(false);
      setSelectedEnvKey(null); setExpandedEqIds(new Set());
      setMemberPickerEnvKey(null); setMemberPickerSearch(''); setMemberPickerSelection(new Set());
      setRemovingEnvKey(null); setRemovingMember(null); setMovingLooseIdx(null);
      setLooseItems([]);
      setEnvironmentsLoaded(false);
      return;
    }

    if (editContract) {
      setName(editContract.name || '');
      setCustomerId(editContract.customer_id || '');
      // Handle technician or team for multi-select
      const editUserIds: string[] = [];
      const editTeamIds: string[] = [];
      if (editContract.team_id) {
        editTeamIds.push(editContract.team_id);
        // Add team members as selected users
        const team = teamsWithMembers.find(t => t.id === editContract.team_id);
        if (team) {
          (team.members ?? []).forEach(m => {
            if (m?.user_id && !editUserIds.includes(m.user_id)) editUserIds.push(m.user_id);
          });
        }
      }
      if (editContract.technician_id && !editUserIds.includes(editContract.technician_id)) {
        editUserIds.push(editContract.technician_id);
      }
      setSelectedUserIds(editUserIds);
      setSelectedTeamIds(editTeamIds);
      setBillingUserIds(editContract.billing_responsible_ids || []);
      setBillingTeamIds([]);
      setServiceTypeId(editContract.service_type_id || '');
      setFormTemplateId(editContract.form_template_id || '');
      setNotes(editContract.notes || '');
      setIsActive(editContract.status === 'active');
      setFreqType(editContract.frequency_type || 'months');
      setFreqValue(editContract.frequency_value || 1);
      setStartDate(editContract.start_date || format(new Date(), 'yyyy-MM-dd'));
      setHorizonMonths(editContract.horizon_months || 12);
      // Plano de atividades é repopulado por um efeito dedicado quando a query
      // useContractPlanActivities resolve (carrega async). Aqui só limpamos o
      // editor de "nova atividade".
      setNewActivityDesc(''); setNewActivityFreq('M');
      // Itens SOLTOS (sem environment_id) → grupo "Sem ambiente" do contrato comum.
      // Os itens COM environment_id são reconstruídos pelos ambientes (abaixo). No
      // PMOC todo item vive num ambiente → looseItems fica vazio.
      if (!environmentsLoaded) {
        setLooseItems(
          (editContract.contract_items || [])
            .filter((i: any) => !i.environment_id)
            .map((i: any) => ({
              equipment_id: i.equipment_id || undefined,
              item_name: i.item_name,
              item_description: i.item_description || undefined,
              form_template_id: i.form_template_id || undefined,
            }))
        );
      }
      // Contrato comum: reconstrói o checklist por equipamento (form_template_id +
      // exclusões da 1ª OS) de TODO contract_item com equipment_id (em ambiente ou
      // solto). Roda uma vez por abertura (guard) pra não sobrescrever edição em
      // andamento quando o refetch troca a referência de editContract.
      if (!commonChecklistsLoaded) {
        const map: Record<string, { formTemplateIds: string[]; excluded: string[] }> = {};
        for (const i of (editContract.contract_items || []) as any[]) {
          if (!i.equipment_id) continue;
          const ex = Array.isArray(i.first_os_excluded_questions)
            ? (i.first_os_excluded_questions as any[]).filter((x) => typeof x === 'string')
            : [];
          // Lista de checklists: usa form_template_ids se não-vazio; senão cai no
          // single form_template_id (compat); senão [].
          const ids = Array.isArray(i.form_template_ids)
            ? (i.form_template_ids as any[]).filter((x) => typeof x === 'string')
            : [];
          const effectiveIds = ids.length > 0 ? ids : i.form_template_id ? [i.form_template_id] : [];
          map[i.equipment_id] = { formTemplateIds: effectiveIds, excluded: ex };
        }
        setCommonChecklists(map);
        if (editContract.id) setCommonChecklistsLoaded(true);
      }
      // PMOC — preserva estado existente quando entra em edição.
      const editIsPmoc = !!editContract.is_pmoc;
      setIsPmoc(editIsPmoc);
      setResponsibleTechnicianId(editContract.responsible_technician_id || '');
      // Identificação da unidade (Seção 1) — carrega os valores salvos.
      setUnidadeNome(editContract.unidade_nome || '');
      setUnidadeEndereco(editContract.unidade_endereco || '');
      setUnidadeNumero(editContract.unidade_numero || '');
      setUnidadeComplemento(editContract.unidade_complemento || '');
      setUnidadeBairro(editContract.unidade_bairro || '');
      setUnidadeCidade(editContract.unidade_cidade || '');
      setUnidadeUf(editContract.unidade_uf || '');
      setUnidadeCep(editContract.unidade_cep || '');
      initialIsPmocRef.value = editIsPmoc;
      // Ambientes climatizados (multi-ambiente). Reconstrói os cards a partir de
      // contract_environments + agrupa os equipamentos por environment_id (lido
      // dos contract_items), incluindo TODOS os campos da Seção 4 (carga térmica,
      // ocupantes fixos/flutuantes, área). Ambiente sem nenhum equipamento volta
      // vazio.
      //
      // Bug fix (item 7): a reconstrução acontece UMA vez por abertura (guard
      // environmentsLoaded). Antes, o contrato é refeito a cada foco da janela
      // (refetchOnWindowFocus/refetchOnMount no useContractDetail), trocando a
      // referência de `editContract` e re-disparando este efeito — o que
      // reescrevia os ambientes (apagando o que o gestor estava digitando, ou
      // voltando ao valor salvo). Com o guard, os campos vêm preenchidos do banco
      // na abertura e ficam estáveis durante a edição.
      if (!environmentsLoaded) {
        const envRows: EnvRow[] = ((editContract.contract_environments || []) as any[])
          .slice()
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((e) => {
            envKeySeq += 1;
            const eqIds = ((editContract.contract_items || []) as any[])
              .filter((it) => it.environment_id === e.id && it.equipment_id)
              .map((it) => it.equipment_id as string);
            return {
              id: e.id,
              key: `env-${e.id}`,
              identificacao: e.identificacao || '',
              tipo_atividade: e.tipo_atividade || '',
              area_climatizada_m2: numToStrBR(e.area_climatizada_m2),
              ocupantes_fixos: numToStrBR(e.ocupantes_fixos),
              ocupantes_flutuantes: numToStrBR(e.ocupantes_flutuantes),
              carga_termica_tr: numToStrBR(e.carga_termica_tr),
              photo_url: e.photo_url ?? null,
              equipment_ids: eqIds,
            };
          });
        // Só marca como carregado quando o contrato já trouxe os ambientes (a
        // 1ª passagem pode chegar antes da relação resolver). Ambiente PMOC sem
        // nenhum ambiente persistido também conclui (array vazio é resposta final).
        setEnvironments(envRows);
        if ((editContract.contract_environments || []).length > 0 || editContract.id) {
          setEnvironmentsLoaded(true);
        }
      }
    } else {
      setName(''); setCustomerId(defaultCustomerId || ''); setSelectedUserIds([]); setSelectedTeamIds([]);
      setBillingUserIds([]); setBillingTeamIds([]); setServiceTypeId('');
      setFormTemplateId(''); setNotes(''); setIsActive(true);
      setFreqType('months'); setFreqValue(1); setStartDate(format(new Date(), 'yyyy-MM-dd')); setHorizonMonths(12);
      setPlanActivities([]); setInitialPlanSig(''); setNewActivityDesc(''); setNewActivityFreq('M');
      // Contrato novo: padrão da norma LIGADO, escopo só ar-condicionado (default).
      setPmocStandardOn(true); setPmocStandardScope('ac');
      setLooseItems([]);
      setEnvironments([]);
      setCommonChecklists({}); setCommonChecklistsLoaded(false);
      // Default: contrato comum.
      setIsPmoc(false);
      setResponsibleTechnicianId('');
      // Identificação da unidade — vazia (pré-preenche do cliente via efeito).
      setUnidadeNome(''); setUnidadeEndereco(''); setUnidadeNumero('');
      setUnidadeComplemento(''); setUnidadeBairro(''); setUnidadeCidade('');
      setUnidadeUf(''); setUnidadeCep('');
      initialIsPmocRef.value = false;
    }
  }, [open, editContract]);

  // Repopula o editor "Serviços com frequência própria" com o plano persistido
  // (modo edição). Roda quando a query resolve. Guarda a assinatura inicial pra
  // detectar mudança de plano no submit.
  // Empresa fora do segmento de refrigeração nunca opera PMOC: garante o flag
  // desligado mesmo que algum estado anterior o tenha ligado. (canUsePmoc já
  // permite o PMOC legado em edição, então isso só zera contrato comum/novo.)
  useEffect(() => {
    if (!canUsePmoc && isPmoc) {
      setIsPmoc(false);
      setResponsibleTechnicianId('');
      // FIX 3 (perda silenciosa): avisa que o rascunho/contrato era PMOC mas a
      // empresa não está habilitada — unidade e RT não serão salvos. Sem isso o
      // gestor perderia o trabalho de Unidade & RT sem qualquer sinal.
      toast({
        variant: 'destructive',
        title: 'PMOC desativado',
        description:
          'Este rascunho era PMOC, mas sua empresa não está habilitada para PMOC — os dados de unidade e responsável técnico não serão salvos.',
      });
    }
  }, [canUsePmoc, isPmoc, toast]);

  const planSigOf = (rows: { description: string; freq_code: FreqCode; applies_per_equipment?: boolean }[]) =>
    rows.map(a => `${a.description.trim()}|${a.freq_code}|${a.applies_per_equipment === false ? '0' : '1'}`).join('§');

  useEffect(() => {
    if (!open || !editContract) return;
    const rows: PlanActivityRow[] = (existingPlan ?? []).map(r => ({
      description: r.description,
      guidance: r.guidance ?? null,
      freq_code: planRowToFreqCode(r),
      section: r.section,
      component: r.component,
      is_measurement: r.is_measurement,
      unit: r.unit,
      expected_min: r.expected_min,
      expected_max: r.expected_max,
      catalog_activity_id: r.catalog_activity_id,
      applies_per_equipment: r.applies_per_equipment,
    }));
    setPlanActivities(rows);
    setInitialPlanSig(planSigOf(rows));
    // Reflete (sem re-empurrar) o estado do controle de padrão a partir do que
    // já está salvo: se há linhas do catálogo, o toggle aparece LIGADO; o escopo
    // é inferido (alguma seção fora de condicionadores → "Tudo da norma").
    const catalogRows = rows.filter(r => !!r.catalog_activity_id);
    setPmocStandardOn(catalogRows.length > 0);
    const hasNonCondicionadores = catalogRows.some(r => r.section && r.section !== PMOC_DEFAULT_SECTION);
    setPmocStandardScope(hasNonCondicionadores ? 'all' : 'ac');
  }, [open, editContract, existingPlan]);

  // Reconstrói as configs POR MÁQUINA (Fase 3) ao abrir um PMOC existente:
  //  - escopo/fase de cada máquina vêm de contract_items (pmoc_scope/pmoc_start_visit);
  //  - a listagem própria vem das contract_plan_activities agrupadas por
  //    contract_item_id (→ equipment_id);
  //  - LEGADO (plano sem contract_item_id): cada máquina recebe a config default
  //    da norma (escopo inferido pelas seções; start 12 = tudo na 1ª visita) →
  //    ao salvar migra pro formato por máquina SEM regredir as visitas.
  useEffect(() => {
    if (!open || !editContract || !isPmoc) return;
    if (catalogLoading || catalogActivities.length === 0) return;
    if (existingPlan === undefined) return; // espera a query do plano resolver
    if (machineConfigsLoaded) return;

    // Reconstrução via fonte ÚNICA compartilhada (mesma lógica usada pela aba).
    const configs = reconstructMachineConfigs({
      items: (editContract.contract_items || []) as any[],
      plan: (existingPlan ?? []) as any[],
      catalogActivities,
    });
    setMachineConfigs(configs);
    setMachineConfigsLoaded(true);
  }, [open, editContract, isPmoc, existingPlan, catalogLoading, catalogActivities.length, machineConfigsLoaded]);

  const customerOptions = useMemo(() =>
    customers.map(c => ({ value: c.id, label: c.name, sublabel: c.document || c.email || undefined })),
    [customers]
  );

  const occurrences = useMemo(() =>
    generateOccurrences(new Date(startDate + 'T00:00:00'), freqType, freqValue, horizonMonths),
    [startDate, freqType, freqValue, horizonMonths]
  );


  const weekendDates = occurrences.filter(d => d.getDay() === 0 || d.getDay() === 6);

  const addPlanActivity = () => {
    const desc = newActivityDesc.trim();
    if (!desc) return;
    setPlanActivities(prev => [...prev, { description: desc, freq_code: newActivityFreq }]);
    setNewActivityDesc('');
    setNewActivityFreq('M');
  };

  // Atividades do catálogo correspondentes a cada escopo do padrão PMOC:
  //  - 'ac'  → só a seção condicionadores (split/AC), ~41 atividades.
  //  - 'all' → toda a norma (todas as seções), ~149 atividades.
  const standardScopeActivities = (scope: 'ac' | 'all'): PmocCatalogActivity[] =>
    scope === 'all' ? catalogActivities : defaultSectionActivities;

  // Aplica o padrão da norma (escopo dado) ao plano, SUBSTITUINDO apenas as
  // linhas vindas do catálogo e PRESERVANDO as linhas manuais (sem
  // catalog_activity_id). Dedup por catalog_activity_id evita duplicar.
  const applyStandardPlan = (scope: 'ac' | 'all') => {
    setPlanActivities(prev => {
      const manual = prev.filter(a => !a.catalog_activity_id);
      const seen = new Set<string>();
      const catalogRows: PlanActivityRow[] = [];
      for (const act of standardScopeActivities(scope)) {
        if (seen.has(act.id)) continue;
        seen.add(act.id);
        catalogRows.push(catalogToPlanRow(act));
      }
      return [...catalogRows, ...manual];
    });
  };

  // Remove do plano as linhas vindas do catálogo, mantendo as manuais.
  const removeStandardPlan = () => {
    setPlanActivities(prev => prev.filter(a => !a.catalog_activity_id));
  };

  // Liga/desliga o padrão da norma (Switch explícito). Desligar remove as linhas
  // do catálogo; religar recarrega o escopo selecionado.
  const handleStandardToggle = (on: boolean) => {
    setPmocStandardOn(on);
    if (on) applyStandardPlan(pmocStandardScope);
    else removeStandardPlan();
  };

  // Troca o escopo (LabeledSwitch). Substitui as linhas do catálogo pelas do
  // novo escopo; manuais ficam.
  const handleStandardScope = (scope: 'ac' | 'all') => {
    setPmocStandardScope(scope);
    if (pmocStandardOn) applyStandardPlan(scope);
  };

  // Seed inicial do padrão da norma num contrato NOVO — HOJE DESATIVADO.
  //
  // Decisão CEO: nem PMOC nem contrato comum semeiam mais o `planActivities` a
  // nível de contrato num cadastro novo:
  //  - PMOC monta o plano POR MÁQUINA (machineConfigs) na etapa Ambientes;
  //  - contrato COMUM usa o Checklist Padrão (frequência por pergunta) e DEVE
  //    manter o seletor de cadência livre (semanal/quinzenal/a cada X dias…).
  //
  // O bug: quando este efeito semeava o `planActivities` no comum novo, o
  // `usePlanEngine` virava true e a etapa de Frequência trocava o seletor de
  // cadência pela mensagem fixa "1 visita por mês", travando o comum em mensal.
  // Mantemos o efeito só por simetria/legado (edição reflete o plano salvo, nunca
  // re-empurra); os guards abaixo o tornam um no-op para qualquer contrato novo.
  useEffect(() => {
    if (!open || isEditing) return; // só em contrato novo; edição não re-empurra
    if (isPmoc) return; // PMOC usa plano por máquina (Fase 3)
    // Contrato comum NOVO usa o Checklist Padrão (frequência por pergunta) e
    // cadência livre — nunca seeda plano (senão o usePlanEngine esconde o seletor).
    return;
  }, [open, isEditing, isPmoc, pmocStandardOn, pmocStandardScope, pmocDefaultSeeded, catalogLoading, defaultSectionActivities.length, catalogActivities.length]);

  // Pré-preenche a Identificação da Unidade (Seção 1) a partir do CLIENTE
  // selecionado quando os campos ainda estão vazios. Caso "1 cliente = 1 loja"
  // funciona sem digitar nada; o usuário pode sobrescrever (rede com várias
  // lojas). Só auto-preenche o campo que está vazio — nunca apaga edição manual.
  // Só em PMOC (a Seção 1 só existe nesse caso).
  useEffect(() => {
    if (!open || !isPmoc || !customerId) return;
    const cust = customers.find(c => c.id === customerId) as any;
    if (!cust) return;
    setUnidadeNome(prev => prev.trim() ? prev : (cust.name || name || ''));
    setUnidadeEndereco(prev => prev.trim() ? prev : (cust.address || ''));
    setUnidadeNumero(prev => prev.trim() ? prev : (cust.address_number || ''));
    setUnidadeComplemento(prev => prev.trim() ? prev : (cust.complement || ''));
    setUnidadeBairro(prev => prev.trim() ? prev : (cust.neighborhood || ''));
    setUnidadeCidade(prev => prev.trim() ? prev : (cust.city || ''));
    setUnidadeUf(prev => prev.trim() ? prev : (cust.state || ''));
    setUnidadeCep(prev => prev.trim() ? prev : (cust.zip_code || ''));
  }, [open, isPmoc, customerId, customers, name]);

  // Abre o picker do catálogo já com as linhas vindas do catálogo pré-marcadas
  // (evita duplicar uma atividade que o gestor já adicionou).
  const openCatalogPicker = () => {
    setPickerMachineEqId(null);
    setPickerMachineScope(null);
    const existingCatalogIds = new Set(
      planActivities.map(a => a.catalog_activity_id).filter(Boolean) as string[],
    );
    setPickerSelection(existingCatalogIds);
    setShowCatalogPicker(true);
  };

  // Picker POR MÁQUINA (Fase 3): abre o catálogo já marcado com a listagem atual
  // daquela máquina. Ao confirmar, a seleção SUBSTITUI a listagem da máquina
  // (permite remover/customizar — não seguir 100% da norma).
  const openMachinePicker = (eqId: string) => {
    setPickerMachineEqId(eqId);
    const cfg = machineConfigs[eqId];
    setPickerMachineScope(cfg?.scope ?? 'ac');
    const current = new Set(
      (cfg?.activities ?? []).map(a => a.catalog_activity_id).filter(Boolean) as string[],
    );
    setPickerSelection(current);
    setPickerTemplateSelection(new Set(cfg?.customTemplateIds ?? []));
    setPickerExcludedQuestions(new Set(cfg?.firstOsExcludedQuestions ?? []));
    setShowCatalogPicker(true);
  };

  // Toggle de uma pergunta na lista de exclusões da 1ª OS (modal aberto).
  const togglePickerExcludedQuestion = (questionId: string) => {
    setPickerExcludedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  // Confirma o picker. Dois modos:
  //  - POR MÁQUINA (pickerMachineEqId definido): a seleção SUBSTITUI a listagem
  //    daquela máquina (add+remove), marcando-a como personalizada.
  //  - por contrato (legado): só ADICIONA as novas ao planActivities.
  const confirmCatalogPicker = () => {
    if (pickerMachineEqId) {
      const eqId = pickerMachineEqId;
      const selected: PlanActivityRow[] = [];
      for (const group of catalogGroups) {
        for (const act of group.activities) {
          if (pickerSelection.has(act.id)) {
            selected.push({
              ...catalogToPlanRow(act),
              applies_per_equipment: true,
              equipment_ref: eqId,
            });
          }
        }
      }
      const templateIds = [...pickerTemplateSelection];
      // Sanitiza a âncora da 1ª OS: só ids que pertencem aos templates AINDA
      // selecionados e que NÃO são "toda visita" (essas sempre entram).
      const validExcludable = new Set<string>();
      for (const tplId of templateIds) {
        const tpl = templateQuestionsById.get(tplId);
        for (const q of tpl?.questions ?? []) {
          if (!isEveryVisit(q)) validExcludable.add(q.id);
        }
      }
      const excludedQuestions = [...pickerExcludedQuestions].filter((id) => validExcludable.has(id));
      setMachineConfigs(prev => {
        const cur = prev[eqId];
        if (!cur) return prev;
        return { ...prev, [eqId]: { ...cur, activities: selected, customized: true, customTemplateIds: templateIds, firstOsExcludedQuestions: excludedQuestions } };
      });
      const total = selected.length + templateIds.length;
      toast({ title: `Checklists da máquina atualizados (${total} item(ns))` });
      setShowCatalogPicker(false);
      setPickerMachineEqId(null);
      return;
    }
    const existingCatalogIds = new Set(
      planActivities.map(a => a.catalog_activity_id).filter(Boolean) as string[],
    );
    const toAdd: PlanActivityRow[] = [];
    for (const group of catalogGroups) {
      for (const act of group.activities) {
        if (pickerSelection.has(act.id) && !existingCatalogIds.has(act.id)) {
          toAdd.push(catalogToPlanRow(act));
        }
      }
    }
    if (toAdd.length > 0) {
      setPlanActivities(prev => [...prev, ...toAdd]);
      toast({ title: `${toAdd.length} serviço(s) adicionado(s) do catálogo PMOC` });
    }
    setShowCatalogPicker(false);
  };

  // Lookup de equipamento por id (lista completa: um membro pode estar inativo).
  const equipmentById = useMemo(() => {
    const m = new Map<string, any>();
    for (const eq of equipment) m.set(eq.id, eq);
    return m;
  }, [equipment]);

  // Adiciona um item manual (sem equipment_id) ao grupo "Sem ambiente" (só comum).
  const addManualItem = () => {
    if (!manualName.trim()) return;
    setLooseItems(prev => [...prev, { item_name: manualName.trim(), item_description: manualDesc.trim() || null }]);
    setManualName('');
    setManualDesc('');
    setShowManualItem(false);
  };

  // ---- Ambientes (PMOC e comum) — master-detail -----------------------------
  // Mapa equipment_id → key do ambiente que o reivindica (exclusividade: um
  // equipamento pertence a UM ambiente).
  const equipmentOwnerEnvKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const env of environments) {
      for (const eqId of env.equipment_ids) map.set(eqId, env.key);
    }
    return map;
  }, [environments]);

  const addEnvironment = () => {
    const row = newEnvRow();
    setEnvironments(prev => [...prev, row]);
    setSelectedEnvKey(row.key); // abre direto o detalhe do ambiente recém-criado
  };

  const removeEnvironment = (key: string) => {
    setEnvironments(prev => prev.filter(e => e.key !== key));
    setRemovingEnvKey(null);
    if (selectedEnvKey === key) setSelectedEnvKey(null); // volta pra lista
  };

  const updateEnvironmentField = (key: string, field: keyof EnvRow, value: string) => {
    setEnvironments(prev => prev.map(e => e.key === key ? { ...e, [field]: value } : e));
  };

  // Foto do ambiente: aceita null (remover). Separado de updateEnvironmentField
  // que é tipado pra string dos campos de texto/numéricos.
  const setEnvironmentPhoto = (key: string, photoUrl: string | null) => {
    setEnvironments(prev => prev.map(e => e.key === key ? { ...e, photo_url: photoUrl } : e));
  };

  // Expande/colapsa a config POR MÁQUINA (PMOC). SEPARADO da membership.
  const toggleExpanded = (eqId: string) => {
    setExpandedEqIds(prev => {
      const next = new Set(prev);
      if (next.has(eqId)) next.delete(eqId);
      else next.add(eqId);
      return next;
    });
  };

  // Adiciona um equipamento ao ambiente (membership), tirando de outros. No comum,
  // se vinha do grupo "Sem ambiente", deixa de ser solto.
  const addEquipmentToEnv = (envKey: string, eqId: string) => {
    setEnvironments(prev => prev.map(e => {
      if (e.key === envKey) {
        if (e.equipment_ids.includes(eqId)) return e;
        return { ...e, equipment_ids: [...e.equipment_ids, eqId] };
      }
      return { ...e, equipment_ids: e.equipment_ids.filter(id => id !== eqId) };
    }));
    if (!isPmoc) setLooseItems(prev => prev.filter(it => it.equipment_id !== eqId));
  };

  // Remove o equipamento do ambiente (membership). Colapsa a config também.
  // PMOC: remover do ambiente = sair do contrato. Comum: volta pro grupo "Sem
  // ambiente" (continua no contrato), preservando o snapshot do item.
  const removeEquipmentFromEnv = (envKey: string, eqId: string) => {
    if (!isPmoc) {
      const existing = (editContract?.contract_items || []).find((it: any) => it.equipment_id === eqId);
      const eq = equipmentById.get(eqId);
      const snapshot: LooseItem = {
        equipment_id: eqId,
        item_name: existing?.item_name ?? eq?.name ?? 'Equipamento',
        item_description: existing?.item_description ?? ([eq?.brand, eq?.model].filter(Boolean).join(' - ') || null),
        form_template_id: existing?.form_template_id ?? null,
      };
      setLooseItems(prev => (prev.some(it => it.equipment_id === eqId) ? prev : [...prev, snapshot]));
    }
    setEnvironments(prev => prev.map(e => e.key === envKey ? { ...e, equipment_ids: e.equipment_ids.filter(id => id !== eqId) } : e));
    setExpandedEqIds(prev => {
      if (!prev.has(eqId)) return prev;
      const next = new Set(prev);
      next.delete(eqId);
      return next;
    });
    setRemovingMember(null);
  };

  // Remove DE VEZ do contrato (a partir do grupo "Sem ambiente"). looseIdx cobre
  // itens manuais (sem equipment_id).
  const removeLooseItem = (looseIdx: number) => {
    setLooseItems(prev => prev.filter((_, i) => i !== looseIdx));
    setRemovingMember(null);
  };

  // Adiciona um equipamento ao grupo virtual "Sem ambiente" (comum). Tira de
  // qualquer ambiente real (exclusividade) e materializa o snapshot do item.
  const addEquipmentAsLoose = (eqId: string) => {
    const existing = (editContract?.contract_items || []).find((it: any) => it.equipment_id === eqId);
    const eq = equipmentById.get(eqId);
    const snapshot: LooseItem = {
      equipment_id: eqId,
      item_name: existing?.item_name ?? eq?.name ?? 'Equipamento',
      item_description: existing?.item_description ?? ([eq?.brand, eq?.model].filter(Boolean).join(' - ') || null),
      form_template_id: existing?.form_template_id ?? null,
    };
    setEnvironments(prev => prev.map(e => ({ ...e, equipment_ids: e.equipment_ids.filter(id => id !== eqId) })));
    setLooseItems(prev => (prev.some(it => it.equipment_id === eqId) ? prev : [...prev, snapshot]));
  };

  // Move um item solto (looseIdx) pra um ambiente real. Item manual (sem
  // equipment_id) não pode entrar num ambiente (ambiente liga por equipment_id) —
  // o botão só aparece pra item com equipamento.
  const moveLooseToEnv = (looseIdx: number, envKey: string) => {
    const it = looseItems[looseIdx];
    if (!it?.equipment_id) { setMovingLooseIdx(null); return; }
    addEquipmentToEnv(envKey, it.equipment_id);
    setMovingLooseIdx(null);
  };

  // ---- Picker de equipamentos do ambiente (membership) ----------------------
  const openMemberPicker = (envKey: string) => {
    setMemberPickerEnvKey(envKey);
    setMemberPickerSearch('');
    setMemberPickerSelection(new Set());
  };
  const toggleMemberPick = (eqId: string) => {
    setMemberPickerSelection(prev => {
      const next = new Set(prev);
      if (next.has(eqId)) next.delete(eqId);
      else next.add(eqId);
      return next;
    });
  };
  const confirmMemberPicker = () => {
    if (!memberPickerEnvKey) return;
    if (memberPickerEnvKey === LOOSE_ENV_KEY) {
      for (const eqId of memberPickerSelection) addEquipmentAsLoose(eqId);
    } else {
      for (const eqId of memberPickerSelection) addEquipmentToEnv(memberPickerEnvKey, eqId);
    }
    setMemberPickerEnvKey(null);
  };

  // Itens (contract_items) derivados dos ambientes: 1 item por equipamento
  // atribuído a algum ambiente. Vale pra PMOC e comum. Equipamento não atribuído
  // a nenhum ambiente fica de fora (no comum vai pelos looseItems).
  const derivedItems = useMemo(() => {
    const seen = new Set<string>();
    const out: { equipment_id: string; item_name: string; item_description?: string }[] = [];
    for (const env of environments) {
      for (const eqId of env.equipment_ids) {
        if (seen.has(eqId)) continue;
        seen.add(eqId);
        const eq = activeEquipment.find(e => e.id === eqId) || equipment.find(e => e.id === eqId);
        if (eq) {
          out.push({
            equipment_id: eq.id,
            item_name: eq.name,
            item_description: [eq.brand, eq.model].filter(Boolean).join(' - ') || undefined,
          });
          continue;
        }
        // FIX A — equipamento não resolvido (inativo ou ainda não carregado pela
        // query de equipamentos). NUNCA descartar: o diff de itens do backend
        // apagaria esse contract_item (perda de dado) mesmo o usuário não tendo
        // mexido nele. Em edição caímos no snapshot persistido do contrato (mesmo
        // equipment_id), reusando item_name/item_description gravados pra que a
        // chave `eq:<id>` sobreviva ao diff. (Na criação não há snapshot — mas aí
        // o equipamento veio de uma seleção recém-feita, sempre presente em
        // `equipment`; o ramo de fallback só vale pra edição.)
        const snap = (editContract?.contract_items || []).find(
          (it: any) => it.equipment_id === eqId,
        );
        out.push({
          equipment_id: eqId,
          item_name: snap?.item_name ?? 'Equipamento',
          item_description: snap?.item_description ?? undefined,
        });
      }
    }
    return out;
  }, [environments, activeEquipment, equipment, editContract?.contract_items]);
  // Alias mantido pra uso interno PMOC (plano/itens com escopo). Idêntico no PMOC.
  const pmocDerivedItems = derivedItems;

  // Conjunto efetivo de itens/equipamentos (chaves) do contrato — usado pra
  // detectar mudança de cronograma. PMOC = só ambientes; comum = ambientes +
  // soltos (que vão como environment_id NULL).
  const effectiveItems = useMemo(() => {
    if (isPmoc) return derivedItems;
    const inEnv = new Set(environments.flatMap(e => e.equipment_ids));
    const loose = looseItems.filter(it => !it.equipment_id || !inEnv.has(it.equipment_id));
    return [...derivedItems, ...loose];
  }, [isPmoc, derivedItems, environments, looseItems]);

  // ---- Rotina POR MÁQUINA (Fase 3) ------------------------------------------
  // Config default de uma máquina: delega à fonte ÚNICA compartilhada (escopo
  // dado, começa na 12, listagem = norma do escopo). `equipment_ref` amarra cada
  // atividade ao seu equipamento.
  const buildDefaultMachineConfig = (eqId: string, scope: PmocMachineScope): MachineConfig =>
    buildDefaultMachineConfigShared(catalogActivities, eqId, scope);

  // Mantém os machineConfigs sincronizados com os equipamentos selecionados nos
  // ambientes: cria config default pra máquina nova; remove a da máquina que saiu.
  // Não toca em config existente (preserva escopo/fase/listagem do gestor).
  useEffect(() => {
    if (!open || !isPmoc) return;
    if (catalogLoading || catalogActivities.length === 0) return;
    // Em edição, espera a reconstrução das configs do banco antes de auto-sincar
    // (senão substituiria escopo/fase salvos por defaults).
    if (isEditing && !machineConfigsLoaded) return;
    // Conjunto autoritativo de máquinas = equipamentos atribuídos a algum
    // ambiente. Usamos os equipment_ids dos ambientes (e não pmocDerivedItems)
    // porque a derivação depende dos dados de equipamento já terem carregado;
    // ao retomar um rascunho, os ambientes voltam na hora mas o useEquipment
    // ainda está buscando — basear no equipment_ids evita podar configs
    // restauradas durante essa janela de carga.
    const selectedIds = new Set<string>();
    for (const env of environments) for (const id of env.equipment_ids) selectedIds.add(id);
    setMachineConfigs(prev => {
      let changed = false;
      const next: Record<string, MachineConfig> = {};
      for (const id of selectedIds) {
        if (prev[id]) { next[id] = prev[id]; }
        else { next[id] = buildDefaultMachineConfig(id, 'ac'); changed = true; }
      }
      // Detecta remoção (chave que sumiu).
      for (const id of Object.keys(prev)) if (!selectedIds.has(id)) changed = true;
      return changed ? next : prev;
    });
  }, [open, isPmoc, environments, catalogLoading, catalogActivities.length, isEditing, machineConfigsLoaded]);

  // ---- Checklist por equipamento (contrato COMUM) ---------------------------
  // Conjunto autoritativo de equipamentos do comum = os que estão em algum
  // ambiente OU soltos (com equipment_id). Poda as entradas de commonChecklists
  // de equipamentos que saíram do contrato (não acumula lixo). Não cria entrada
  // default: ausência = "sem checklist" (acesso lazy via getCommonChecklist).
  useEffect(() => {
    if (!open || isPmoc) return;
    const ids = new Set<string>();
    for (const env of environments) for (const id of env.equipment_ids) ids.add(id);
    for (const it of looseItems) if (it.equipment_id) ids.add(it.equipment_id);
    setCommonChecklists(prev => {
      let changed = false;
      const next: Record<string, { formTemplateIds: string[]; excluded: string[] }> = {};
      for (const [id, cfg] of Object.entries(prev)) {
        if (ids.has(id)) next[id] = cfg;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [open, isPmoc, environments, looseItems]);

  // Leitura segura: equipamento sem entrada → nenhum checklist, sem exclusões.
  const getCommonChecklist = (eqId: string) =>
    commonChecklists[eqId] ?? { formTemplateIds: [], excluded: [] };

  // Define a LISTA de checklists do equipamento. As exclusões que não pertencem
  // mais a nenhum checklist restante são podadas pelo editor antes de chamar
  // onChangeExcluded; aqui só guardamos a nova lista preservando as exclusões.
  const setCommonChecklistTemplates = (eqId: string, templateIds: string[]) => {
    setCommonChecklists(prev => {
      const cur = prev[eqId];
      const sameList =
        cur && cur.formTemplateIds.length === templateIds.length &&
        cur.formTemplateIds.every((id, i) => id === templateIds[i]);
      if (sameList) return prev;
      return { ...prev, [eqId]: { formTemplateIds: templateIds, excluded: cur?.excluded ?? [] } };
    });
  };

  // Atualiza as exclusões da 1ª OS daquele equipamento.
  const setCommonChecklistExcluded = (eqId: string, excluded: string[]) => {
    setCommonChecklists(prev => ({
      ...prev,
      [eqId]: { formTemplateIds: prev[eqId]?.formTemplateIds ?? [], excluded },
    }));
  };

  // Troca o escopo de uma máquina: recarrega a listagem da norma do novo escopo
  // (a menos que o gestor já tenha personalizado — aí preserva e só filtra o que
  // ainda cabe no escopo, mantendo a personalização). Para simplicidade e
  // previsibilidade, ao trocar o escopo RECARREGAMOS a norma do escopo novo.
  const setMachineScope = (eqId: string, scope: PmocMachineScope) => {
    setMachineConfigs(prev => {
      const cur = prev[eqId];
      if (!cur) return prev;
      const acts = machineCatalogActivities(catalogActivities, scope).map(a => ({
        ...catalogToPlanRow(a),
        applies_per_equipment: true,
        equipment_ref: eqId,
      }));
      return { ...prev, [eqId]: { ...cur, scope, activities: acts, customized: false } };
    });
  };

  const setMachineStartVisit = (eqId: string, startVisit: number) => {
    setMachineConfigs(prev => {
      const cur = prev[eqId];
      if (!cur) return prev;
      return { ...prev, [eqId]: { ...cur, startVisit } };
    });
  };

  // Há ao menos uma máquina de grande porte ('full')? Gate do bucket local.
  const hasFullMachine = useMemo(
    () => Object.values(machineConfigs).some(c => c.scope === 'full'),
    [machineConfigs],
  );

  // Checklists personalizados do tenant (form_templates ativos, não-pmoc-default)
  // pro picker e pro plano. `templateNameById` rotula a linha de plano custom.
  const customTemplateOptions = useMemo(
    () =>
      (templates ?? [])
        .filter((t: any) => t.is_active && !t.is_pmoc_default)
        .map((t: any) => ({
          id: t.id,
          name: t.name,
          questionCount: (t.questions ?? []).length,
          // Perguntas (com frequência) pra expandir o personalizado no picker da
          // máquina e gerir o "Adicionar na 1ª OS?" por pergunta.
          questions: ((t.questions ?? []) as any[]).map((q) => ({
            id: q.id,
            question: q.question,
            position: q.position ?? null,
            freq_kind: q.freq_kind ?? null,
            freq_months: q.freq_months ?? null,
            freq_days: q.freq_days ?? null,
            freq_visits: q.freq_visits ?? null,
            start_kind: q.start_kind ?? null,
            start_visit: q.start_visit ?? null,
          })),
        })),
    [templates],
  );
  const templateNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of customTemplateOptions) map[t.id] = t.name;
    return map;
  }, [customTemplateOptions]);

  // Checklists personalizados COM perguntas (frequência inclusa) pro editor do
  // contrato comum. Mesma fonte (templates já trazem `questions`); só normaliza o
  // shape mínimo que o CommonChecklistEditor consome.
  const commonChecklistTemplates = useMemo<ChecklistTemplateOption[]>(
    () =>
      (templates ?? [])
        .filter((t: any) => t.is_active && !t.is_pmoc_default)
        .map((t: any) => ({
          id: t.id,
          name: t.name,
          questions: ((t.questions ?? []) as any[]).map((q) => ({
            id: q.id,
            question: q.question,
            position: q.position ?? null,
            freq_kind: q.freq_kind ?? null,
            freq_months: q.freq_months ?? null,
            freq_days: q.freq_days ?? null,
            freq_visits: q.freq_visits ?? null,
            start_kind: q.start_kind ?? null,
            start_visit: q.start_visit ?? null,
          })),
        })),
    [templates],
  );

  // Mapa de perguntas-toda-visita por template — usado pra NUNCA gravar uma
  // pergunta obrigatória na lista de exclusões e pra sanitizar exclusões que não
  // pertencem mais ao template escolhido.
  const templateQuestionsById = useMemo(() => {
    const map = new Map<string, ChecklistTemplateOption>();
    for (const t of commonChecklistTemplates) map.set(t.id, t);
    return map;
  }, [commonChecklistTemplates]);

  // Perguntas (id + everyVisit) por template pra sanitizar a âncora da 1ª OS dos
  // personalizados ao montar os itens PMOC (buildPmocItemsWithScope).
  const templateQuestionsRefById = useMemo(() => {
    const map: Record<string, { id: string; everyVisit: boolean }[]> = {};
    for (const t of commonChecklistTemplates) {
      map[t.id] = t.questions.map((q) => ({ id: q.id, everyVisit: isEveryVisit(q) }));
    }
    return map;
  }, [commonChecklistTemplates]);

  // Plano completo (por máquina + local) que vai pro hook em PMOC, montado pela
  // fonte ÚNICA compartilhada (mesma usada pela aba Ambientes). Cada atividade de
  // máquina carrega `equipment_ref`; as locais ficam sem máquina + per_equip false.
  // Templates personalizados viram 1 linha por máquina (form_template_id).
  const pmocPlanFromMachines = useMemo<PlanActivityRow[]>(
    () => buildPmocPlanFromMachines({ items: pmocDerivedItems, machineConfigs, catalogActivities, templateNameById }),
    [pmocDerivedItems, machineConfigs, catalogActivities, templateNameById],
  );

  // Plano efetivo enviado ao hook: PMOC = derivado das máquinas (por máquina +
  // local); comum/legado = o planActivities da etapa de frequência.
  const effectivePlanRows = isPmoc ? pmocPlanFromMachines : planActivities;

  // Decisão CEO: contrato COMUM nunca usa o "Plano" (frequências por serviço) —
  // sempre o Checklist Padrão com frequência por pergunta. O construtor de plano
  // some pro comum. EXCEÇÃO legado: um comum que JÁ tem plano persistido
  // (`contract_plan_activities`) continua editável e gera OS normalmente — não
  // forçamos conversão nem apagamos o plano dele. `existingPlan` (undefined
  // enquanto carrega) só tem linhas quando o contrato salvo realmente tinha plano.
  const hasLegacyCommonPlan = isEditing && !isPmoc && (existingPlan?.length ?? 0) > 0;
  // Quando exibir o construtor de plano na etapa de Frequência: nunca em PMOC
  // (que monta por máquina) e, no comum, SÓ pra preservar/editar um plano legado.
  const showCommonPlanBuilder = !isPmoc && hasLegacyCommonPlan;

  // FIX 2 (hardening): só envia `plan_activities` quando o contrato realmente tem
  // plano — PMOC (plano por máquina) ou comum LEGADO (plano persistido). Comum sem
  // plano manda `undefined` (em vez de `[]`) pra não disparar o diff de plano à toa
  // e desacoplar o checklist por pergunta do motor de plano. NÃO reabre o construtor
  // de plano do comum (continua só pra legado via showCommonPlanBuilder).
  const planActivitiesPayload =
    isPmoc || hasLegacyCommonPlan ? effectivePlanRows.map(planRowToInput) : undefined;

  // Campos de checklist por equipamento do contrato comum (form_template_id +
  // first_os_excluded_questions). Sanitiza as exclusões: só ids que (a) pertencem
  // ao template escolhido e (b) NÃO são perguntas "toda visita" (que sempre entram
  // na 1ª OS). Equipamento sem entrada → sem checklist e sem exclusões.
  //
  // FIX 1 (perda de dado): `first_os_excluded_questions` pode vir `undefined`
  // quando o template escolhido AINDA NÃO foi resolvido (catálogo de checklists
  // carregando). Sanitizar contra um catálogo vazio derruba as exclusões salvas
  // pra `[]` e, como o diff de `useContracts` só PRESERVA quando o campo é
  // `undefined` (guarda `wantExcluded !== undefined`), gravaríamos `[]` por engano
  // e todas as perguntas voltariam a entrar na 1ª OS sem o usuário tocar. Ao
  // mandar `undefined` nesse caso, caímos na guarda de PRESERVAÇÃO (mantém o que
  // está no banco). Só sanitiza/deriva quando o template está realmente carregado.
  const commonChecklistPayload = (
    eqId: string | null | undefined,
  ): {
    form_template_ids: string[];
    form_template_id: string | null;
    first_os_excluded_questions: string[] | undefined;
  } => {
    if (!eqId) return { form_template_ids: [], form_template_id: null, first_os_excluded_questions: [] };
    const cfg = commonChecklists[eqId];
    const tplIds = cfg?.formTemplateIds ?? [];
    if (tplIds.length === 0) {
      return { form_template_ids: [], form_template_id: null, first_os_excluded_questions: [] };
    }
    // Compat: o primeiro id continua em form_template_id (single).
    const primaryId = tplIds[0];
    // Resolve TODOS os templates do item. Se ALGUM ainda não está no mapa E o
    // catálogo está carregando → NÃO sanitizar/sobrescrever: `undefined` preserva
    // as exclusões já salvas no banco (a guarda `wantExcluded !== undefined` do
    // hook mantém o que está persistido). Já carregado e template sumiu → seu set
    // de perguntas válidas é vazio de propósito (exclusões órfãs caem).
    const resolved = tplIds.map((id) => templateQuestionsById.get(id));
    const anyUnresolved = resolved.some((t) => !t);
    if (anyUnresolved && templatesLoading) {
      return { form_template_ids: tplIds, form_template_id: primaryId, first_os_excluded_questions: undefined };
    }
    const validIds = new Set<string>();
    for (const tpl of resolved) {
      for (const q of tpl?.questions ?? []) {
        if (!isEveryVisit(q)) validIds.add(q.id); // toda visita nunca exclui
      }
    }
    const excluded = (cfg?.excluded ?? []).filter((id) => validIds.has(id));
    return { form_template_ids: tplIds, form_template_id: primaryId, first_os_excluded_questions: excluded };
  };

  // Itens com escopo/fase por máquina (Fase 3). PMOC anexa pmoc_scope +
  // pmoc_start_visit de cada máquina (via builder compartilhado); comum manda só
  // o básico + o checklist por equipamento (form_template_id + exclusões da 1ª OS).
  const effectiveItemsWithScope = useMemo(() => {
    if (!isPmoc) {
      // Comum: itens dos ambientes (o hook religa environment_id pelos
      // equipment_ids dos ambientes) + itens SOLTOS (environment_id NULL). Soltos
      // que foram movidos pra um ambiente saem daqui (evita chave duplicada).
      const inEnv = new Set(environments.flatMap(e => e.equipment_ids));
      const envItems = derivedItems.map((i) => {
        const ck = commonChecklistPayload(i.equipment_id);
        return {
          equipment_id: i.equipment_id || null,
          item_name: i.item_name,
          item_description: i.item_description || null,
          form_template_ids: ck.form_template_ids,
          form_template_id: ck.form_template_id,
          first_os_excluded_questions: ck.first_os_excluded_questions,
        };
      });
      const looseItemsPayload = looseItems
        .filter(it => !it.equipment_id || !inEnv.has(it.equipment_id))
        .map((it) => {
          const ck = commonChecklistPayload(it.equipment_id);
          return {
            equipment_id: it.equipment_id || null,
            item_name: it.item_name,
            item_description: it.item_description || null,
            // Item COM equipamento usa a LISTA de checklists; item manual mantém o
            // form_template_id do snapshot (não tem editor por equipamento).
            form_template_ids: it.equipment_id ? ck.form_template_ids : [],
            form_template_id: it.equipment_id ? ck.form_template_id : (it.form_template_id || null),
            first_os_excluded_questions: ck.first_os_excluded_questions,
          };
        });
      return [...envItems, ...looseItemsPayload];
    }
    return buildPmocItemsWithScope({ items: pmocDerivedItems, machineConfigs, templateQuestions: templateQuestionsRefById, templatesLoading });
  }, [isPmoc, derivedItems, environments, looseItems, pmocDerivedItems, machineConfigs, commonChecklists, templateQuestionsById, templateQuestionsRefById, templatesLoading]);

  // Atividades do plano efetivo com frequência válida pra cronograma (exclui
  // eventuais). PMOC usa o plano POR MÁQUINA; comum usa o planActivities.
  const schedulablePlan = useMemo(
    () => effectivePlanRows.filter(a => activityPeriodMonths(a as PlanActivityInput) > 0),
    [effectivePlanRows],
  );
  const usePlanEngine = schedulablePlan.length > 0;

  // Quando há plano, a prévia/contagem de OS vem do motor de visitas agrupadas
  // (1 OS/mês = união do que vence), não da cadência única. Para PMOC, cada
  // máquina pode estar em fase diferente, mas o nº de visitas/mês continua 1.
  const groupedVisits = useMemo(
    () => usePlanEngine
      ? generateGroupedVisits(new Date(startDate + 'T00:00:00'), horizonMonths, schedulablePlan as PlanActivityInput[])
      : [],
    [usePlanEngine, startDate, horizonMonths, schedulablePlan],
  );

  // Nº de OS que será gerado (prévia do botão/Revisão).
  const visitCount = usePlanEngine ? groupedVisits.length : occurrences.length;


  // Ambientes no formato de entrada do hook (parse dos números, equip vazio ok).
  const buildEnvironmentsInput = () => environments.map(e => ({
    id: e.id,
    identificacao: e.identificacao.trim() || null,
    tipo_atividade: e.tipo_atividade.trim() || null,
    area_climatizada_m2: parseDecimalBR(e.area_climatizada_m2),
    ocupantes_fixos: parseIntOrNull(e.ocupantes_fixos),
    ocupantes_flutuantes: parseIntOrNull(e.ocupantes_flutuantes),
    carga_termica_tr: parseDecimalBR(e.carga_termica_tr),
    photo_url: e.photo_url ?? null,
    equipment_ids: e.equipment_ids,
  }));

  const canNext = () => {
    switch (currentStepKey) {
      case 'info':
        // Bloqueio só pra nome + cliente. PMOC sem RT é permitido (warning no submit).
        return !!customerId && !!name;
      case 'unit':
        // Unidade & RT são opcionais (RT pode vir depois; unidade pré-preenche do cliente).
        return true;
      case 'frequency':
        return freqValue > 0 && !!startDate;
      case 'team':
        // Exige ao menos 1 responsável pela execução (técnico OU equipe).
        return (selectedUserIds?.length ?? 0) > 0 || (selectedTeamIds?.length ?? 0) > 0;
      case 'items':
      case 'review':
      default:
        return true;
    }
  };

  // Há ao menos 1 técnico OU equipe executora? (gate da etapa Equipe + submit).
  const hasExecutor = (selectedUserIds?.length ?? 0) > 0 || (selectedTeamIds?.length ?? 0) > 0;

  // Aplica de fato a edição (chamado direto ou após confirmar o recálculo).
  // Passa plan_activities (o updateContract substitui o plano e regenera as
  // visitas futuras quando o cronograma muda) e assignee_user_ids.
  const doUpdate = async ({ actualTechnicianId, actualTeamId }: { actualTechnicianId: string | null; actualTeamId: string | null }) => {
    await updateContract.mutateAsync({
      id: editContract.id,
      // Lock otimista (concorrência): manda o updated_at que o form carregou. Se
      // outra aba/sessão salvou no meio, o hook aborta com erro amigável.
      expectedUpdatedAt: editContract.updated_at ?? null,
      name,
      customer_id: customerId,
      technician_id: actualTechnicianId,
      team_id: actualTeamId,
      assignee_user_ids: selectedUserIds,
      service_type_id: serviceTypeId || null,
      // Com plano de serviços, o checklist vem das atividades por equipamento —
      // não duplicar com um checklist padrão de contrato.
      form_template_id: usePlanEngine ? null : (formTemplateId || null),
      status: isActive ? 'active' : 'paused',
      notes: notes || null,
      frequency_type: freqType,
      frequency_value: freqValue,
      start_date: startDate,
      horizon_months: horizonMonths,
      billing_responsible_ids: billingUserIds,
      // Plano de serviços com frequência (Fase 1/2/3). PMOC = plano POR MÁQUINA
      // (cada atividade com equipment_ref + as locais); comum LEGADO = planActivities.
      // Comum SEM plano = undefined (não toca contract_plan_activities — preserva).
      // O hook resolve contract_item_id pelo equipment_ref.
      plan_activities: planActivitiesPayload,
      // Equipamentos/itens (Fase 3). Sempre enviado em edição → o hook aplica
      // diff (insere novos, apaga removidos) e RE-APLICA escopo/fase por máquina;
      // mudança re-expande as visitas. PMOC = derivado dos ambientes c/ escopo+fase.
      items: effectiveItemsWithScope,
      // Ambientes (PMOC e comum). Ambos enviam os cards; o hook religa
      // environment_id dos itens pelos equipment_ids de cada ambiente (quem não
      // está em nenhum ambiente fica NULL = grupo "Sem ambiente").
      environments: buildEnvironmentsInput(),
      // PMOC (Onda A)
      is_pmoc: isPmoc,
      responsible_technician_id: isPmoc ? (responsibleTechnicianId || null) : null,
      // Identificação da unidade (Seção 1 da Planilha). Só grava em PMOC.
      unidade_nome: isPmoc ? (unidadeNome.trim() || null) : null,
      unidade_endereco: isPmoc ? (unidadeEndereco.trim() || null) : null,
      unidade_numero: isPmoc ? (unidadeNumero.trim() || null) : null,
      unidade_complemento: isPmoc ? (unidadeComplemento.trim() || null) : null,
      unidade_bairro: isPmoc ? (unidadeBairro.trim() || null) : null,
      unidade_cidade: isPmoc ? (unidadeCidade.trim() || null) : null,
      unidade_uf: isPmoc ? (unidadeUf.trim() || null) : null,
      unidade_cep: isPmoc ? (unidadeCep.trim() || null) : null,
    });
  };

  // Confirma o recálculo das visitas futuras e aplica a edição.
  const confirmRegenAndUpdate = async () => {
    setShowRegenConfirm(false);
    setSubmitting(true);
    try {
      const actualTeamId = selectedTeamIds.length > 0 ? selectedTeamIds[0] : null;
      const actualTechnicianId = !actualTeamId && selectedUserIds.length > 0 ? selectedUserIds[0] : null;
      await doUpdate({ actualTechnicianId, actualTeamId });
      onOpenChange(false);
      if (onCreated) onCreated(editContract.id);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    // Defesa em profundidade: nunca salvar sem responsável pela execução.
    if (!hasExecutor) {
      toast({
        variant: 'destructive',
        title: 'Sem responsável pela execução',
        description: 'Selecione ao menos 1 técnico ou equipe para executar o contrato.',
      });
      setStep(STEPS.findIndex(s => s.key === 'team'));
      return;
    }
    setSubmitting(true);
    try {
      const actualTeamId = selectedTeamIds.length > 0 ? selectedTeamIds[0] : null;
      // Only set technician_id when NO team is selected and there are individual users
      const actualTechnicianId = !actualTeamId && selectedUserIds.length > 0 ? selectedUserIds[0] : null;

      // PMOC com RT vazio: permitimos salvar mas avisamos o usuário.
      // RT pode ser definido depois — o que NÃO pode é ficar sem o flag ligado e
      // sem ninguém ciente disso. Toast variant `default` (sistema só tem default
      // e destructive); emoji ⚠️ comunica o tom de warning sem inventar variant nova.
      if (isPmoc && !responsibleTechnicianId) {
        toast({
          title: '⚠️ Sem Responsável Técnico (RT) definido',
          description: 'Recomendamos definir um RT antes de ativar PMOC. Você pode atribuir depois.',
        });
      }

      if (isEditing) {
        // Mudou algo que afeta o cronograma? (campos de frequência OU o plano)
        const scheduleFieldsChanged =
          startDate !== (editContract.start_date || '') ||
          freqType !== (editContract.frequency_type || 'months') ||
          freqValue !== (editContract.frequency_value || 1) ||
          horizonMonths !== (editContract.horizon_months || 12);
        const currentPlanSig = planSigOf(planActivities);
        const planChanged = currentPlanSig !== initialPlanSig;
        // Mudança no conjunto de equipamentos também re-expande as visitas
        // (mesma chave estável usada no hook: equipment_id ou nome do manual).
        // FIX B — chave do item manual inclui a descrição (`manual:<nome>:<desc>`),
        // espelhando o diff do backend (useContracts ~2089/2485) e o looseItemKey
        // da aba. Mantém itens manuais homônimos com descrições diferentes como
        // chaves distintas (antes colapsavam). 100% derivada do conteúdo → estável
        // dos dois lados.
        const itemKey = (it: { equipment_id?: string | null; item_name: string; item_description?: string | null }) =>
          it.equipment_id
            ? `eq:${it.equipment_id}`
            : `manual:${(it.item_name || '').trim().toLowerCase()}:${(it.item_description || '').trim().toLowerCase()}`;
        const initialItemsSig = ((editContract.contract_items || []) as any[])
          .map((it) => itemKey(it)).sort().join('§');
        const currentItemsSig = effectiveItems.map((it: any) => itemKey(it)).sort().join('§');
        const itemsChanged = initialItemsSig !== currentItemsSig;

        // Contrato comum: mudar o checklist por equipamento (template ou exclusões
        // da 1ª OS) também muda o que a 1ª OS contém → conta como mudança de
        // cronograma. Assinatura por equipamento: form_template_id + exclusões
        // ordenadas. Reconstruída IDÊNTICA do banco (contract_items) e do payload
        // atual (effectiveItemsWithScope) — "salvar sem mudança" fica no-op.
        // Lista efetiva de checklists da linha: form_template_ids se não-vazio;
        // senão [form_template_id] (compat). Reconstruída idêntica do banco e do
        // payload pra que "salvar sem mudança" continue no-op. Ordenada (a ordem
        // não é semântica pra detecção de mudança).
        const effectiveTplIds = (it: any): string[] => {
          const ids = Array.isArray(it.form_template_ids)
            ? (it.form_template_ids as any[]).filter((x) => typeof x === 'string')
            : [];
          if (ids.length > 0) return ids;
          return it.form_template_id ? [it.form_template_id] : [];
        };
        // Exclusões da 1ª OS por equipamento no estado INICIAL (banco). Usado como
        // fallback quando a linha atual vem com first_os_excluded_questions
        // `undefined` (templates carregando, guarda anti-perda-de-dado): nesse caso
        // a comparação enxerga o valor do banco → "salvar com templates carregando"
        // não dispara prompt de regeneração falso.
        const initialExcludedByEquip = new Map<string, string[]>();
        for (const it of (editContract.contract_items || []) as any[]) {
          if (!it.equipment_id) continue;
          initialExcludedByEquip.set(
            it.equipment_id,
            Array.isArray(it.first_os_excluded_questions)
              ? (it.first_os_excluded_questions as any[]).filter((x) => typeof x === 'string')
              : [],
          );
        }
        const checklistSig = (rows: any[]) =>
          rows
            .filter((it) => it.equipment_id)
            .map((it) => {
              // `undefined` = guarda anti-perda: cai pro valor do banco daquele equip.
              const raw = it.first_os_excluded_questions === undefined
                ? (initialExcludedByEquip.get(it.equipment_id) ?? [])
                : it.first_os_excluded_questions;
              const ex = Array.isArray(raw)
                ? [...raw].filter((x) => typeof x === 'string').sort()
                : [];
              const tpls = [...effectiveTplIds(it)].sort();
              return `eq:${it.equipment_id}|${tpls.join(',')}|${ex.join(',')}`;
            })
            .sort()
            .join('§');
        const initialChecklistSig = checklistSig((editContract.contract_items || []) as any[]);
        const currentChecklistSig = checklistSig(effectiveItemsWithScope as any[]);
        // Vale pro comum (template + exclusões) E pro PMOC (a 1ª-OS por pergunta
        // dos personalizados grava em contract_items.first_os_excluded_questions
        // da máquina; o plano não muda, então o diff de checklist é o que detecta).
        const checklistChanged = initialChecklistSig !== currentChecklistSig;

        const scheduleChanged = scheduleFieldsChanged || planChanged || itemsChanged || checklistChanged;

        // Quantas OSs futuras não-realizadas seriam refeitas (preview do diálogo).
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const futureRegenerable = ((editContract.service_orders || []) as any[]).filter(
          (os) =>
            REGENERABLE_OS_STATUSES.has(os.status ?? '') &&
            (os.scheduled_date ?? '') >= todayStr,
        ).length;

        // Cronograma muda E há visitas futuras a refazer → confirma antes.
        if (isActive && scheduleChanged && futureRegenerable > 0) {
          setRegenCount(futureRegenerable);
          setShowRegenConfirm(true);
          setSubmitting(false);
          return;
        }

        await doUpdate({ actualTechnicianId, actualTeamId });
        onOpenChange(false);
        if (onCreated) onCreated(editContract.id);
      } else {
        const result = await createContract.mutateAsync({
          name,
          customer_id: customerId,
          technician_id: actualTechnicianId,
          team_id: actualTeamId,
          assignee_user_ids: selectedUserIds,
          billing_responsible_ids: billingUserIds,
          service_type_id: serviceTypeId || null,
          // Com plano de serviços, o checklist vem das atividades por equipamento.
          form_template_id: usePlanEngine ? null : (formTemplateId || null),
          status: isActive ? 'active' : 'paused',
          notes: notes || null,
          frequency_type: freqType,
          frequency_value: freqValue,
          start_date: startDate,
          horizon_months: horizonMonths,
          // PMOC (Onda A). RT vai vazio quando o usuário ainda não escolheu.
          is_pmoc: isPmoc,
          responsible_technician_id: isPmoc ? (responsibleTechnicianId || null) : null,
          // Identificação da unidade (Seção 1 da Planilha). Só faz sentido em PMOC.
          unidade_nome: isPmoc ? (unidadeNome.trim() || null) : null,
          unidade_endereco: isPmoc ? (unidadeEndereco.trim() || null) : null,
          unidade_numero: isPmoc ? (unidadeNumero.trim() || null) : null,
          unidade_complemento: isPmoc ? (unidadeComplemento.trim() || null) : null,
          unidade_bairro: isPmoc ? (unidadeBairro.trim() || null) : null,
          unidade_cidade: isPmoc ? (unidadeCidade.trim() || null) : null,
          unidade_uf: isPmoc ? (unidadeUf.trim() || null) : null,
          unidade_cep: isPmoc ? (unidadeCep.trim() || null) : null,
          // Itens do contrato: PMOC = derivados dos ambientes com escopo+fase por
          // máquina (Fase 3); comum = lista flat.
          items: effectiveItemsWithScope,
          // Ambientes (PMOC e comum). Cada ambiente vira uma linha em
          // contract_environments e amarra seus equipamentos (environment_id).
          environments: buildEnvironmentsInput(),
          // Plano de serviços com frequência (Fase 1/2/3). PMOC = plano POR MÁQUINA
          // (cada atividade com equipment_ref; o hook resolve contract_item_id após
          // inserir os itens). Comum LEGADO = planActivities; comum SEM plano =
          // undefined (não cria contract_plan_activities). Vazio = frequência única.
          plan_activities: planActivitiesPayload,
        });

        const generatedOsCount = (result as any)?.generatedOsCount ?? 0;
        const expectedOsCount = (result as any)?.expectedOsCount ?? visitCount;
        const newContractId = (result as any)?.id as string | undefined;

        // Auto-gera a V1 dos documentos PMOC (TRT, Certificado, Cronograma,
        // Dossiê) em segundo plano. SÓ pra contratos PMOC — contrato comum não
        // tem documentos e a chamada nem dispara. Best-effort: não bloqueia o
        // navigate nem trava a UI; erros individuais são ignorados (o gestor
        // gera manual depois se faltar CNPJ/RT).
        if (isPmoc && newContractId) {
          void autoGeneratePmocDocsV1(newContractId);
          toast({
            title: 'Gerando documentos do contrato…',
            description: 'TRT, Certificado, Cronograma e Dossiê estão sendo criados em segundo plano.',
          });
        }

        // PMOC e contrato comum agora seguem o mesmo fluxo: geração imediata
        // das N OSs no momento da criação. Toast unificado.
        toast({
          title: isActive
            ? generatedOsCount === expectedOsCount
              ? `✅ Contrato${isPmoc ? ' PMOC' : ''} criado com ${generatedOsCount} OSs geradas na agenda`
              : `⚠️ Contrato${isPmoc ? ' PMOC' : ''} criado com ${generatedOsCount} de ${expectedOsCount} OSs geradas na agenda`
            : `✅ Contrato${isPmoc ? ' PMOC' : ''} criado com sucesso!`,
        });
        // Criou com sucesso → descarta o rascunho persistido.
        draft.clearDraft();
        onOpenChange(false);
        if (onCreated && result) onCreated((result as any).id);
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const progressPercent = ((step + 1) / STEPS.length) * 100;
  const clientName = customers.find(c => c.id === customerId)?.name || '-';

  // Toggle PMOC — fica no TOPO da etapa Informações (logo após o Cliente). É onde
  // se decide se o contrato é PMOC. Os detalhes (RT, unidade, badge legal) migraram
  // pra etapa dedicada "Unidade & RT".
  const pmocToggleSection = (
    <div className="rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <Switch
          checked={isPmoc}
          onCheckedChange={(v) => {
            // Quando desligar e tinha RT, pede confirmação (em edição).
            if (!v && isEditing && initialIsPmocRef.value && responsibleTechnicianId) {
              setShowPmocOffConfirm(true);
              return;
            }
            setIsPmoc(v);
            if (!v) {
              setResponsibleTechnicianId('');
              // Tipo de Serviço não se aplica a PMOC; ao desligar, mantém o que houver.
            } else {
              // Ligar PMOC: o Tipo de Serviço some (quem manda é o plano/catálogo da
              // norma). Limpa pra não enviar valor obsoleto no submit.
              setServiceTypeId('');
            }
          }}
        />
        <div className="flex-1 min-w-0">
          <Label className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-info shrink-0" />
            É um contrato PMOC?
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Plano de Manutenção, Operação e Controle. Ative para vincular um Responsável Técnico
            e gerar OSs com selo de conformidade legal.
          </p>
        </div>
      </div>
    </div>
  );

  // Bloco da etapa "Unidade & RT" (só PMOC): Responsável Técnico, Identificação da
  // Unidade (Seção 1) e o badge/alerta legal. Migrado da etapa Informações pra
  // desafogá-la.
  const pmocUnitSection = (
    <div className="space-y-4">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label className="m-0">Responsável Técnico (RT)</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="O que é Responsável Técnico?"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs">
                  Engenheiro ou Técnico em Refrigeração com CFT/CREA que assina o
                  Termo de Responsabilidade Técnica conforme Lei Federal 13.589/2018.
                  Diferente do Técnico Executor (quem executa as OSs no campo).
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              CFT/CREA — supervisão regulatória do PMOC.
            </p>
            <div className="flex gap-2">
              <div className="flex-1">
                <Select
                  value={responsibleTechnicianId || 'none'}
                  onValueChange={(v) => setResponsibleTechnicianId(v === 'none' ? '' : v)}
                  disabled={rtLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={rtLoading ? 'Carregando...' : 'Selecione o RT...'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sem RT atribuído —</SelectItem>
                    {responsibleTechnicians.map((rt) => {
                      const modality = rt.modality ?? 'Modalidade não informada';
                      const registry = rt.cft_crea ?? 'sem registro';
                      return (
                        <SelectItem key={rt.id} value={rt.id}>
                          {rt.full_name} — {modality} ({registry})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0 h-10 w-10"
                onClick={() => setShowQuickCreateRT(true)}
                aria-label="Cadastrar novo Responsável Técnico"
                title="Cadastrar novo Responsável Técnico"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Engenheiro ou Técnico com CFT/CREA que supervisiona o PMOC. Pode ser definido depois.
            </p>
          </div>

          {/* Identificação da Unidade (Seção 1 da Planilha PMOC). 1 contrato =
              1 unidade (loja/site), que pode ter endereço próprio — diferente do
              cliente/proprietário. Pré-preenchido do cliente; rede com várias
              lojas edita aqui. */}
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <div>
              <Label className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-info shrink-0" />
                Identificação da Unidade
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Endereço do ambiente climatizado deste contrato (a loja/site). Pode
                ser diferente do endereço do cliente. Pré-preenchido a partir do
                cliente — ajuste se a unidade tiver endereço próprio.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Nome da unidade / local</Label>
              <Input
                value={unidadeNome}
                onChange={e => setUnidadeNome(e.target.value)}
                placeholder="Ex: Loja Centro, Galpão 2…"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
              <div className="space-y-2">
                <Label className="text-xs">Endereço (logradouro)</Label>
                <Input
                  value={unidadeEndereco}
                  onChange={e => setUnidadeEndereco(e.target.value)}
                  placeholder="Rua / Avenida"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Número</Label>
                <Input
                  value={unidadeNumero}
                  onChange={e => setUnidadeNumero(e.target.value)}
                  placeholder="Nº"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Complemento</Label>
              <Input
                value={unidadeComplemento}
                onChange={e => setUnidadeComplemento(e.target.value)}
                placeholder="Sala, andar, bloco…"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">Bairro</Label>
                <Input
                  value={unidadeBairro}
                  onChange={e => setUnidadeBairro(e.target.value)}
                  placeholder="Bairro"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">CEP</Label>
                <Input
                  value={unidadeCep}
                  onChange={e => setUnidadeCep(e.target.value)}
                  placeholder="00000-000"
                />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_100px]">
              <div className="space-y-2">
                <Label className="text-xs">Cidade</Label>
                <Input
                  value={unidadeCidade}
                  onChange={e => setUnidadeCidade(e.target.value)}
                  placeholder="Cidade"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">UF</Label>
                <Input
                  value={unidadeUf}
                  onChange={e => setUnidadeUf(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="UF"
                  maxLength={2}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="info" className="gap-1.5">
              <ShieldCheck className="h-3 w-3" />
              Conforme Lei Federal 13.589/2018
            </Badge>
            <span className="text-xs text-muted-foreground">
              OSs sairão com selo de conformidade.
            </span>
          </div>

          <Alert variant="default" className="border-info/40 bg-info/5 text-foreground">
            <ShieldCheck className="h-4 w-4 text-info" />
            <AlertTitle className="text-sm">O que o PMOC desbloqueia</AlertTitle>
            <AlertDescription className="text-xs">
              Contratos PMOC têm acesso ao Termo de Responsabilidade Técnica,
              Dossiê PMOC, Cronograma anual em PDF, portal público com QR Code
              e selo "Conforme Lei Federal 13.589/2018" nas OSs. O contrato gera
              as OSs imediatamente, igual a um contrato comum.
            </AlertDescription>
          </Alert>

          {/* A caracterização do ambiente climatizado (Seção 4) migrou para a
              etapa "Ambientes", onde cada ambiente tem seus próprios dados e
              equipamentos. */}
        </div>
    </div>
  );

  // Conteúdo do wizard (stepper + etapas). Renderizado dentro do ResponsiveModal,
  // cujo footer recebe a navegação Voltar/Próximo/Criar separadamente.
  const wizardContent = (
    <div className="flex flex-col">
        {/* Stepper — indicador de etapas centralizado horizontalmente */}
        <div className="space-y-3">
          <Progress value={progressPercent} className="h-1.5 max-w-md mx-auto" />
          <div className="flex items-center justify-center gap-1 flex-wrap">
            {STEPS.map((s, i) => {
              // Clicável quando já visitada (≤ maxStepReached) ou é a próxima e a
              // atual está válida. As demais ficam travadas (não pula obrigatória).
              const clickable = i <= maxStepReached || (i === step + 1 && canNext());
              return (
              <div key={s.key} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => goToStep(i)}
                  disabled={!clickable}
                  aria-current={i === step ? 'step' : undefined}
                  className={cn(
                    'flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold transition-colors shrink-0',
                    i < step ? 'bg-primary text-primary-foreground' :
                    i === step ? 'bg-primary text-primary-foreground ring-2 ring-primary/30' :
                    'bg-muted text-muted-foreground',
                    clickable ? 'cursor-pointer hover:opacity-90' : 'cursor-not-allowed opacity-70',
                  )}
                >
                  {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </button>
                <button
                  type="button"
                  onClick={() => goToStep(i)}
                  disabled={!clickable}
                  className={cn(
                    'text-xs hidden sm:inline truncate text-left',
                    i === step ? 'font-medium text-foreground' : 'text-muted-foreground',
                    clickable ? 'cursor-pointer hover:text-foreground' : 'cursor-not-allowed',
                  )}
                >
                  {s.label}
                </button>
                {i < STEPS.length - 1 && <div className="w-4 sm:w-8 h-px bg-border mx-1" />}
              </div>
              );
            })}
          </div>
        </div>

        {/* Content — animação direcional de troca de etapa (slide + fade).
            O scroll fica no container do ResponsiveModal; o StepTransition não
            força overflow/height. */}
        <div className="flex-1 mt-4">
          <StepTransition stepKey={currentStepKey} index={step} className="space-y-4">
          {/* STEP: Informações */}
          {currentStepKey === 'info' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome do Contrato *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Manutenção Preventiva Mensal — Empresa X" />
                <p className="text-xs text-muted-foreground">Dê um nome claro que identifique este contrato</p>
              </div>
              <div className="space-y-2">
                <Label>Cliente *</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <SearchableSelect
                      options={customerOptions}
                      value={customerId}
                      onValueChange={v => { setCustomerId(v); if (!isEditing) { setLooseItems([]); setEnvironments([]); setSelectedEnvKey(null); } }}
                      placeholder="Selecione o cliente"
                      searchPlaceholder="Buscar cliente..."
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0 h-10 w-10"
                    onClick={() => setShowQuickCustomer(true)}
                    title="Cadastrar novo cliente"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* PMOC (Onda A v1.9.0) — toggle no TOPO da etapa, logo após o Cliente.
                  Os detalhes (RT, unidade, badge legal) ficam na etapa "Unidade & RT".
                  Equipe, cobrança, tipo de serviço, checklist, observações e status
                  migraram pra etapa "Equipe & Cobrança". A Identificação fica enxuta.
                  PMOC é exclusivo de refrigeração — fora desse segmento o toggle
                  nem aparece (e toda a estrutura PMOC fica oculta). */}
              {canUsePmoc && pmocToggleSection}
            </div>
          )}

          {/* STEP: Unidade & RT (só PMOC) — RT, Identificação da Unidade e badge legal. */}
          {currentStepKey === 'unit' && pmocUnitSection}

          {/* STEP: Frequência */}
          {currentStepKey === 'frequency' && (
            <div className="space-y-4">
              {/* Com plano de serviços, o motor SEMPRE gera 1 visita/mês agrupando
                  o que vence — a cadência única (tipo/atalhos/intervalo) fica
                  irrelevante e é recolhida. Data de Início e Horizonte continuam. */}
              {usePlanEngine ? (
                <Alert variant="default" className="border-info/40 bg-info/5 text-foreground">
                  <CalendarCheck className="h-4 w-4 text-info" />
                  <AlertTitle className="text-sm">Como serão as visitas</AlertTitle>
                  <AlertDescription className="text-xs">
                    1 visita por mês, agrupando tudo que vence no plano. É só escolher a
                    data de início e por quantos meses o contrato vai rodar — o sistema
                    monta o cronograma sozinho.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Tipo de Frequência</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => { setFreqType('months'); setFreqValue(1); }}
                        className={cn(
                          'rounded-lg border-2 p-3 text-sm font-medium transition-colors',
                          freqType === 'months' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'
                        )}
                      >
                        A cada X meses
                      </button>
                      <button
                        onClick={() => { setFreqType('days'); setFreqValue(7); }}
                        className={cn(
                          'rounded-lg border-2 p-3 text-sm font-medium transition-colors',
                          freqType === 'days' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'
                        )}
                      >
                        A cada X dias
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Atalhos rápidos</Label>
                    <div className="flex gap-2 flex-wrap">
                      {(freqType === 'months' ? QUICK_MONTHS : QUICK_DAYS).map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setFreqValue(opt.value)}
                          className={cn(
                            'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                            freqValue === opt.value ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className={cn('grid gap-4', usePlanEngine ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
                {!usePlanEngine && (
                  <div className="space-y-2">
                    <Label>{freqType === 'months' ? 'Intervalo (meses)' : 'Intervalo (dias)'} *</Label>
                    <Input type="number" min={1} value={freqValue} onChange={e => setFreqValue(Number(e.target.value))} />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Data de Início *</Label>
                  {/* Datepicker próprio do projeto (Calendar + Popover). O input
                      nativo de data tinha ícone escuro/invisível no dark mode;
                      aqui o CalendarIcon usa text-foreground (branco no dark). */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn('w-full justify-start text-left font-normal', !startDate && 'text-muted-foreground')}
                      >
                        <CalendarCheck className="mr-2 h-4 w-4 text-foreground shrink-0" />
                        {startDate
                          ? format(new Date(startDate + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })
                          : 'Selecione a data'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={startDate ? new Date(startDate + 'T00:00:00') : undefined}
                        onSelect={(d) => { if (d) setStartDate(format(d, 'yyyy-MM-dd')); }}
                        initialFocus
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Horizonte (meses)</Label>
                  <Input type="number" min={1} max={60} value={horizonMonths} onChange={e => setHorizonMonths(Number(e.target.value))} />
                  <p className="text-xs text-muted-foreground">
                    = {visitCount} {usePlanEngine ? 'visita(s)' : 'ocorrências'}
                  </p>
                </div>
              </div>

              {/* Prévia das datas. Com plano, reflete as VISITAS AGRUPADAS
                  (datas + quantas atividades vencem em cada mês). Sem plano,
                  a cadência única. */}
              {usePlanEngine ? (
                groupedVisits.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Prévia das visitas ({groupedVisits.length})</Label>
                      <LabeledSwitch
                        value={visitsView}
                        onChange={(v) => setVisitsView(v as 'list' | 'calendar')}
                        off={{ value: 'list', label: 'Lista' }}
                        on={{ value: 'calendar', label: 'Calendário' }}
                        size="default"
                        className="[&_button]:text-xs"
                        aria-label="Visualização da prévia das visitas"
                      />
                    </div>
                    {visitsView === 'list' ? (
                      <div className="rounded-md border max-h-44 overflow-y-auto">
                        {groupedVisits.slice(0, 30).map((visit, i) => {
                          const isWeekend = visit.date.getDay() === 0 || visit.date.getDay() === 6;
                          return (
                            <div key={i} className="flex items-center gap-3 px-3 py-2 border-b last:border-0 text-sm">
                              <span className="text-muted-foreground w-5 text-right font-mono text-xs">{i + 1}</span>
                              <span className="text-foreground">{format(visit.date, 'dd/MM/yyyy', { locale: ptBR })}</span>
                              <Badge variant="info" className="text-[10px] px-1.5 py-0 shrink-0">
                                {visit.activityIndexes.length} atividade{visit.activityIndexes.length === 1 ? '' : 's'}
                              </Badge>
                              {isWeekend && <Badge variant="outline" className="text-warning border-warning/30 text-[10px] px-1.5 py-0">Fim de semana</Badge>}
                            </div>
                          );
                        })}
                        {groupedVisits.length > 30 && (
                          <div className="text-center py-2 text-xs text-muted-foreground">
                            +{groupedVisits.length - 30} visitas adicionais
                          </div>
                        )}
                      </div>
                    ) : (
                      (() => {
                        const visitDays = groupedVisits.map(v => v.date);
                        const selected = previewSelectedDay
                          ? groupedVisits.find(v => format(v.date, 'yyyy-MM-dd') === format(previewSelectedDay, 'yyyy-MM-dd'))
                          : undefined;
                        return (
                          <div className="space-y-2">
                            <div className="rounded-md border flex justify-center">
                              <Calendar
                                mode="single"
                                selected={previewSelectedDay ?? undefined}
                                onSelect={(d) => setPreviewSelectedDay(d ?? null)}
                                defaultMonth={groupedVisits[0]?.date}
                                disabled={(d) => !visitDays.some(vd => format(vd, 'yyyy-MM-dd') === format(d, 'yyyy-MM-dd'))}
                                modifiers={{ visita: visitDays }}
                                modifiersClassNames={{
                                  visita: 'font-semibold text-info relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-info',
                                }}
                                locale={ptBR}
                                className="w-full"
                              />
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="inline-flex h-2 w-2 rounded-full bg-info" />
                              Dias com visita agendada. Toque num dia para ver as atividades.
                            </div>
                            {selected && (
                              <div className="rounded-md border bg-muted/20 p-3 space-y-1.5">
                                <p className="text-sm font-medium">
                                  Visita de {format(selected.date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                                </p>
                                <ul className="space-y-1">
                                  {selected.activityIndexes.map((ai) => (
                                    <li key={ai} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                      <Check className="h-3.5 w-3.5 shrink-0 text-success mt-px" />
                                      <span>{(schedulablePlan[ai] as PlanActivityInput)?.description || 'Atividade'}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    )}
                  </div>
                )
              ) : (
                occurrences.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Prévia das datas ({occurrences.length})</Label>
                    <div className="rounded-md border max-h-44 overflow-y-auto">
                      {occurrences.slice(0, 30).map((date, i) => {
                        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                        return (
                          <div key={i} className="flex items-center gap-3 px-3 py-2 border-b last:border-0 text-sm">
                            <span className="text-muted-foreground w-5 text-right font-mono text-xs">{i + 1}</span>
                            <span className="text-foreground">{format(date, 'dd/MM/yyyy', { locale: ptBR })}</span>
                            <span className="text-muted-foreground text-xs">{format(date, 'EEEE', { locale: ptBR })}</span>
                            {isWeekend && <Badge variant="outline" className="text-warning border-warning/30 text-[10px] px-1.5 py-0">Fim de semana</Badge>}
                          </div>
                        );
                      })}
                      {occurrences.length > 30 && (
                        <div className="text-center py-2 text-xs text-muted-foreground">
                          +{occurrences.length - 30} datas adicionais
                        </div>
                      )}
                    </div>
                    {weekendDates.length > 0 && (
                      <div className="flex items-center gap-2 text-xs text-warning">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {weekendDates.length} ocorrência(s) caem em fim de semana
                      </div>
                    )}
                  </div>
                )
              )}

              {/* PMOC — a rotina da norma (escopo + checklists) agora é POR MÁQUINA
                  e fica na etapa Ambientes (cada equipamento tem seu escopo, sua
                  fase e sua listagem). Aqui só lembramos o gestor. O escopo POR
                  CONTRATO foi removido (Fase 3). */}
              {isPmoc && (
                <Alert variant="default" className="border-info/40 bg-info/5 text-foreground">
                  <ShieldCheck className="h-4 w-4 text-info" />
                  <AlertTitle className="text-sm">Rotina por equipamento</AlertTitle>
                  <AlertDescription className="text-xs">
                    Cada equipamento tem sua própria rotina da norma (escopo, em que visita começa e
                    seus checklists), configurada na etapa <strong>Ambientes</strong>. Por padrão:
                    só ar-condicionado, começando pela revisão anual e seguindo a norma — quem não
                    quiser ajustar é só avançar.
                  </AlertDescription>
                </Alert>
              )}

              {/* Opções avançadas — serviços com frequência própria. Decisão CEO:
                  contrato COMUM novo NÃO usa mais "Plano" — sempre o Checklist
                  Padrão (frequência por pergunta). O construtor só aparece pra
                  EDITAR um plano legado já existente (não quebrar contratos
                  antigos). PMOC monta o plano por máquina na etapa Ambientes. */}
              {showCommonPlanBuilder && (
              <Collapsible open={showAdvancedFrequency} onOpenChange={setShowAdvancedFrequency}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left min-h-11 text-sm font-medium active:scale-[0.995] transition-transform"
                  >
                    <span className="flex items-center gap-2">
                      <CalendarCheck className="h-4 w-4 text-primary shrink-0" />
                      Opções avançadas — serviços com frequência própria
                    </span>
                    <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', showAdvancedFrequency && 'rotate-180')} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="rounded-lg border border-t-0 rounded-t-none p-3 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Adicione serviços com frequências diferentes (ex: filtro mensal, serpentina trimestral).
                      Quando houver serviços aqui, o sistema gera <strong>1 visita por mês</strong> agrupando tudo que vence.
                    </p>

                    {/* Picker do catálogo PMOC (Fase 2). Disponível em qualquer
                        contrato; em PMOC com padrão LIGADO fica desabilitado
                        (personalize desligando o padrão). */}
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={openCatalogPicker}
                      disabled={catalogLoading || (isPmoc && pmocStandardOn)}
                      title={isPmoc && pmocStandardOn ? 'Desligue o padrão PMOC para personalizar as atividades' : undefined}
                    >
                      <ShieldCheck className="h-4 w-4 mr-2 text-info" />
                      {catalogLoading ? 'Carregando catálogo...' : 'Adicionar do catálogo PMOC'}
                    </Button>

                    <div className="flex gap-2">
                      <Input
                        className="flex-1"
                        placeholder="Ex: Limpeza de filtros"
                        value={newActivityDesc}
                        onChange={e => setNewActivityDesc(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPlanActivity(); } }}
                      />
                      <Select value={newActivityFreq} onValueChange={v => setNewActivityFreq(v as FreqCode)}>
                        <SelectTrigger className="w-[130px] shrink-0"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ACTIVITY_FREQ_OPTIONS.map(o => (
                            <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="outline" size="icon" className="shrink-0 h-10 w-10" onClick={addPlanActivity} disabled={!newActivityDesc.trim()}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>

                    {planActivities.length > 0 && (
                      <div className="space-y-1.5">
                        {planActivities.map((a, i) => {
                          const freqLabel = ACTIVITY_FREQ_OPTIONS.find(o => o.code === a.freq_code)?.label ?? a.freq_code;
                          const perEquip = a.applies_per_equipment !== false;
                          // Task 5: linha do PADRÃO (vinda do catálogo) fica TRAVADA
                          // quando o padrão PMOC está ligado. Linha manual (sem
                          // catalog_activity_id) continua editável/removível.
                          const isFromCatalog = !!a.catalog_activity_id;
                          const locked = isPmoc && pmocStandardOn && isFromCatalog;
                          return (
                            <div key={i} className={cn(
                              'flex flex-col gap-2 rounded border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between',
                              locked && 'bg-muted/40',
                            )}>
                              <div className="min-w-0 flex items-center gap-2">
                                {locked && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Travado pelo padrão da norma" />}
                                <span className="font-medium truncate">{a.description}</span>
                                <Badge variant={a.freq_code === 'E' ? 'outline' : 'info'} className="shrink-0 text-[10px]">{freqLabel}</Badge>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {/* Escopo da atividade (Fase 3): por equipamento ou geral (local). */}
                                <button
                                  type="button"
                                  disabled={locked}
                                  onClick={() => setPlanActivities(prev => prev.map((x, idx) => idx === i ? { ...x, applies_per_equipment: !perEquip } : x))}
                                  className={cn(
                                    'px-2 py-1 rounded-full text-[10px] font-medium border transition-colors whitespace-nowrap',
                                    perEquip
                                      ? 'bg-info/10 text-info border-info/30'
                                      : 'bg-muted text-muted-foreground border-border',
                                    locked && 'opacity-60 cursor-not-allowed',
                                  )}
                                  title={locked ? 'Travado pelo padrão da norma — desligue o padrão para editar' : 'Alterna entre repetir a atividade por equipamento ou tratá-la como geral (local)'}
                                >
                                  {perEquip ? 'Por equipamento' : 'Geral (local)'}
                                </button>
                                {!locked && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setPlanActivities(prev => prev.filter((_, idx) => idx !== i))}>
                                    ×
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {isPmoc && pmocStandardOn && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                            <Lock className="h-3.5 w-3.5 shrink-0" />
                            Atividades do padrão travadas pela norma. Desligue o padrão PMOC para personalizar.
                          </div>
                        )}
                        {usePlanEngine ? (
                          <div className="flex items-center gap-2 text-xs text-info pt-1">
                            <Info className="h-3.5 w-3.5 shrink-0" />
                            {groupedVisits.length} visita(s) serão geradas (1 por mês com serviços a vencer).
                            Eventuais não entram no cronograma automático.
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-xs text-warning pt-1">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            Só há serviços eventuais — nenhuma visita será agendada automaticamente.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
              )}
            </div>
          )}

          {/* STEP: Ambientes e Equipamentos (PMOC e comum) — master-detail.
              LISTA de ambientes → tela do ambiente (campos + equipamentos
              membros). No comum há o grupo virtual "Sem ambiente" pros itens
              soltos. Mesma UX da aba de detalhe (ContractEnvironmentsTab). O
              "Voltar aos ambientes" é interno ao step (NÃO mexe no wizard). */}
          {currentStepKey === 'items' && (() => {
            const selectedEnv = selectedEnvKey && selectedEnvKey !== LOOSE_ENV_KEY
              ? environments.find(e => e.key === selectedEnvKey) ?? null
              : null;
            const selectedEnvIdx = selectedEnv ? environments.findIndex(e => e.key === selectedEnv.key) : -1;
            const isLooseSelected = !isPmoc && selectedEnvKey === LOOSE_ENV_KEY;
            const totalEquipment = new Set([
              ...environments.flatMap(e => e.equipment_ids),
              ...looseItems.map(it => it.equipment_id).filter(Boolean) as string[],
            ]).size;

            // Campos do ambiente: PMOC = completo (refrigeração); comum = só os
            // genéricos (identificação + tipo/uso + foto).
            const renderEnvFields = (env: EnvRow, idx: number) => (
              <div className="space-y-3">
                <EnvironmentPhotoField
                  value={env.photo_url}
                  onChange={(url) => setEnvironmentPhoto(env.key, url)}
                  envLabel={env.identificacao.trim() || `Ambiente ${idx + 1}`}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Identificação do ambiente</Label>
                    <Input value={env.identificacao} onChange={e => updateEnvironmentField(env.key, 'identificacao', e.target.value)} placeholder="Ex: 2º andar — Sala 201" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{isPmoc ? 'Tipo de atividade' : 'Tipo / uso do ambiente'}</Label>
                    <Input value={env.tipo_atividade} onChange={e => updateEnvironmentField(env.key, 'tipo_atividade', e.target.value)} placeholder="Ex: Escritório administrativo" />
                  </div>
                  {isPmoc && (
                  <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Área climatizada (m²)</Label>
                    <div className="flex items-center gap-2">
                      <NumericInput decimal value={env.area_climatizada_m2} onValueChange={v => updateEnvironmentField(env.key, 'area_climatizada_m2', v)} placeholder="Ex: 120,5" className="flex-1" />
                      <Button type="button" variant="outline" size="sm" className="h-10 shrink-0 px-3" onClick={() => setAreaCalcEnvKey(env.key)}>
                        <Calculator className="h-4 w-4 sm:mr-1.5" />
                        <span className="hidden sm:inline">Calcular</span>
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs">Carga térmica (TR)</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="O que é TR?">
                            <HelpCircle className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">TR (Tonelada de Refrigeração) é a unidade de capacidade de refrigeração. 1 TR = 12.000 BTU/h.</TooltipContent>
                      </Tooltip>
                    </div>
                    {(() => {
                      const tr = parseDecimalBR(env.carga_termica_tr);
                      const showHint = tr && tr > 0;
                      return (
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <NumericInput decimal value={env.carga_termica_tr} onValueChange={v => updateEnvironmentField(env.key, 'carga_termica_tr', v)} placeholder="Ex: 5,0" className={showHint ? 'pr-24' : undefined} />
                            {showHint && (
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 max-w-[40%] truncate text-xs text-muted-foreground">
                                = {(tr * 12000).toLocaleString('pt-BR')} BTUs
                              </span>
                            )}
                          </div>
                          <Button type="button" variant="outline" size="sm" className="h-10 shrink-0 px-3" onClick={() => setCargaCalcEnvKey(env.key)}>
                            <Calculator className="h-4 w-4 sm:mr-1.5" />
                            <span className="hidden sm:inline">Calcular</span>
                          </Button>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs">Nº de ocupantes fixos</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="O que são ocupantes fixos?">
                            <HelpCircle className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">Pessoas que ocupam o ambiente de forma permanente/regular (ex.: funcionários que trabalham no local).</TooltipContent>
                      </Tooltip>
                    </div>
                    <NumericInput value={env.ocupantes_fixos} onValueChange={v => updateEnvironmentField(env.key, 'ocupantes_fixos', v)} placeholder="Ex: 12" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs">Nº de ocupantes flutuantes</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="O que são ocupantes flutuantes?">
                            <HelpCircle className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">Pessoas que circulam pelo ambiente de forma temporária e variável (ex.: clientes, visitantes).</TooltipContent>
                      </Tooltip>
                    </div>
                    <NumericInput value={env.ocupantes_flutuantes} onValueChange={v => updateEnvironmentField(env.key, 'ocupantes_flutuantes', v)} placeholder="Ex: 30" />
                  </div>
                  </>
                  )}
                </div>
              </div>
            );

            // Equipamentos MEMBROS do ambiente: chevron de config (PMOC) SEPARADO
            // da remoção; picker pra adicionar; criar-na-hora.
            const renderEnvEquipment = (env: EnvRow) => (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Wrench className="h-3.5 w-3.5 text-info" />
                    Equipamentos deste ambiente ({env.equipment_ids.length})
                  </Label>
                  <Button type="button" variant="outline" size="sm" className="min-h-9 active:scale-[0.98] transition-transform rounded-xl" disabled={!customerId} onClick={() => openMemberPicker(env.key)}>
                    <Plus className="mr-1 h-4 w-4" /> Adicionar equipamento
                  </Button>
                </div>

                {env.equipment_ids.length === 0 ? (
                  <EmptyState
                    size="compact"
                    icon={<Wrench className="h-10 w-10" />}
                    title="Nenhum equipamento neste ambiente"
                    description={customerId ? 'Adicione um equipamento do cliente a este ambiente.' : 'Selecione o cliente na etapa 1 primeiro.'}
                    action={customerId ? { label: 'Adicionar equipamento', onClick: () => openMemberPicker(env.key) } : undefined}
                  />
                ) : (
                  <div className="divide-y overflow-hidden rounded-lg border bg-muted/20">
                    {env.equipment_ids.map((eqId) => {
                      const eq = equipmentById.get(eqId);
                      const cfg = machineConfigs[eqId];
                      const expanded = expandedEqIds.has(eqId);
                      const name = eq?.name ?? 'Equipamento';
                      return (
                        <div key={eqId}>
                          <div
                            className="flex cursor-pointer items-center gap-2 px-3 py-2.5 transition-colors hover:bg-muted/30"
                            role="button"
                            tabIndex={0}
                            aria-expanded={expanded}
                            onClick={() => toggleExpanded(eqId)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpanded(eqId); } }}
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground" aria-hidden="true">
                              <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
                            </span>
                            <EquipmentAvatar
                              photoUrl={eq?.photo_url}
                              name={name}
                              onPreview={eq?.photo_url ? () => setPreviewPhoto({ src: eq.photo_url, alt: name }) : undefined}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{name}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {[eq?.brand, eq?.model].filter(Boolean).join(' - ')}
                                {eq?.location && <span className="text-muted-foreground"> • {eq.location}</span>}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 shrink-0 text-destructive active:scale-90 transition-transform rounded-xl"
                              title={isPmoc ? 'Remover do ambiente' : 'Tirar do ambiente'}
                              aria-label={isPmoc ? 'Remover do ambiente' : 'Tirar do ambiente'}
                              onClick={(e) => { e.stopPropagation(); setRemovingMember({ mode: 'env', envKey: env.key, eqId }); }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          {isPmoc && expanded && (
                            <div className="space-y-2.5 bg-muted/30 px-3 pb-3 pt-1">
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-1">
                                  <span className="text-[11px] font-medium text-muted-foreground">Escopo da norma</span>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Sobre o escopo">
                                        <HelpCircle className="h-3.5 w-3.5" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs text-xs">
                                      "Só ar-condicionado" cobre split/ACJ comum. "Toda a norma" inclui as seções de grande porte (VRF, Chiller, Torre, casa de máquinas…).
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                                <LabeledSwitch
                                  value={cfg?.scope ?? 'ac'}
                                  onChange={(v) => setMachineScope(eqId, v as PmocMachineScope)}
                                  off={{ value: 'ac', label: 'Só ar-condicionado' }}
                                  on={{ value: 'full', label: 'Grande Porte (VRF/Chiller…)' }}
                                  size="default"
                                  className="[&_button]:text-xs"
                                  aria-label="Escopo da norma da máquina"
                                />
                              </div>

                              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
                                <div className="flex flex-1 flex-col gap-1.5">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[11px] font-medium text-muted-foreground">Começa na visita</span>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Sobre começa na visita">
                                          <HelpCircle className="h-3.5 w-3.5" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs text-xs">
                                        Define a 1ª visita desta máquina no ciclo de 12. Acumulativo: Visita 12 (Anual) já faz a revisão completa; Visita 1 começa só pelo mensal.
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                  <Select value={String(cfg?.startVisit ?? 12)} onValueChange={(v) => setMachineStartVisit(eqId, Number(v))}>
                                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {START_VISIT_OPTIONS.map(o => (
                                        <SelectItem key={o.value} value={String(o.value)} className="text-xs">{o.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <Button type="button" variant="outline" size="sm" className="h-9 w-full text-xs sm:w-auto" disabled={catalogLoading} onClick={() => openMachinePicker(eqId)}>
                                  <ShieldCheck className="h-3.5 w-3.5 mr-1.5 text-info" />
                                  Checklists da Máquina
                                </Button>
                              </div>

                              <span className="block text-[11px] text-muted-foreground">
                                {cfg ? `${cfg.activities.length} checklist(s)` : '—'}
                                {cfg?.customized && <span className="ml-1 text-info">· personalizado</span>}
                              </span>

                              {cfg && (
                                <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                                  <CalendarCheck className="h-3.5 w-3.5 shrink-0 text-info mt-px" />
                                  <span>
                                    Começa na <strong>{startVisitLabel(cfg.startVisit)}</strong> — 1ª visita faz: {firstVisitContents(cfg.startVisit)}.
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Contrato comum: checklist por equipamento + "Adicionar
                              na primeira OS?" por pergunta. */}
                          {!isPmoc && expanded && (
                            <div className="bg-muted/30 px-3 pb-3 pt-1">
                              <CommonChecklistEditor
                                templates={commonChecklistTemplates}
                                selectedTemplateIds={getCommonChecklist(eqId).formTemplateIds}
                                onChangeTemplates={(ids) => setCommonChecklistTemplates(eqId, ids)}
                                excluded={getCommonChecklist(eqId).excluded}
                                onChangeExcluded={(next) => setCommonChecklistExcluded(eqId, next)}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <Button type="button" variant="outline" size="sm" className="w-full" disabled={!customerId} onClick={() => openMemberPicker(env.key)}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Adicionar / cadastrar equipamento
                </Button>
              </div>
            );

            // Grupo virtual "Sem ambiente" (só comum). Lixeira = remover DO
            // CONTRATO. "Mover para ambiente" realoca o item pra um ambiente real.
            const renderLooseEquipment = () => (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Wrench className="h-3.5 w-3.5 text-info" />
                    Equipamentos sem ambiente ({looseItems.length})
                  </Label>
                  <Button type="button" variant="outline" size="sm" className="min-h-9 active:scale-[0.98] transition-transform rounded-xl" disabled={!customerId} onClick={() => openMemberPicker(LOOSE_ENV_KEY)}>
                    <Plus className="mr-1 h-4 w-4" /> Adicionar equipamento
                  </Button>
                </div>

                {looseItems.length === 0 ? (
                  <EmptyState
                    size="compact"
                    icon={<Wrench className="h-10 w-10" />}
                    title="Nenhum equipamento sem ambiente"
                    description="Todos os equipamentos do contrato já estão em algum ambiente."
                  />
                ) : (
                  <div className="divide-y overflow-hidden rounded-lg border bg-muted/20">
                    {looseItems.map((it, looseIdx) => {
                      const eq = it.equipment_id ? equipmentById.get(it.equipment_id) : null;
                      const name = eq?.name ?? it.item_name ?? 'Equipamento';
                      // Só item COM equipamento tem checklist por equipamento.
                      const looseExpanded = !!it.equipment_id && expandedEqIds.has(it.equipment_id);
                      return (
                        <div key={`${it.equipment_id ?? 'manual'}-${looseIdx}`}>
                          <div className="flex items-center gap-2 px-3 py-2.5">
                            {it.equipment_id ? (
                              <button
                                type="button"
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60"
                                onClick={() => toggleExpanded(it.equipment_id!)}
                                aria-label={looseExpanded ? 'Recolher checklist' : 'Expandir checklist'}
                                aria-expanded={looseExpanded}
                              >
                                <ChevronDown className={cn('h-4 w-4 transition-transform', looseExpanded && 'rotate-180')} />
                              </button>
                            ) : (
                              <div className="w-1" />
                            )}
                            <EquipmentAvatar
                              photoUrl={eq?.photo_url}
                              name={name}
                              onPreview={eq?.photo_url ? () => setPreviewPhoto({ src: eq.photo_url, alt: name }) : undefined}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{name}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {[eq?.brand, eq?.model].filter(Boolean).join(' - ') || it.item_description}
                                {eq?.location && <span className="text-muted-foreground"> • {eq.location}</span>}
                              </p>
                            </div>
                            {it.equipment_id && environments.length > 0 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 shrink-0 text-muted-foreground active:scale-90 transition-transform rounded-xl"
                                title="Mover para ambiente"
                                aria-label="Mover para ambiente"
                                onClick={() => setMovingLooseIdx(looseIdx)}
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 shrink-0 text-destructive active:scale-90 transition-transform rounded-xl"
                              title="Remover do contrato"
                              aria-label="Remover do contrato"
                              onClick={() => setRemovingMember({ mode: 'loose', looseIdx })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          {it.equipment_id && looseExpanded && (
                            <div className="bg-muted/30 px-3 pb-3 pt-1">
                              <CommonChecklistEditor
                                templates={commonChecklistTemplates}
                                selectedTemplateIds={getCommonChecklist(it.equipment_id).formTemplateIds}
                                onChangeTemplates={(ids) => setCommonChecklistTemplates(it.equipment_id!, ids)}
                                excluded={getCommonChecklist(it.equipment_id).excluded}
                                onChangeExcluded={(next) => setCommonChecklistExcluded(it.equipment_id!, next)}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Item manual (sem equipamento) — só comum. */}
                {!showManualItem ? (
                  <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setShowManualItem(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" /> Adicionar item manual
                  </Button>
                ) : (
                  <div className="rounded-lg border p-3 space-y-3">
                    <div className="space-y-2">
                      <Label>Nome do item</Label>
                      <Input value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Ex: Limpeza de dutos" />
                    </div>
                    <div className="space-y-2">
                      <Label>Descrição (opcional)</Label>
                      <Input value={manualDesc} onChange={e => setManualDesc(e.target.value)} placeholder="Detalhes adicionais" />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShowManualItem(false)}>Cancelar</Button>
                      <Button size="sm" onClick={addManualItem} disabled={!manualName.trim()}>Adicionar</Button>
                    </div>
                  </div>
                )}
              </div>
            );

            if (isLooseSelected) {
              return (
                <div className="space-y-4">
                  <Button variant="ghost" size="sm" className="-ml-2 min-h-11 sm:min-h-9 active:scale-[0.98] transition-transform" onClick={() => setSelectedEnvKey(null)}>
                    <ChevronLeft className="mr-1 h-4 w-4" /> Voltar aos ambientes
                  </Button>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="shrink-0">Sem ambiente</Badge>
                    <span className="text-base font-semibold">Equipamentos não atribuídos</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Equipamentos deste contrato que ainda não estão em nenhum ambiente. Adicione a um ambiente ou remova do contrato.
                  </p>
                  {renderLooseEquipment()}
                </div>
              );
            }

            if (selectedEnv) {
              return (
                <div className="space-y-4">
                  <Button variant="ghost" size="sm" className="-ml-2 min-h-11 sm:min-h-9 active:scale-[0.98] transition-transform" onClick={() => setSelectedEnvKey(null)}>
                    <ChevronLeft className="mr-1 h-4 w-4" /> Voltar aos ambientes
                  </Button>
                  <div className="flex w-full items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant="info" className="shrink-0">Ambiente {selectedEnvIdx + 1}</Badge>
                      <span className="min-w-0 break-words text-base font-semibold">
                        {selectedEnv.identificacao.trim() || 'Sem identificação'}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-destructive active:scale-90 transition-transform rounded-xl"
                      onClick={() => setRemovingEnvKey(selectedEnv.key)}
                      aria-label="Remover ambiente"
                      title="Remover ambiente"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {renderEnvFields(selectedEnv, selectedEnvIdx)}
                  {renderEnvEquipment(selectedEnv)}
                </div>
              );
            }

            // LISTA de ambientes (default).
            return (
              <div className="space-y-4">
                <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-center gap-2 text-base font-semibold">
                      <ShieldCheck className="h-5 w-5 shrink-0 text-info" />
                      {isPmoc ? 'Ambientes climatizados' : 'Ambientes'} ({environments.length})
                    </span>
                    {!customerId && (
                      <p className="text-xs text-warning">Selecione o cliente na etapa 1 para escolher equipamentos.</p>
                    )}
                  </div>
                  <Button size="sm" variant="outline" className="w-full sm:w-auto min-h-11 sm:min-h-9 active:scale-[0.98] transition-transform rounded-xl" onClick={addEnvironment}>
                    <Plus className="mr-1 h-4 w-4" /> Adicionar ambiente
                  </Button>
                </div>

                {environments.length === 0 && looseItems.length === 0 ? (
                  <div className="space-y-2">
                    <EmptyState
                      size="compact"
                      icon={<ShieldCheck className="h-10 w-10" />}
                      title="Nenhum ambiente cadastrado"
                      description={isPmoc ? 'Cadastre os ambientes climatizados deste contrato.' : 'Organize os equipamentos deste contrato em ambientes.'}
                      action={{ label: 'Adicionar ambiente', onClick: addEnvironment }}
                    />
                    {/* Comum: também permite adicionar equipamento sem criar ambiente. */}
                    {!isPmoc && (
                      <Button type="button" variant="ghost" size="sm" className="w-full justify-center text-muted-foreground" disabled={!customerId} onClick={() => openMemberPicker(LOOSE_ENV_KEY)}>
                        <Plus className="mr-1 h-4 w-4" /> Adicionar equipamento sem ambiente
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {environments.map((env, idx) => (
                      <button
                        key={env.key}
                        type="button"
                        onClick={() => setSelectedEnvKey(env.key)}
                        className="flex w-full min-h-16 items-center gap-3 rounded-2xl border-2 bg-card p-3 text-left shadow-sm transition-colors hover:bg-muted/40 active:scale-[0.99]"
                      >
                        {env.photo_url ? (
                          <img src={env.photo_url} alt={env.identificacao.trim() || `Ambiente ${idx + 1}`} className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                            <ShieldCheck className="h-6 w-6" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="info" className="shrink-0">Ambiente {idx + 1}</Badge>
                            <span className="truncate text-sm font-semibold">{env.identificacao.trim() || 'Sem identificação'}</span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {env.tipo_atividade.trim() && <span>{env.tipo_atividade.trim()} • </span>}
                            <span className="inline-flex items-center gap-1">
                              <Wrench className="h-3 w-3" /> {env.equipment_ids.length} equipamento(s)
                            </span>
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                      </button>
                    ))}

                    {!isPmoc && looseItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedEnvKey(LOOSE_ENV_KEY)}
                        className="flex w-full min-h-16 items-center gap-3 rounded-2xl border-2 border-dashed bg-muted/20 p-3 text-left shadow-sm transition-colors hover:bg-muted/40 active:scale-[0.99]"
                      >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                          <Wrench className="h-6 w-6" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="shrink-0">Sem ambiente</Badge>
                            <span className="truncate text-sm font-semibold">Equipamentos não atribuídos</span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Wrench className="h-3 w-3" /> {looseItems.length} equipamento(s)
                            </span>
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                      </button>
                    )}

                    {/* Comum sem nenhum loose ainda: atalho pra adicionar item sem ambiente. */}
                    {!isPmoc && looseItems.length === 0 && (
                      <Button type="button" variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" disabled={!customerId} onClick={() => { openMemberPicker(LOOSE_ENV_KEY); }}>
                        <Plus className="mr-1 h-4 w-4" /> Adicionar equipamento sem ambiente
                      </Button>
                    )}

                    <p className="pt-1 text-xs text-muted-foreground">
                      {totalEquipment} equipamento(s) no total entram neste contrato.
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* STEP: Equipe & Cobrança — técnicos executores, responsáveis pela
              cobrança, tipo de serviço (só comum), checklist padrão (sem plano),
              observações e status. Migrado da antiga etapa Identificação. */}
          {currentStepKey === 'team' && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <AssigneeMultiSelect
                    technicians={(technicians ?? []).map(t => ({ user_id: t.user_id, full_name: t.full_name, avatar_url: t.avatar_url }))}
                    teams={teamsWithMembers}
                    selectedUserIds={selectedUserIds}
                    selectedTeamIds={selectedTeamIds}
                    onChangeUsers={setSelectedUserIds}
                    onChangeTeams={setSelectedTeamIds}
                    label="Técnicos Executores *"
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Técnicos ou equipes que vão a campo executar as ordens de serviço deste contrato.
                    {' '}Diferente do Responsável Técnico (RT) regulatório do PMOC.
                  </p>
                  {!hasExecutor && (
                    <p className="flex items-center gap-1.5 text-xs text-destructive mt-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Selecione ao menos 1 técnico ou equipe para executar.
                    </p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <AssigneeMultiSelect
                    technicians={(allProfiles ?? []).map(t => ({ user_id: t.user_id, full_name: t.full_name, avatar_url: t.avatar_url }))}
                    teams={teamsWithMembers}
                    selectedUserIds={billingUserIds}
                    selectedTeamIds={billingTeamIds}
                    onChangeUsers={setBillingUserIds}
                    onChangeTeams={setBillingTeamIds}
                    label="Responsáveis Financeiros (Cobrança)"
                    usersLabel="Usuários"
                  />
                </div>
                {/* Tipo de Serviço não se aplica a PMOC — quem manda nas atividades
                    é o plano/catálogo da norma. Some quando o contrato é PMOC. */}
                {!isPmoc && (
                  <div className="space-y-2">
                    <Label>Tipo de Serviço</Label>
                    <Select value={serviceTypeId || 'none'} onValueChange={v => setServiceTypeId(v === 'none' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {serviceTypes.filter(t => t.is_active).map(st => (
                          <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {/* Checklist Padrão só faz sentido em contrato SEM plano de
                    serviços. Com plano, o checklist vem das atividades por
                    equipamento — exibir o select duplicaria o checklist na OS.
                    (usePlanEngine = há atividades agendáveis no plano.) */}
                {!usePlanEngine && (
                  <div className="space-y-2">
                    <Label>Checklist Padrão</Label>
                    <Select value={formTemplateId || 'none'} onValueChange={v => setFormTemplateId(v === 'none' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {templates.filter(t => t.is_active).map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Pode ser sobrescrito por item</p>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Observações (opcional)</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Instruções gerais, condições do contrato..." rows={3} />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <div>
                  <Label>Contrato Ativo</Label>
                  <p className="text-xs text-muted-foreground">OSs só serão geradas para contratos ativos</p>
                </div>
              </div>
            </div>
          )}

          {/* STEP: Revisão */}
          {currentStepKey === 'review' && (
            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="font-semibold flex items-center gap-2">
                <CalendarCheck className="h-5 w-5 text-primary" />
                Revisão do Contrato
              </h3>

              {/* Narrativa dinâmica: explica em PT-BR claro tudo o que este
                  contrato vai fazer. Só mostra os blocos que se aplicam. */}
              {(() => {
                const serviceTypeName = serviceTypes?.find((s: any) => s.id === serviceTypeId)?.name;
                const templateName = templates?.find((t: any) => t.id === formTemplateId)?.name;
                const rt = responsibleTechnicians.find((r) => r.id === responsibleTechnicianId);
                const startLabel = format(new Date(startDate + 'T00:00:00'), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
                const totalEquip = effectiveItems.length;
                const unidadeLocal = [unidadeCidade.trim(), unidadeUf.trim()].filter(Boolean).join('/');

                // Resumo de frequência por código (M/T/S/A) das atividades agendáveis.
                const freqCount: Record<string, number> = {};
                if (usePlanEngine) {
                  for (const a of schedulablePlan) {
                    const code = (a as PlanActivityInput).freq_code;
                    if (code) freqCount[code] = (freqCount[code] ?? 0) + 1;
                  }
                }
                const freqParts = ACTIVITY_FREQ_OPTIONS
                  .filter(o => freqCount[o.code] > 0)
                  .map(o => `${freqCount[o.code]} ${o.label.toLowerCase()}`);

                // Técnicos/equipes em texto.
                const teamParts: string[] = [];
                if (selectedUserIds.length === 1) {
                  teamParts.push((technicians ?? []).find(t => t.user_id === selectedUserIds[0])?.full_name || '1 técnico');
                } else if (selectedUserIds.length > 1) {
                  teamParts.push(`${selectedUserIds.length} técnicos`);
                }
                if (selectedTeamIds.length > 0) teamParts.push(`${selectedTeamIds.length} equipe(s)`);

                const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
                    <p className="text-sm leading-relaxed text-foreground">{children}</p>
                  </div>
                );

                return (
                  <div className="space-y-3 rounded-lg border bg-muted/20 p-3.5">
                    <Block title="Identificação">
                      Este é um contrato{isPmoc ? <> <strong>PMOC</strong></> : null}
                      {name?.trim() ? <> chamado <strong>{name.trim()}</strong></> : null}
                      {' '}para o cliente <strong>{clientName}</strong>.
                      {serviceTypeName ? <> O tipo de serviço é <strong>{serviceTypeName}</strong>.</> : null}
                      {' '}Ele nasce <strong>{isActive ? 'ativo' : 'pausado'}</strong>
                      {isActive ? ' (já passa a gerar ordens de serviço).' : ' (não gera ordens até ser ativado).'}
                    </Block>

                    {isPmoc && (
                      <Block title="Unidade e responsável técnico">
                        {unidadeNome.trim()
                          ? <>A unidade atendida é <strong>{unidadeNome.trim()}</strong>{unidadeLocal ? <> ({unidadeLocal})</> : null}.</>
                          : <>A unidade ainda não tem nome definido{unidadeLocal ? <> ({unidadeLocal})</> : null}.</>}
                        {' '}
                        {rt
                          ? <>O responsável técnico é <strong>{rt.full_name}</strong> (CFT/CREA: {rt.cft_crea ?? '—'}), que assina os documentos da norma.</>
                          : <>O responsável técnico ainda será definido.</>}
                      </Block>
                    )}

                    {isPmoc && (
                      <Block title="Ambientes e equipamentos">
                        A unidade tem <strong>{environments.length}</strong> ambiente(s) com{' '}
                        <strong>{totalEquip}</strong> equipamento(s) no total.
                        {environments.length > 0 && (
                          <span className="mt-1.5 block space-y-0.5">
                            {environments.map((env, i) => {
                              const area = env.area_climatizada_m2.trim();
                              const nEq = env.equipment_ids.length;
                              return (
                                <span key={env.key} className="block text-xs text-muted-foreground">
                                  • <strong className="text-foreground">{env.identificacao.trim() || `Ambiente ${i + 1}`}</strong>
                                  {area ? <> — {area} m²</> : null}
                                  {` — ${nEq} equipamento(s)`}
                                </span>
                              );
                            })}
                          </span>
                        )}
                      </Block>
                    )}

                    {isPmoc && pmocDerivedItems.length > 0 && (
                      <Block title="Plano por máquina">
                        Cada máquina segue sua própria rotina da norma:
                        <span className="mt-1.5 block space-y-0.5">
                          {pmocDerivedItems.map((it) => {
                            const cfg = machineConfigs[it.equipment_id];
                            if (!cfg) return null;
                            return (
                              <span key={it.equipment_id} className="block text-xs text-muted-foreground">
                                • <strong className="text-foreground">{it.item_name}</strong>
                                {` — ${cfg.scope === 'full' ? 'toda a norma' : 'só ar-condicionado'}`}
                                {`, começa na ${startVisitLabel(cfg.startVisit).toLowerCase()}`}
                                {`, ${cfg.activities.length} checklist(s)`}
                                {cfg.customized ? ' (personalizado)' : ''}.
                              </span>
                            );
                          })}
                        </span>
                      </Block>
                    )}

                    {!isPmoc && (
                      <Block title="Ambientes e equipamentos">
                        Este contrato tem <strong>{environments.length}</strong> ambiente(s) e cobre{' '}
                        <strong>{totalEquip}</strong> item(ns)/equipamento(s) no total
                        {looseItems.length > 0 && <> (<strong>{looseItems.length}</strong> sem ambiente)</>}.
                        {environments.length > 0 && (
                          <span className="mt-1.5 block space-y-0.5">
                            {environments.map((env, i) => (
                              <span key={env.key} className="block text-xs text-muted-foreground">
                                • <strong className="text-foreground">{env.identificacao.trim() || `Ambiente ${i + 1}`}</strong>
                                {` — ${env.equipment_ids.length} equipamento(s)`}
                              </span>
                            ))}
                          </span>
                        )}
                      </Block>
                    )}

                    {!isPmoc && (() => {
                      // Resumo da regra da 1ª OS: percorre os equipamentos que têm
                      // checklist e conta, por pergunta, quantas entram já na
                      // primeira visita (toda-visita + marcadas) vs quantas ficam
                      // pra quando a frequência delas vencer (desmarcadas). Só
                      // aparece no fluxo comum e quando há ao menos um checklist.
                      let withChecklist = 0;
                      let firstOsCount = 0;
                      let deferredCount = 0;
                      for (const it of effectiveItems) {
                        const ck = commonChecklistPayload(it.equipment_id);
                        if (ck.form_template_ids.length === 0) continue;
                        const tpls = ck.form_template_ids
                          .map((id) => templateQuestionsById.get(id))
                          .filter((t): t is ChecklistTemplateOption => !!t);
                        if (tpls.length === 0) continue;
                        withChecklist += 1;
                        const excluded = new Set(ck.first_os_excluded_questions);
                        // União das perguntas de todos os checklists (dedup por id).
                        const seenQ = new Set<string>();
                        for (const tpl of tpls) {
                          for (const q of tpl.questions ?? []) {
                            if (seenQ.has(q.id)) continue;
                            seenQ.add(q.id);
                            if (excluded.has(q.id)) deferredCount += 1;
                            else firstOsCount += 1;
                          }
                        }
                      }
                      if (withChecklist === 0) return null;
                      return (
                        <Block title="O que entra na primeira visita">
                          Cada pergunta do checklist pode entrar já na{' '}
                          <strong>primeira ordem de serviço</strong> ou ficar pra{' '}
                          depois. Perguntas marcadas para a 1ª OS (e as de{' '}
                          <strong>toda visita</strong>) aparecem logo na primeira
                          visita; as demais só aparecem quando a frequência delas
                          vencer pela primeira vez.
                          <span className="mt-1.5 block text-xs text-muted-foreground">
                            • <strong className="text-foreground">{firstOsCount}</strong> pergunta(s) entram na 1ª visita
                            {deferredCount > 0 && (
                              <> • <strong className="text-foreground">{deferredCount}</strong> ficam pra quando a frequência vencer</>
                            )}
                          </span>
                        </Block>
                      );
                    })()}

                    <Block title="Frequência e cronograma">
                      O plano começa em <strong>{startLabel}</strong> e cobre{' '}
                      <strong>{horizonMonths}</strong> meses, gerando{' '}
                      <strong>{visitCount}</strong> {usePlanEngine ? 'visita(s)' : 'ocorrência(s)'}.
                      {usePlanEngine ? (
                        <> Em cada mês com atividades a vencer é gerada uma <strong>visita única</strong> que reúne tudo o que vence naquele mês.
                          {freqParts.length > 0 && <> As atividades se distribuem em: <strong>{freqParts.join(', ')}</strong>.</>}</>
                      ) : (
                        <> A cadência é <strong>{getFrequencyLabel(freqType, freqValue)}</strong>.</>
                      )}
                    </Block>

                    {templateName && (
                      <Block title="Checklist padrão">
                        O checklist padrão aplicado é <strong>{templateName}</strong> (pode ser sobrescrito por item).
                      </Block>
                    )}

                    <Block title="Equipe responsável">
                      {teamParts.length > 0
                        ? <>Responsável pela execução: <strong>{teamParts.join(' + ')}</strong>.</>
                        : <>Nenhum técnico ou equipe foi atribuído ainda.</>}
                    </Block>
                  </div>
                );
              })()}

              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-1">Ficha técnica</p>
              <div className="grid gap-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Nome</span><span className="font-medium text-right">{name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Cliente</span><span className="font-medium">{clientName}</span></div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Técnicos Executores</span>
                  <span className="font-medium text-right">
                    {(() => {
                      if (selectedUserIds.length === 0 && selectedTeamIds.length === 0) return '—';
                      const parts: string[] = [];
                      if (selectedUserIds.length === 1) {
                        const name = (technicians ?? []).find(t => t.user_id === selectedUserIds[0])?.full_name;
                        parts.push(name || '1 técnico');
                      } else if (selectedUserIds.length > 1) {
                        parts.push(`${selectedUserIds.length} técnicos`);
                      }
                      if (selectedTeamIds.length > 0) {
                        parts.push(`${selectedTeamIds.length} equipe(s)`);
                      }
                      return parts.join(' + ');
                    })()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Frequência</span>
                  <span className="font-medium text-right">
                    {usePlanEngine ? `Por serviço (${schedulablePlan.length}) — visita mensal agrupada` : getFrequencyLabel(freqType, freqValue)}
                  </span>
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">Início</span><span className="font-medium">{format(new Date(startDate + 'T00:00:00'), 'dd/MM/yyyy')}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Horizonte</span><span className="font-medium">{horizonMonths} meses</span></div>
                {!isEditing && (
                  <div className="flex justify-between"><span className="text-muted-foreground">{usePlanEngine ? 'Visitas' : 'Ocorrências'}</span><span className="font-medium">{visitCount} {usePlanEngine ? 'visitas' : 'datas'}</span></div>
                )}
                <div className="flex justify-between"><span className="text-muted-foreground">Ambientes e Equipamentos</span><span className="font-medium">{environments.length} ({effectiveItems.length} equip.)</span></div>
                {/* Preview da rotina POR MÁQUINA (Fase 3): em que visita começa
                    cada equipamento e o que a 1ª visita inclui. */}
                {isPmoc && pmocDerivedItems.length > 0 && (
                  <div className="rounded-md border bg-muted/20 divide-y">
                    {pmocDerivedItems.map((it) => {
                      const cfg = machineConfigs[it.equipment_id];
                      if (!cfg) return null;
                      return (
                        <div key={it.equipment_id} className="flex items-start justify-between gap-2 px-3 py-2 text-xs">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{it.item_name}</p>
                            <p className="text-muted-foreground">
                              {cfg.scope === 'full' ? 'Toda a norma' : 'Só ar-condicionado'} · {cfg.activities.length} checklist(s)
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-medium">{startVisitLabel(cfg.startVisit)}</p>
                            <p className="text-muted-foreground">1ª: {firstVisitContents(cfg.startVisit)}</p>
                          </div>
                        </div>
                      );
                    })}
                    {hasFullMachine && (
                      <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5 shrink-0" />
                        Inclui as atividades de local da norma (torres, bombas, casa de máquinas…).
                      </div>
                    )}
                  </div>
                )}
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant={isActive ? 'success' : 'outline'}>{isActive ? 'Ativo' : 'Pausado'}</Badge></div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Tipo</span>
                  {isPmoc ? (
                    <Badge variant="info" className="gap-1">
                      <ShieldCheck className="h-3 w-3" /> PMOC
                    </Badge>
                  ) : (
                    <span className="font-medium">Comum</span>
                  )}
                </div>
                {isPmoc && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground shrink-0">Responsável Técnico (RT)</span>
                    <div className="text-right min-w-0">
                      {(() => {
                        const rt = responsibleTechnicians.find((r) => r.id === responsibleTechnicianId);
                        if (!rt) return <span className="font-medium">A definir</span>;
                        return (
                          <>
                            <div className="font-medium truncate">{rt.full_name}</div>
                            <div className="text-xs text-muted-foreground">
                              CFT/CREA: {rt.cft_crea ?? '—'}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          </StepTransition>
        </div>
    </div>
  );

  // Navegação do wizard — vai pro footer do ResponsiveModal (fixo abaixo do
  // conteúdo rolável, no desktop e no mobile).
  const wizardFooter = (
    <div className="flex flex-row justify-between gap-2">
      <Button variant="outline" onClick={() => step === 0 ? onOpenChange(false) : setStep(step - 1)} disabled={submitting}>
        {step === 0 ? 'Cancelar' : <><ChevronLeft className="h-4 w-4 mr-1" /> Voltar</>}
      </Button>
      {step < STEPS.length - 1 ? (
        <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>
          Próximo <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      ) : (
        <Button onClick={handleSubmit} disabled={submitting || !canNext()} className="bg-primary text-primary-foreground hover:bg-primary/90">
          {submitting ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…</>
          ) : isEditing ? 'Salvar Alterações' : `Criar Contrato (${visitCount} OSs)`}
        </Button>
      )}
    </div>
  );

  return (
    <>
    {/* Container do wizard: modal central no desktop, drawer de baixo no mobile. */}
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? 'Editar Contrato' : 'Novo Contrato'}
      className="sm:max-w-[920px]"
      footer={wizardFooter}
      lockBackdrop
    >
      {wizardContent}
    </ResponsiveModal>

    {/* Rascunho (só criação): oferece retomar o preenchimento interrompido. */}
    {!isEditing && (
      <DraftResumeDialog
        open={draft.showResumePrompt}
        onResume={() => {
          if (draft.draftData) applyContractDraft(draft.draftData);
          draft.acceptDraft();
        }}
        onDiscard={() => {
          draft.discardDraft();
        }}
      />
    )}

    <CustomerFormDialog
      open={showQuickCustomer}
      onOpenChange={setShowQuickCustomer}
      onSubmit={async (data) => {
        const result = await createCustomer.mutateAsync(data as CustomerInput);
        if (result?.id) {
          setCustomerId(result.id);
          setLooseItems([]);
          setEnvironments([]);
          setSelectedEnvKey(null);
        }
        setShowQuickCustomer(false);
      }}
      isLoading={createCustomer.isPending}
    />

    {/* Quick-create RT (Onda UI-1.2). Cadastro rápido sem sair do modal de contrato.
        O `onCreated` seleciona o novo RT — a invalidate da query no hook cuida
        de fazer ele aparecer no select da lista de RTs ativos. */}
    <PmocQuickCreateRTDialog
      open={showQuickCreateRT}
      onOpenChange={setShowQuickCreateRT}
      onCreated={(rt) => {
        setResponsibleTechnicianId(rt.id);
        setShowQuickCreateRT(false);
      }}
    />

    {/* Criar equipamento do cliente na hora (a partir do picker do ambiente).
        Reaproveita o EquipmentFormDialog (mesma fiação do EquipmentPanel), mas
        trava o cliente no cliente do contrato. No sucesso, já adiciona o novo
        equipamento ao alvo do picker aberto (ambiente real ou grupo "Sem
        ambiente"). A lista do cliente recarrega via react-query. */}
    <EquipmentFormDialog
      open={showQuickEquip}
      onOpenChange={setShowQuickEquip}
      customers={contractCustomerAsList}
      categories={equipmentCategories}
      isLoading={createEquipment.isPending}
      equipmentCount={equipment.length}
      onSubmit={async (data) => {
        const created = await createEquipment.mutateAsync({ ...data, customer_id: customerId } as any);
        const newId = (created as any)?.id as string | undefined;
        if (newId && memberPickerEnvKey) {
          if (memberPickerEnvKey === LOOSE_ENV_KEY) addEquipmentAsLoose(newId);
          else addEquipmentToEnv(memberPickerEnvKey, newId);
        }
        setShowQuickEquip(false);
        setMemberPickerEnvKey(null);
      }}
    />

    {/* Picker de equipamentos do cliente pro ambiente (ou grupo "Sem ambiente").
        Multi-seleção + busca, espelha a aba de detalhe. Inclui criar-na-hora. */}
    <ResponsiveModal
      open={!!memberPickerEnvKey && !showQuickEquip}
      onOpenChange={(v) => { if (!v) setMemberPickerEnvKey(null); }}
      title={memberPickerEnvKey === LOOSE_ENV_KEY ? 'Adicionar equipamento ao contrato' : 'Adicionar equipamento ao ambiente'}
    >
      {(() => {
        const inTarget = memberPickerEnvKey === LOOSE_ENV_KEY
          ? new Set(looseItems.map(it => it.equipment_id).filter(Boolean) as string[])
          : new Set(environments.find(e => e.key === memberPickerEnvKey)?.equipment_ids ?? []);
        const q = memberPickerSearch.trim().toLowerCase();
        const pickerAvailable = activeEquipment.filter((eq: any) => {
          if (inTarget.has(eq.id)) return false;
          // Exclusividade entre ambientes: oculta o que já está em OUTRO ambiente.
          const ownerKey = equipmentOwnerEnvKey.get(eq.id);
          if (ownerKey && ownerKey !== memberPickerEnvKey) return false;
          if (!q) return true;
          return (
            eq.name?.toLowerCase().includes(q) ||
            eq.brand?.toLowerCase().includes(q) ||
            eq.model?.toLowerCase().includes(q)
          );
        });
        return (
          <div className="space-y-3 p-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar equipamento do cliente..." value={memberPickerSearch} onChange={(e) => setMemberPickerSearch(e.target.value)} className="pl-8" />
            </div>

            <Button variant="outline" className="w-full min-h-11 active:scale-[0.98] transition-transform rounded-xl" disabled={!customerId} onClick={() => setShowQuickEquip(true)}>
              <Plus className="mr-2 h-4 w-4" /> Criar novo equipamento
            </Button>

            {pickerAvailable.length === 0 ? (
              memberPickerSearch.trim() ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum equipamento encontrado para "{memberPickerSearch.trim()}".
                </p>
              ) : (
                <EmptyState
                  size="compact"
                  icon={<Wrench className="h-10 w-10" />}
                  title={activeEquipment.length === 0 ? 'Cliente sem equipamentos ativos' : 'Todos já estão em algum ambiente'}
                  description={activeEquipment.length === 0 ? 'Crie um equipamento para adicioná-lo.' : 'Os equipamentos do cliente já foram distribuídos nos ambientes.'}
                />
              )
            ) : (
              <div className="max-h-72 divide-y overflow-y-auto rounded-md border">
                {pickerAvailable.map((eq: any) => {
                  const selected = memberPickerSelection.has(eq.id);
                  return (
                    <button
                      key={eq.id}
                      type="button"
                      onClick={() => toggleMemberPick(eq.id)}
                      className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors min-h-11', selected ? 'bg-primary/5' : 'hover:bg-muted/50')}
                    >
                      <div className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                        {selected && <Check className="h-3.5 w-3.5" />}
                      </div>
                      <EquipmentAvatar photoUrl={eq.photo_url} name={eq.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{eq.name}</p>
                        {[eq.brand, eq.model].filter(Boolean).length > 0 && (
                          <p className="truncate text-xs text-muted-foreground">{[eq.brand, eq.model].filter(Boolean).join(' - ')}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <Button className="w-full min-h-11 active:scale-[0.98] transition-transform rounded-xl" onClick={confirmMemberPicker} disabled={memberPickerSelection.size === 0}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar {memberPickerSelection.size > 0 ? `${memberPickerSelection.size} ` : ''}
              equipamento{memberPickerSelection.size !== 1 ? 's' : ''}
            </Button>
          </div>
        );
      })()}
    </ResponsiveModal>

    {/* Confirmação de remover ambiente (etapa Ambientes). */}
    <AlertDialog open={!!removingEnvKey} onOpenChange={(o) => { if (!o) setRemovingEnvKey(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover ambiente?</AlertDialogTitle>
          <AlertDialogDescription>
            {(() => {
              const n = removingEnvKey ? (environments.find(e => e.key === removingEnvKey)?.equipment_ids.length ?? 0) : 0;
              return n > 0
                ? `Os ${n} equipamento(s) deste ambiente sairão do ambiente. ${isPmoc ? 'Eles deixam o contrato.' : 'Eles voltam para o grupo "Sem ambiente".'}`
                : 'O ambiente sai do contrato.';
            })()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (!removingEnvKey) return;
              // No comum, devolve os equipamentos do ambiente pro grupo "Sem ambiente".
              if (!isPmoc) {
                const env = environments.find(e => e.key === removingEnvKey);
                for (const eqId of env?.equipment_ids ?? []) addEquipmentAsLoose(eqId);
              }
              removeEnvironment(removingEnvKey);
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            <Trash2 className="mr-2 h-4 w-4" /> Remover
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Confirmação de remover equipamento (do ambiente ou do contrato). */}
    <AlertDialog open={!!removingMember} onOpenChange={(o) => { if (!o) setRemovingMember(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {removingMember?.mode === 'loose'
              ? 'Remover equipamento do contrato?'
              : !isPmoc ? 'Tirar equipamento do ambiente?' : 'Remover equipamento do ambiente?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            <strong>
              {removingMember?.mode === 'loose'
                ? (removingMember.looseIdx != null ? (looseItems[removingMember.looseIdx]?.item_name ?? 'Equipamento') : 'Equipamento')
                : (removingMember?.eqId ? (equipmentById.get(removingMember.eqId)?.name ?? 'Equipamento') : 'Equipamento')}
            </strong>{' '}
            {removingMember?.mode === 'loose'
              ? 'sai do contrato.'
              : !isPmoc ? 'volta para o grupo "Sem ambiente" (continua no contrato).' : 'sai deste ambiente e do contrato.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (!removingMember) return;
              if (removingMember.mode === 'loose' && removingMember.looseIdx != null) removeLooseItem(removingMember.looseIdx);
              else if (removingMember.envKey && removingMember.eqId) removeEquipmentFromEnv(removingMember.envKey, removingMember.eqId);
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {removingMember?.mode === 'env' && !isPmoc ? 'Tirar do ambiente' : 'Remover'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* "Mover para ambiente": escolhe o ambiente destino do item solto. */}
    <ResponsiveModal
      open={movingLooseIdx != null}
      onOpenChange={(v) => { if (!v) setMovingLooseIdx(null); }}
      title="Mover para ambiente"
    >
      <div className="space-y-2 p-1">
        {environments.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum ambiente cadastrado ainda.</p>
        ) : environments.map((env, idx) => (
          <button
            key={env.key}
            type="button"
            onClick={() => { if (movingLooseIdx != null) moveLooseToEnv(movingLooseIdx, env.key); }}
            className="flex w-full min-h-12 items-center gap-3 rounded-xl border-2 bg-card p-3 text-left transition-colors hover:bg-muted/40 active:scale-[0.99]"
          >
            <Badge variant="info" className="shrink-0">Ambiente {idx + 1}</Badge>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{env.identificacao.trim() || 'Sem identificação'}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </ResponsiveModal>

    {/* Picker do catálogo PMOC (Fase 2). Drawer no mobile, dialog no desktop.
        Navegação por seção (accordion); cada item é um checkbox com o selo de
        frequência default da norma. Multi-seleção; ao confirmar vira linha do
        plano (editável depois). */}
    <ResponsiveModal
      open={showCatalogPicker}
      onOpenChange={(v) => { setShowCatalogPicker(v); if (!v) { setPickerMachineEqId(null); setPickerMachineScope(null); } }}
      title={pickerMachineEqId ? 'Checklists da Máquina' : 'Catálogo de atividades PMOC'}
      footer={
        <div className="flex flex-row items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {pickerSelection.size + (pickerMachineEqId ? pickerTemplateSelection.size : 0)} selecionada(s)
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setShowCatalogPicker(false); setPickerMachineEqId(null); setPickerMachineScope(null); }}>Cancelar</Button>
            <Button onClick={confirmCatalogPicker}>{pickerMachineEqId ? 'Aplicar à máquina' : 'Adicionar ao plano'}</Button>
          </div>
        </div>
      }
    >
      <PmocChecklistPicker
        catalogGroups={catalogGroups}
        catalogLoading={catalogLoading}
        scope={pickerMachineScope}
        selection={pickerSelection}
        onChange={setPickerSelection}
        customTemplates={pickerMachineEqId ? customTemplateOptions : []}
        selectedTemplateIds={pickerTemplateSelection}
        onChangeTemplates={pickerMachineEqId ? setPickerTemplateSelection : undefined}
        excludedQuestionIds={pickerExcludedQuestions}
        onToggleExcludedQuestion={pickerMachineEqId ? togglePickerExcludedQuestion : undefined}
      />
    </ResponsiveModal>

    {/* Calculadora de área (largura × comprimento → m²). */}
    <AreaCalculatorModal
      open={!!areaCalcEnvKey}
      onOpenChange={(v) => { if (!v) setAreaCalcEnvKey(null); }}
      onApply={(areaBR) => { if (areaCalcEnvKey) updateEnvironmentField(areaCalcEnvKey, 'area_climatizada_m2', areaBR); }}
    />

    {/* Calculadora de carga térmica (ferramenta da Área do Técnico → TR). */}
    <CargaTermicaCalculatorModal
      open={!!cargaCalcEnvKey}
      onOpenChange={(v) => { if (!v) setCargaCalcEnvKey(null); }}
      onApply={(trBR) => { if (cargaCalcEnvKey) updateEnvironmentField(cargaCalcEnvKey, 'carga_termica_tr', trBR); }}
    />

    {/* Viewer da foto do equipamento (ampliada). */}
    <ImagePreviewModal
      open={!!previewPhoto}
      src={previewPhoto?.src ?? ''}
      alt={previewPhoto?.alt}
      onClose={() => setPreviewPhoto(null)}
    />

    {/* Confirmação antes de recalcular as visitas futuras (edição de cronograma).
        ResponsiveModal = drawer de baixo no mobile, dialog no desktop. */}
    <ResponsiveModal
      open={showRegenConfirm}
      onOpenChange={(v) => { if (!v) { setShowRegenConfirm(false); setSubmitting(false); } }}
      title="Recalcular visitas futuras?"
      footer={
        <div className="flex flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => { setShowRegenConfirm(false); setSubmitting(false); }}>
            Cancelar
          </Button>
          <Button
            className="bg-warning text-warning-foreground hover:bg-warning/90"
            onClick={confirmRegenAndUpdate}
            disabled={submitting}
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…</>
            ) : 'Recalcular visitas'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          Alterar datas, frequência ou os serviços do plano vai recalcular as visitas futuras deste contrato.
        </p>
        <p className="text-foreground font-medium">
          {regenCount} visita(s) futura(s) não realizada(s) serão refeitas.
        </p>
        <p>
          Visitas já realizadas, em andamento ou a caminho são preservadas. Cobranças (financeiro) não são afetadas.
        </p>
      </div>
    </ResponsiveModal>

    {/* Confirmação ao desligar PMOC quando já havia RT atribuído. */}
    <AlertDialog open={showPmocOffConfirm} onOpenChange={setShowPmocOffConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desligar PMOC deste contrato?</AlertDialogTitle>
          <AlertDialogDescription>
            O Responsável Técnico será desvinculado e as próximas OSs deixarão de exibir o selo
            "Conforme Lei Federal 13.589/2018". OSs já geradas não são afetadas. Você pode reativar
            depois.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setIsPmoc(false);
              setResponsibleTechnicianId('');
              setShowPmocOffConfirm(false);
            }}
          >
            Desligar PMOC
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
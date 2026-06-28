import { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  Plus,
  Check,
  Trash2,
  Loader2,
  Wrench,
  HelpCircle,
  CalendarCheck,
  Calculator,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { AreaCalculatorModal } from '@/components/contracts/AreaCalculatorModal';
import { CargaTermicaCalculatorModal } from '@/components/contracts/CargaTermicaCalculatorModal';
import { EquipmentAvatar } from '@/components/contracts/EquipmentAvatar';
import { EnvironmentPhotoField } from '@/components/contracts/EnvironmentPhotoField';
import { PmocChecklistPicker } from '@/components/contracts/PmocChecklistPicker';
import { CommonChecklistEditor, type ChecklistTemplateOption } from '@/components/contracts/CommonChecklistEditor';
import { isEveryVisit } from '@/components/contracts/questionFrequency';
import { EmptyState } from '@/components/mobile/EmptyState';
import { EquipmentFormDialog } from '@/components/customers/EquipmentFormDialog';
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
import { useEquipment } from '@/hooks/useEquipment';
import { useEquipmentCategories } from '@/hooks/useEquipmentCategories';
import { useCustomers } from '@/hooks/useCustomers';
import {
  useContracts,
  useContractPlanActivities,
  REGENERABLE_OS_STATUSES,
  type Contract,
} from '@/hooks/useContracts';
import { usePmocActivityCatalog } from '@/hooks/usePmocActivityCatalog';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import {
  type PmocMachineScope,
  type MachineConfig,
  type PlanActivityRow,
  type MachineItemRef,
  START_VISIT_OPTIONS,
  startVisitLabel,
  firstVisitContents,
  catalogToPlanRow,
  machineCatalogActivities,
  reconstructMachineConfigs,
  buildDefaultMachineConfig,
  buildPmocPlanFromMachines,
  buildPmocItemsWithScope,
  planRowToInput,
} from '@/components/contracts/pmocMachineRoutine';
import { getErrorMessage } from '@/utils/errorMessages';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ContractEnvironmentsTabProps {
  contract: Contract;
}

// Chave virtual do grupo "Sem ambiente" (só contrato comum). NÃO é um registro de
// contract_environments — é um pseudo-ambiente pra agrupar contract_items soltos
// (environment_id NULL) dos contratos antigos, sem migration.
const LOOSE_ENV_KEY = '__loose__';

// Item solto do contrato (sem ambiente). Espelha contract_items com environment_id
// NULL: preserva equipment_id + os campos snapshot pra não perder nada no save.
// `equipment_id` pode ser NULL: contratos comuns antigos têm itens MANUAIS (sem
// equipamento vinculado, só item_name/item_description, criados pela antiga
// ContractEquipmentTab). Esses também moram no grupo "Sem ambiente" e PRECISAM
// ser preservados no save — senão o diff de itens do backend os apaga.
interface LooseItem {
  equipment_id: string | null;
  item_name: string;
  item_description: string | null;
  form_template_id: string | null;
}

// Chave estável de item solto, espelhando o `itemKey` do diff do backend
// (useContracts ~2089/2485) e a convenção do form: item com equipamento =
// `eq:<id>`; item manual = `manual:<nome>:<descrição>` (ambos normalizados).
// Usada como key do React, dedupe de payload e detecção de dirty.
//
// FIX B — a descrição entra na chave pra desambiguar itens manuais homônimos
// (ex.: dois "Bebedouro" com modelos/descrições diferentes), que antes
// colapsavam em `manual:<nome>` e faziam o diff perder/não inserir uma cópia.
// A chave é 100% derivada do conteúdo (nome+descrição) → é reconstruída idêntica
// dos dois lados do diff (payload e linhas do banco), então um "save sem mudança"
// continua sendo no-op (nada de delete+reinsert). Duplicata EXATA (mesmo nome E
// mesma descrição) ainda colide; isso é tratado preservando todas as cópias na
// montagem do payload e exige acompanhamento pra robustez total do diff.
function looseItemKey(it: { equipment_id: string | null; item_name: string; item_description?: string | null }): string {
  if (it.equipment_id) return `eq:${it.equipment_id}`;
  const name = (it.item_name || '').trim().toLowerCase();
  const desc = (it.item_description || '').trim().toLowerCase();
  return `manual:${name}:${desc}`;
}

// Ambiente no estado da UI. Strings cruas nos campos numéricos; equipment_ids
// referencia equipamentos do cliente (exclusivos entre ambientes). `id` presente
// quando já persistido. `key` estável pra React.
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

function numToStrBR(v: number | null | undefined): string {
  return v === null || v === undefined ? '' : String(v).replace('.', ',');
}
function parseDecimalBR(raw: string): number | null {
  const t = (raw ?? '').trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
function parseIntOrNull(raw: string): number | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

let envKeySeq = 0;
function newEnvRow(): EnvRow {
  envKeySeq += 1;
  return {
    key: `env-new-${Date.now()}-${envKeySeq}`,
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

/**
 * Aba "Ambientes" da tela de detalhe (contrato PMOC). Master-detail dentro da
 * aba: uma LISTA de ambientes; clicar abre a tela daquele ambiente (campos +
 * equipamentos membros), sem sair da aba. CRUD dos ambientes climatizados +
 * atribuição de equipamentos por ambiente (exclusivo entre ambientes) + a ROTINA
 * POR MÁQUINA (escopo da norma + começa-na-visita + checklists do catálogo PMOC),
 * com paridade total ao formulário de contrato.
 *
 * Membership (equipamento está no ambiente) é controlado por adicionar/remover
 * explícito. Expansão da config por máquina é um chevron próprio, fechado por
 * padrão, que NUNCA mexe na membership.
 *
 * Salvar usa LITERALMENTE o mesmo caminho do formulário: monta `items` (com
 * pmoc_scope/pmoc_start_visit) e `plan_activities` (por máquina + bucket local)
 * pelos builders compartilhados de `pmocMachineRoutine` e chama
 * `updateContract.mutateAsync` — que persiste itens+plano por máquina e regenera
 * as visitas futuras (preservando passadas/em-andamento/concluídas). Sem
 * divergência de lógica com o ContractFormDialog.
 */
export function ContractEnvironmentsTab({ contract }: ContractEnvironmentsTabProps) {
  const { toast } = useToast();
  const { updateContract } = useContracts();
  const { equipment, createEquipment } = useEquipment(contract.customer_id || undefined);
  const { categories } = useEquipmentCategories();
  const { customers } = useCustomers();
  const activeEquipment = useMemo(() => equipment.filter((eq: any) => eq.status === 'active'), [equipment]);
  const { data: existingPlan } = useContractPlanActivities(contract.id);
  const { activities: catalogActivities, groups: catalogGroups, isLoading: catalogLoading } = usePmocActivityCatalog();
  const { templates, isLoading: templatesLoading } = useFormTemplates();

  // Cliente do contrato (pra prefixar o formulário de criar equipamento).
  const contractCustomer = useMemo(
    () => customers.filter((c: any) => c.id === contract.customer_id),
    [customers, contract.customer_id],
  );

  // Lookup de equipamento por id (lista completa: um membro pode estar inativo).
  const equipmentById = useMemo(() => {
    const m = new Map<string, any>();
    for (const eq of equipment) m.set(eq.id, eq);
    return m;
  }, [equipment]);

  // Checklists personalizados do tenant (ativos, não-pmoc-default) pro picker e o
  // plano. `templateNameById` rotula a linha de plano custom.
  const customTemplateOptions = useMemo(
    () =>
      (templates ?? [])
        .filter((t: any) => t.is_active && !t.is_pmoc_default)
        .map((t: any) => ({ id: t.id, name: t.name, questionCount: (t.questions ?? []).length })),
    [templates],
  );
  const templateNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of customTemplateOptions) map[t.id] = t.name;
    return map;
  }, [customTemplateOptions]);

  const isPmoc = !!contract.is_pmoc;

  // Conjunto inicial de ambientes a partir do que está persistido (+ agrupamento
  // de equipamentos por environment_id, lido dos contract_items).
  const initialEnvs = useMemo<EnvRow[]>(() => {
    const items = (contract.contract_items || []) as any[];
    return ((contract.contract_environments || []) as any[])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((e) => ({
        id: e.id,
        key: `env-${e.id}`,
        identificacao: e.identificacao || '',
        tipo_atividade: e.tipo_atividade || '',
        area_climatizada_m2: numToStrBR(e.area_climatizada_m2),
        ocupantes_fixos: numToStrBR(e.ocupantes_fixos),
        ocupantes_flutuantes: numToStrBR(e.ocupantes_flutuantes),
        carga_termica_tr: numToStrBR(e.carga_termica_tr),
        photo_url: e.photo_url ?? null,
        equipment_ids: items
          .filter((it) => it.environment_id === e.id && it.equipment_id)
          .map((it) => it.equipment_id as string),
      }));
  }, [contract.contract_environments, contract.contract_items]);

  const [envs, setEnvs] = useState<EnvRow[]>(initialEnvs);

  // Itens SOLTOS (contract_items com environment_id NULL) — só no contrato comum.
  // Contratos antigos têm equipamentos fora de qualquer ambiente; eles aparecem
  // no grupo virtual "Sem ambiente" e PRECISAM ser preservados no save (não vêm
  // dos ambientes). No PMOC todo equipamento vive num ambiente → fica vazio.
  // Inclui itens com equipamento (equipment_id) E itens MANUAIS (equipment_id
  // NULL, só item_name/item_description). Ambos vivem fora de qualquer ambiente
  // (environment_id NULL) e PRECISAM ser carregados/reenviados, ou o diff de
  // itens do backend os apaga silenciosamente (perda de dado).
  const initialLooseItems = useMemo<LooseItem[]>(() => {
    if (isPmoc) return [];
    return ((contract.contract_items || []) as any[])
      .filter((it) => !it.environment_id)
      .map((it) => ({
        equipment_id: (it.equipment_id as string) || null,
        item_name: it.item_name ?? '',
        item_description: it.item_description ?? null,
        form_template_id: it.form_template_id ?? null,
      }));
  }, [isPmoc, contract.contract_items]);

  const [looseItems, setLooseItems] = useState<LooseItem[]>(initialLooseItems);

  // Master-detail: null = lista de ambientes; preenchido = detalhe daquele.
  // LOOSE_ENV_KEY abre o grupo virtual "Sem ambiente" (só comum).
  const [selectedEnvKey, setSelectedEnvKey] = useState<string | null>(null);
  // Expansão da config por máquina (PMOC). Set de equipment_id expandidos.
  // Fechado por padrão; NUNCA mexe na membership (equipment_ids).
  const [expandedEqIds, setExpandedEqIds] = useState<Set<string>>(new Set());
  const [removingEnvKey, setRemovingEnvKey] = useState<string | null>(null);
  // Remoção de equipamento. mode 'env' = tira do ambiente (no comum volta pro
  // grupo "Sem ambiente"; no PMOC sai do contrato). mode 'loose' = tira de vez do
  // contrato (a partir do grupo "Sem ambiente"). envKey = ambiente alvo (mode env).
  // looseKey = chave estável do item solto (mode loose) — necessária pra remover
  // item MANUAL, que não tem eqId. label = nome a exibir no diálogo (manual não
  // tem equipamento pra resolver o nome).
  const [removingMember, setRemovingMember] = useState<{
    mode: 'env' | 'loose';
    envKey?: string;
    eqId: string | null;
    looseKey?: string;
    label?: string;
  } | null>(null);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [regenCount, setRegenCount] = useState(0);
  const [saving, setSaving] = useState(false);
  // Calculadora de área: guarda a key do ambiente alvo (null = fechada).
  const [areaCalcEnvKey, setAreaCalcEnvKey] = useState<string | null>(null);
  // Calculadora de carga térmica: guarda a key do ambiente alvo (null = fechada).
  const [cargaCalcEnvKey, setCargaCalcEnvKey] = useState<string | null>(null);
  // Viewer da foto do equipamento (ampliada). null = fechado.
  const [previewPhoto, setPreviewPhoto] = useState<{ src: string; alt: string } | null>(null);

  // Picker de equipamentos do ambiente (multi-seleção com busca). Espelha o
  // padrão do ContractEquipmentTab. envKey = ambiente alvo (null = fechado).
  const [memberPickerEnvKey, setMemberPickerEnvKey] = useState<string | null>(null);
  const [memberPickerSearch, setMemberPickerSearch] = useState('');
  const [memberPickerSelection, setMemberPickerSelection] = useState<Set<string>>(new Set());
  // Formulário de criar equipamento do cliente na hora.
  const [showCreateEquipment, setShowCreateEquipment] = useState(false);

  // Rotina POR MÁQUINA (Fase 5). Chave = equipment_id. Reconstruída do que está
  // persistido (contract_items + contract_plan_activities) pela MESMA fonte única
  // usada pelo formulário; auto-sincada com os equipamentos dos ambientes.
  const [machineConfigs, setMachineConfigs] = useState<Record<string, MachineConfig>>({});
  // Snapshot da reconstrução inicial — base pra detectar mudança de rotina.
  const [initialMachineConfigs, setInitialMachineConfigs] = useState<Record<string, MachineConfig>>({});
  const [machineConfigsLoaded, setMachineConfigsLoaded] = useState(false);

  // Checklist por equipamento (contrato COMUM). Chave = equipment_id. Espelha a
  // plumbing do ContractFormDialog: lista de checklists (form_template_ids) +
  // exclusões da 1ª OS (first_os_excluded_questions). Itens manuais (sem
  // equipment_id) não têm editor por equipamento. Snapshot inicial pra detectar
  // dirty; `loaded` guard pra carregar uma vez (refetch troca a ref do contrato).
  const [commonChecklists, setCommonChecklists] =
    useState<Record<string, { formTemplateIds: string[]; excluded: string[] }>>({});
  const [initialCommonChecklists, setInitialCommonChecklists] =
    useState<Record<string, { formTemplateIds: string[]; excluded: string[] }>>({});
  const [commonChecklistsLoaded, setCommonChecklistsLoaded] = useState(false);
  // Expansão do editor de checklist por equipamento (comum). Set de equipment_id.
  const [expandedChecklistEqIds, setExpandedChecklistEqIds] = useState<Set<string>>(new Set());

  // Picker do catálogo PMOC POR MÁQUINA. `pickerMachineEqId` = equipamento alvo;
  // ao confirmar, a seleção SUBSTITUI a listagem daquela máquina.
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);
  const [pickerMachineEqId, setPickerMachineEqId] = useState<string | null>(null);
  const [pickerMachineScope, setPickerMachineScope] = useState<PmocMachineScope | null>(null);
  const [pickerSelection, setPickerSelection] = useState<Set<string>>(new Set());
  // Seleção dos checklists PERSONALIZADOS (form_templates) no modal aberto.
  const [pickerTemplateSelection, setPickerTemplateSelection] = useState<Set<string>>(new Set());

  // Reconstrói as configs por máquina ao carregar o contrato + o plano + o
  // catálogo. Fonte ÚNICA compartilhada (mesma do form em edição). Só PMOC.
  useEffect(() => {
    if (!isPmoc) return;
    if (catalogLoading || catalogActivities.length === 0) return;
    if (existingPlan === undefined) return; // espera a query do plano resolver
    if (machineConfigsLoaded) return;
    const configs = reconstructMachineConfigs({
      items: (contract.contract_items || []) as any[],
      plan: (existingPlan ?? []) as any[],
      catalogActivities,
    });
    setMachineConfigs(configs);
    setInitialMachineConfigs(configs);
    setMachineConfigsLoaded(true);
  }, [isPmoc, contract.contract_items, existingPlan, catalogLoading, catalogActivities, machineConfigsLoaded]);

  // Mantém os machineConfigs sincronizados com os equipamentos dos ambientes:
  // cria config default pra máquina nova; remove a da máquina que saiu. Não toca
  // em config existente (preserva escopo/fase/listagem). Só roda após a carga.
  useEffect(() => {
    if (!isPmoc || !machineConfigsLoaded) return;
    if (catalogLoading || catalogActivities.length === 0) return;
    const selectedIds = new Set<string>();
    for (const env of envs) for (const id of env.equipment_ids) selectedIds.add(id);
    setMachineConfigs((prev) => {
      let changed = false;
      const next: Record<string, MachineConfig> = {};
      for (const id of selectedIds) {
        if (prev[id]) next[id] = prev[id];
        else { next[id] = buildDefaultMachineConfig(catalogActivities, id, 'ac'); changed = true; }
      }
      for (const id of Object.keys(prev)) if (!selectedIds.has(id)) changed = true;
      return changed ? next : prev;
    });
  }, [isPmoc, machineConfigsLoaded, envs, catalogLoading, catalogActivities]);

  // ---- Checklist por equipamento (contrato COMUM) ---------------------------
  // Reconstrói o checklist por equipamento (form_template_ids + exclusões da 1ª
  // OS) de TODO contract_item com equipment_id (em ambiente ou solto). Espelha o
  // form: form_template_ids se não-vazio; senão [form_template_id] (compat). Roda
  // uma vez por carga (guard) pra não sobrescrever edição em andamento quando o
  // refetch troca a referência do contrato.
  useEffect(() => {
    if (isPmoc || commonChecklistsLoaded) return;
    const map: Record<string, { formTemplateIds: string[]; excluded: string[] }> = {};
    for (const i of (contract.contract_items || []) as any[]) {
      if (!i.equipment_id) continue;
      const ex = Array.isArray(i.first_os_excluded_questions)
        ? (i.first_os_excluded_questions as any[]).filter((x) => typeof x === 'string')
        : [];
      const ids = Array.isArray(i.form_template_ids)
        ? (i.form_template_ids as any[]).filter((x) => typeof x === 'string')
        : [];
      const effectiveIds = ids.length > 0 ? ids : i.form_template_id ? [i.form_template_id] : [];
      map[i.equipment_id] = { formTemplateIds: effectiveIds, excluded: ex };
    }
    setCommonChecklists(map);
    setInitialCommonChecklists(map);
    if (contract.id) setCommonChecklistsLoaded(true);
  }, [isPmoc, contract.contract_items, contract.id, commonChecklistsLoaded]);

  // Poda as entradas de equipamentos que saíram do contrato (não acumula lixo).
  // Conjunto autoritativo = equipamentos em algum ambiente OU soltos (com id).
  useEffect(() => {
    if (isPmoc || !commonChecklistsLoaded) return;
    const ids = new Set<string>();
    for (const env of envs) for (const id of env.equipment_ids) ids.add(id);
    for (const it of looseItems) if (it.equipment_id) ids.add(it.equipment_id);
    setCommonChecklists((prev) => {
      let changed = false;
      const next: Record<string, { formTemplateIds: string[]; excluded: string[] }> = {};
      for (const [id, cfg] of Object.entries(prev)) {
        if (ids.has(id)) next[id] = cfg;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [isPmoc, commonChecklistsLoaded, envs, looseItems]);

  // Leitura segura: equipamento sem entrada → nenhum checklist, sem exclusões.
  const getCommonChecklist = (eqId: string) =>
    commonChecklists[eqId] ?? { formTemplateIds: [], excluded: [] };

  const setCommonChecklistTemplates = (eqId: string, templateIds: string[]) => {
    setCommonChecklists((prev) => {
      const cur = prev[eqId];
      const sameList =
        cur && cur.formTemplateIds.length === templateIds.length &&
        cur.formTemplateIds.every((id, i) => id === templateIds[i]);
      if (sameList) return prev;
      return { ...prev, [eqId]: { formTemplateIds: templateIds, excluded: cur?.excluded ?? [] } };
    });
  };

  const setCommonChecklistExcluded = (eqId: string, excluded: string[]) => {
    setCommonChecklists((prev) => ({
      ...prev,
      [eqId]: { formTemplateIds: prev[eqId]?.formTemplateIds ?? [], excluded },
    }));
  };

  const toggleChecklistExpanded = (eqId: string) => {
    setExpandedChecklistEqIds((prev) => {
      const next = new Set(prev);
      if (next.has(eqId)) next.delete(eqId);
      else next.add(eqId);
      return next;
    });
  };

  // Checklists personalizados COM perguntas (frequência inclusa) pro editor do
  // contrato comum. Mesma fonte/shape do form (CommonChecklistEditor consome).
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
  const templateQuestionsById = useMemo(() => {
    const map = new Map<string, ChecklistTemplateOption>();
    for (const t of commonChecklistTemplates) map.set(t.id, t);
    return map;
  }, [commonChecklistTemplates]);

  // Campos de checklist por equipamento (form_template_ids + form_template_id
  // compat + first_os_excluded_questions). Sanitiza exclusões: só ids que (a)
  // pertencem a algum checklist escolhido e (b) NÃO são "toda visita". `undefined`
  // em first_os_excluded_questions quando o catálogo ainda carrega → o diff do
  // hook PRESERVA o que está no banco (guarda `wantExcluded !== undefined`),
  // evitando zerar exclusões salvas. Idêntico ao commonChecklistPayload do form.
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
    const primaryId = tplIds[0];
    const resolved = tplIds.map((id) => templateQuestionsById.get(id));
    const anyUnresolved = resolved.some((t) => !t);
    if (anyUnresolved && templatesLoading) {
      return { form_template_ids: tplIds, form_template_id: primaryId, first_os_excluded_questions: undefined };
    }
    const validIds = new Set<string>();
    for (const tpl of resolved) {
      for (const q of tpl?.questions ?? []) {
        if (!isEveryVisit(q)) validIds.add(q.id);
      }
    }
    const excluded = (cfg?.excluded ?? []).filter((id) => validIds.has(id));
    return { form_template_ids: tplIds, form_template_id: primaryId, first_os_excluded_questions: excluded };
  };

  // Mapa equipment_id → key do ambiente que o reivindica (exclusividade).
  const equipmentOwnerEnvKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const env of envs) for (const eqId of env.equipment_ids) map.set(eqId, env.key);
    return map;
  }, [envs]);

  // Assinatura pra detectar mudança (idempotência da UI). Inclui campos + equip.
  const sigOf = (rows: EnvRow[]) =>
    rows
      .map((e) =>
        [
          e.id ?? 'new',
          e.identificacao.trim(),
          e.tipo_atividade.trim(),
          e.area_climatizada_m2.trim(),
          e.ocupantes_fixos.trim(),
          e.ocupantes_flutuantes.trim(),
          e.carga_termica_tr.trim(),
          [...e.equipment_ids].sort().join(','),
        ].join('|'),
      )
      .join('§');

  // Assinatura da rotina por máquina (escopo + fase + listagem do catálogo). É o
  // que diferencia a rotina entre estados — usada pra detectar dirty e mudança de
  // cronograma (escopo/fase/checklists re-expandem as visitas).
  const machineSigOf = (cfgs: Record<string, MachineConfig>) =>
    Object.keys(cfgs)
      .sort()
      .map((eqId) => {
        const c = cfgs[eqId];
        const acts = [...c.activities]
          .map((a) => a.catalog_activity_id ?? a.description.trim())
          .sort()
          .join(',');
        return `${eqId}:${c.scope}:${c.startVisit}:${acts}`;
      })
      .join('§');

  // Assinatura do grupo "Sem ambiente" (comum): o conjunto de chaves estáveis
  // (eq:<id> | manual:<nome>) importa pra detectar mover/adicionar/remover item
  // solto — inclusive itens MANUAIS (sem equipment_id).
  const looseSigOf = (rows: LooseItem[]) => rows.map(looseItemKey).sort().join(',');

  // Assinatura do checklist por equipamento (comum): por equipamento, lista de
  // checklists (ordem semântica — 1º = primário/compat) + exclusões ordenadas.
  // Reconstruída idêntica do snapshot do banco e do estado atual → "salvar sem
  // mudança" continua no-op. Equipamento sem checklist é omitido (entrada vazia ≡
  // ausência), pra não marcar dirty à toa quando o motor de poda remove a chave.
  const checklistSigOf = (cfgs: Record<string, { formTemplateIds: string[]; excluded: string[] }>) =>
    Object.entries(cfgs)
      .filter(([, c]) => c.formTemplateIds.length > 0)
      .map(([eqId, c]) => `${eqId}|${c.formTemplateIds.join(',')}|${[...c.excluded].sort().join(',')}`)
      .sort()
      .join('§');

  const envsDirty = sigOf(initialEnvs) !== sigOf(envs);
  const machineDirty = machineConfigsLoaded && machineSigOf(initialMachineConfigs) !== machineSigOf(machineConfigs);
  const looseDirty = !isPmoc && looseSigOf(initialLooseItems) !== looseSigOf(looseItems);
  const checklistDirty =
    !isPmoc && commonChecklistsLoaded && checklistSigOf(initialCommonChecklists) !== checklistSigOf(commonChecklists);
  const dirty = envsDirty || machineDirty || looseDirty || checklistDirty;

  // O cronograma muda quando o conjunto de equipamentos OU a rotina por máquina
  // (escopo/fase/checklists) muda — ambos re-expandem as visitas futuras.
  const equipmentSetChanged = useMemo(() => {
    // Conjunto total de equipamentos do contrato = dos ambientes + soltos (comum).
    // Itens manuais (equipment_id NULL) não entram aqui — não têm equipamento e
    // não afetam o cronograma por máquina; o dirty deles é coberto por looseDirty.
    const flat = (rows: EnvRow[], loose: LooseItem[]) =>
      [...new Set([
        ...rows.flatMap((e) => e.equipment_ids),
        ...loose.map((it) => it.equipment_id).filter((id): id is string => !!id),
      ])]
        .sort()
        .join(',');
    return flat(initialEnvs, initialLooseItems) !== flat(envs, looseItems);
  }, [initialEnvs, envs, initialLooseItems, looseItems]);
  // Mudar quais perguntas entram na 1ª OS (checklist por equipamento, comum) muda
  // o conteúdo das visitas futuras → conta como mudança de cronograma (regenera).
  const scheduleChanged = equipmentSetChanged || machineDirty || checklistDirty;

  // Total de equipamentos do contrato (não conta itens manuais — eles não têm
  // equipamento vinculado). Equipamentos dos ambientes + soltos com equipment_id.
  const totalEquipment = useMemo(
    () =>
      new Set([
        ...envs.flatMap((e) => e.equipment_ids),
        ...looseItems.map((it) => it.equipment_id).filter((id): id is string => !!id),
      ]).size,
    [envs, looseItems],
  );

  const addEnvironment = () => {
    const row = newEnvRow();
    setEnvs((prev) => [...prev, row]);
    setSelectedEnvKey(row.key); // abre direto o detalhe do ambiente recém-criado
  };
  const removeEnvironment = (key: string) => {
    setEnvs((prev) => prev.filter((e) => e.key !== key));
    setRemovingEnvKey(null);
    if (selectedEnvKey === key) setSelectedEnvKey(null); // volta pra lista
  };
  const updateField = (key: string, field: keyof EnvRow, value: string) =>
    setEnvs((prev) => prev.map((e) => (e.key === key ? { ...e, [field]: value } : e)));
  // Foto do ambiente: aceita null (remover), fora do updateField tipado pra string.
  const setEnvPhoto = (key: string, photoUrl: string | null) =>
    setEnvs((prev) => prev.map((e) => (e.key === key ? { ...e, photo_url: photoUrl } : e)));

  // Adiciona um equipamento ao ambiente (membership), tirando de outros. No comum,
  // se vinha do grupo "Sem ambiente", deixa de ser solto (sai de looseItems).
  const addEquipmentToEnv = (envKey: string, eqId: string) => {
    setEnvs((prev) =>
      prev.map((e) => {
        if (e.key === envKey) {
          if (e.equipment_ids.includes(eqId)) return e;
          return { ...e, equipment_ids: [...e.equipment_ids, eqId] };
        }
        // Exclusividade: tira de qualquer outro ambiente.
        return { ...e, equipment_ids: e.equipment_ids.filter((id) => id !== eqId) };
      }),
    );
    if (!isPmoc) setLooseItems((prev) => prev.filter((it) => it.equipment_id !== eqId));
  };

  // Remove o equipamento do ambiente (membership). Colapsa a config também.
  // PMOC: remover do ambiente = sair do contrato (todo equipamento vive num env).
  // Comum: remover do ambiente = volta pro grupo "Sem ambiente" (NÃO sai do
  // contrato). Preserva os campos snapshot do item (nome/descrição/template).
  const removeEquipmentFromEnv = (envKey: string, eqId: string) => {
    if (!isPmoc) {
      // Snapshot do item: usa o que já existia em contract_items se houver, senão
      // deriva do equipamento (mesma regra do derivedItems).
      const existing = (contract.contract_items || []).find((it: any) => it.equipment_id === eqId);
      const eq = equipmentById.get(eqId);
      const snapshot: LooseItem = {
        equipment_id: eqId,
        item_name: existing?.item_name ?? eq?.name ?? 'Equipamento',
        item_description:
          existing?.item_description ?? ([eq?.brand, eq?.model].filter(Boolean).join(' - ') || null),
        form_template_id: existing?.form_template_id ?? null,
      };
      setLooseItems((prev) => (prev.some((it) => it.equipment_id === eqId) ? prev : [...prev, snapshot]));
    }
    setEnvs((prev) =>
      prev.map((e) => (e.key === envKey ? { ...e, equipment_ids: e.equipment_ids.filter((id) => id !== eqId) } : e)),
    );
    setExpandedEqIds((prev) => {
      if (!prev.has(eqId)) return prev;
      const next = new Set(prev);
      next.delete(eqId);
      return next;
    });
    setRemovingMember(null);
  };

  // Remove DE VEZ do contrato (lixeira com confirmação). Tira do grupo "Sem
  // ambiente" — o item deixa de entrar no payload e o diff de itens o apaga.
  // Identifica pela chave estável (eq:<id> | manual:<nome>) pra remover também
  // item MANUAL (sem equipment_id).
  const removeLooseItem = (key: string) => {
    setLooseItems((prev) => prev.filter((it) => looseItemKey(it) !== key));
    setRemovingMember(null);
  };

  // Expande/colapsa a config por máquina. SEPARADO da membership.
  const toggleExpanded = (eqId: string) => {
    setExpandedEqIds((prev) => {
      const next = new Set(prev);
      if (next.has(eqId)) next.delete(eqId);
      else next.add(eqId);
      return next;
    });
  };

  // ---- Rotina por máquina (mesmos handlers do form) -------------------------
  const setMachineScope = (eqId: string, scope: PmocMachineScope) => {
    setMachineConfigs((prev) => {
      const cur = prev[eqId];
      if (!cur) return prev;
      const acts = machineCatalogActivities(catalogActivities, scope).map((a) => ({
        ...catalogToPlanRow(a),
        applies_per_equipment: true,
        equipment_ref: eqId,
      }));
      return { ...prev, [eqId]: { ...cur, scope, activities: acts, customized: false } };
    });
  };
  const setMachineStartVisit = (eqId: string, startVisit: number) => {
    setMachineConfigs((prev) => {
      const cur = prev[eqId];
      if (!cur) return prev;
      return { ...prev, [eqId]: { ...cur, startVisit } };
    });
  };

  // Picker do catálogo POR MÁQUINA: abre já marcado com a listagem atual; ao
  // confirmar, a seleção SUBSTITUI a listagem daquela máquina (personaliza).
  const openMachinePicker = (eqId: string) => {
    setPickerMachineEqId(eqId);
    const cfg = machineConfigs[eqId];
    setPickerMachineScope(cfg?.scope ?? 'ac');
    const current = new Set((cfg?.activities ?? []).map((a) => a.catalog_activity_id).filter(Boolean) as string[]);
    setPickerSelection(current);
    setPickerTemplateSelection(new Set(cfg?.customTemplateIds ?? []));
    setShowCatalogPicker(true);
  };
  const confirmCatalogPicker = () => {
    if (!pickerMachineEqId) { setShowCatalogPicker(false); return; }
    const eqId = pickerMachineEqId;
    const selected: PlanActivityRow[] = [];
    for (const group of catalogGroups) {
      for (const act of group.activities) {
        if (pickerSelection.has(act.id)) {
          selected.push({ ...catalogToPlanRow(act), applies_per_equipment: true, equipment_ref: eqId });
        }
      }
    }
    const templateIds = [...pickerTemplateSelection];
    setMachineConfigs((prev) => {
      const cur = prev[eqId];
      if (!cur) return prev;
      return { ...prev, [eqId]: { ...cur, activities: selected, customized: true, customTemplateIds: templateIds } };
    });
    toast({ title: `Checklists da máquina atualizados (${selected.length + templateIds.length} item(ns))` });
    setShowCatalogPicker(false);
    setPickerMachineEqId(null);
  };

  // ---- Picker de equipamentos do ambiente (membership) ----------------------
  const openMemberPicker = (envKey: string) => {
    setMemberPickerEnvKey(envKey);
    setMemberPickerSearch('');
    setMemberPickerSelection(new Set());
  };
  const toggleMemberPick = (eqId: string) => {
    setMemberPickerSelection((prev) => {
      const next = new Set(prev);
      if (next.has(eqId)) next.delete(eqId);
      else next.add(eqId);
      return next;
    });
  };
  // Adiciona um equipamento ao grupo virtual "Sem ambiente" (comum). Tira de
  // qualquer ambiente real (exclusividade) e materializa o snapshot do item.
  const addEquipmentAsLoose = (eqId: string) => {
    const existing = (contract.contract_items || []).find((it: any) => it.equipment_id === eqId);
    const eq = equipmentById.get(eqId);
    const snapshot: LooseItem = {
      equipment_id: eqId,
      item_name: existing?.item_name ?? eq?.name ?? 'Equipamento',
      item_description:
        existing?.item_description ?? ([eq?.brand, eq?.model].filter(Boolean).join(' - ') || null),
      form_template_id: existing?.form_template_id ?? null,
    };
    setEnvs((prev) => prev.map((e) => ({ ...e, equipment_ids: e.equipment_ids.filter((id) => id !== eqId) })));
    setLooseItems((prev) => (prev.some((it) => it.equipment_id === eqId) ? prev : [...prev, snapshot]));
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
  // Cria o equipamento do cliente e já o adiciona ao ambiente (ou ao grupo "Sem
  // ambiente") alvo do picker.
  const handleCreateEquipment = async (data: any) => {
    const created = await createEquipment.mutateAsync(data);
    setShowCreateEquipment(false);
    if (created?.id && memberPickerEnvKey) {
      if (memberPickerEnvKey === LOOSE_ENV_KEY) addEquipmentAsLoose(created.id);
      else addEquipmentToEnv(memberPickerEnvKey, created.id);
    }
  };

  // Quantas OSs futuras não-realizadas seriam refeitas (preview do diálogo).
  const futureRegenerable = useMemo(() => {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const todayStr = fmt.format(new Date());
    return ((contract.service_orders || []) as any[]).filter(
      (os) => REGENERABLE_OS_STATUSES.has(os.status ?? '') && (os.scheduled_date ?? '') >= todayStr,
    ).length;
  }, [contract.service_orders]);

  const isActive = contract.status === 'active';

  // Quantos equipamentos saem do contrato ao remover o ambiente em confirmação
  // (P2a): excluir o ambiente também remove seus equipamentos do contrato e das
  // próximas visitas. Usado pra alertar o gestor antes de confirmar.
  const removingEnvEquipCount = useMemo(
    () => (removingEnvKey ? (envs.find((e) => e.key === removingEnvKey)?.equipment_ids.length ?? 0) : 0),
    [removingEnvKey, envs],
  );

  // Equipamentos (contract_items) derivados dos ambientes — 1 por equipamento
  // atribuído. Espelha o pmocDerivedItems do form.
  const derivedItems = useMemo<MachineItemRef[]>(() => {
    const seen = new Set<string>();
    const out: MachineItemRef[] = [];
    for (const env of envs) {
      for (const eqId of env.equipment_ids) {
        if (seen.has(eqId)) continue;
        seen.add(eqId);
        const eq = activeEquipment.find((e: any) => e.id === eqId) || equipment.find((e: any) => e.id === eqId);
        if (eq) {
          out.push({
            equipment_id: eq.id,
            item_name: eq.name,
            item_description: [eq.brand, eq.model].filter(Boolean).join(' - ') || null,
          });
          continue;
        }
        // FIX A — equipamento não resolvido (inativo ou ainda não carregado pela
        // query de equipamentos). NUNCA descartar: o diff de itens do backend
        // apagaria esse contract_item (perda de dado) mesmo o usuário não tendo
        // mexido nele. Caímos no snapshot persistido do próprio contrato (mesmo
        // equipment_id) e reusamos item_name/item_description gravados, de modo
        // que a chave `eq:<id>` sobreviva ao diff intacta.
        const snap = (contract.contract_items || []).find(
          (it: any) => it.equipment_id === eqId,
        );
        out.push({
          equipment_id: eqId,
          item_name: snap?.item_name ?? 'Equipamento',
          item_description: snap?.item_description ?? null,
        });
      }
    }
    return out;
  }, [envs, activeEquipment, equipment, contract.contract_items]);

  // Monta o payload do mesmo jeito que o form: itens com escopo/fase + plano por
  // máquina (+ bucket local), ambientes. Tudo via builders compartilhados.
  const buildPayload = () => {
    const environments = envs.map((e) => ({
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

    // Contrato não-PMOC: comportamento leve antigo (só itens básicos + ambientes,
    // sem escopo/plano por máquina). O conjunto de itens = (equipamentos dos
    // ambientes) + (itens do grupo "Sem ambiente", environment_id NULL). Os soltos
    // PRECISAM ir no payload, senão o diff de itens os apagaria; o backend religa
    // o environment_id pelos equipment_ids dos ambientes (quem não está em nenhum
    // ambiente fica NULL automaticamente).
    if (!isPmoc) {
      // Cada item COM equipamento carrega o checklist por equipamento
      // (form_template_ids + form_template_id compat + exclusões da 1ª OS). O diff
      // do hook só toca esses campos quando vêm definidos (undefined = preserva).
      const envItems = derivedItems.map((i) => {
        const ck = commonChecklistPayload(i.equipment_id);
        return {
          equipment_id: i.equipment_id,
          item_name: i.item_name,
          item_description: i.item_description,
          form_template_ids: ck.form_template_ids,
          form_template_id: ck.form_template_id,
          first_os_excluded_questions: ck.first_os_excluded_questions,
        };
      });
      // Soltos que NÃO foram movidos pra um ambiente (evita duplicar chave). Itens
      // MANUAIS (equipment_id NULL) sempre passam — `inEnv.has(null)` é false — e
      // vão com equipment_id NULL + item_name/item_description preservados, pra que
      // o diff de itens do backend (chave manual:<nome>) os mantenha. Item COM
      // equipamento usa a LISTA de checklists; manual mantém o form_template_id do
      // snapshot (não tem editor por equipamento).
      const inEnv = new Set(envs.flatMap((e) => e.equipment_ids));
      const looseItemsPayload = looseItems
        .filter((it) => !(it.equipment_id && inEnv.has(it.equipment_id)))
        .map((it) => {
          const ck = commonChecklistPayload(it.equipment_id);
          return {
            equipment_id: it.equipment_id,
            item_name: it.item_name,
            item_description: it.item_description,
            form_template_ids: it.equipment_id ? ck.form_template_ids : [],
            form_template_id: it.equipment_id ? ck.form_template_id : it.form_template_id,
            first_os_excluded_questions: it.equipment_id ? ck.first_os_excluded_questions : undefined,
          };
        });
      const items = [...envItems, ...looseItemsPayload];
      return { items, environments, plan_activities: undefined as any };
    }

    const items = buildPmocItemsWithScope({ items: derivedItems, machineConfigs });
    const planRows = buildPmocPlanFromMachines({ items: derivedItems, machineConfigs, catalogActivities, templateNameById });
    const plan_activities = planRows.map(planRowToInput);
    return { items, environments, plan_activities };
  };

  const applySave = async () => {
    setShowRegenConfirm(false);
    setSaving(true);
    try {
      const { items, environments, plan_activities } = buildPayload();
      // MESMO code path do formulário: updateContract persiste itens (com escopo/
      // fase), plano por máquina (resolve contract_item_id via equipment_ref) e
      // regenera as visitas futuras preservando passadas/em-andamento/concluídas.
      await updateContract.mutateAsync({
        id: contract.id,
        items,
        environments,
        ...(isPmoc ? { plan_activities } : {}),
      });
      // Recarrega o snapshot da rotina (evita "dirty" após salvar). A query do
      // plano/contrato é invalidada pelo hook; o efeito de reconstrução roda de novo.
      setMachineConfigsLoaded(false);
      // Idem pro checklist por equipamento (comum): re-reconstrói do contrato salvo.
      setCommonChecklistsLoaded(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!dirty) return;
    if (isActive && scheduleChanged && futureRegenerable > 0) {
      setRegenCount(futureRegenerable);
      setShowRegenConfirm(true);
      return;
    }
    void applySave();
  };

  const handleReset = () => {
    setEnvs(initialEnvs);
    setMachineConfigs(initialMachineConfigs);
    setLooseItems(initialLooseItems);
    setCommonChecklists(initialCommonChecklists);
  };

  // Ambiente atualmente em detalhe (null = lista).
  const selectedEnv = useMemo(
    () => (selectedEnvKey ? envs.find((e) => e.key === selectedEnvKey) ?? null : null),
    [selectedEnvKey, envs],
  );
  const selectedEnvIdx = useMemo(
    () => (selectedEnvKey ? envs.findIndex((e) => e.key === selectedEnvKey) : -1),
    [selectedEnvKey, envs],
  );
  // Grupo virtual "Sem ambiente" em detalhe (só comum).
  const isLooseSelected = !isPmoc && selectedEnvKey === LOOSE_ENV_KEY;

  // Esvaziou o grupo "Sem ambiente" (moveu/removeu o último item) → volta à lista.
  useEffect(() => {
    if (isLooseSelected && looseItems.length === 0) setSelectedEnvKey(null);
  }, [isLooseSelected, looseItems.length]);

  // Equipamentos do cliente ainda NÃO neste ambiente (ou não no grupo "Sem
  // ambiente"), filtrados pela busca.
  const pickerAvailable = useMemo(() => {
    if (!memberPickerEnvKey) return [];
    let inTarget: Set<string>;
    if (memberPickerEnvKey === LOOSE_ENV_KEY) {
      inTarget = new Set(looseItems.map((it) => it.equipment_id));
    } else {
      const env = envs.find((e) => e.key === memberPickerEnvKey);
      inTarget = new Set(env?.equipment_ids ?? []);
    }
    const q = memberPickerSearch.trim().toLowerCase();
    return activeEquipment.filter((eq: any) => {
      if (inTarget.has(eq.id)) return false;
      if (!q) return true;
      return (
        eq.name?.toLowerCase().includes(q) ||
        eq.brand?.toLowerCase().includes(q) ||
        eq.model?.toLowerCase().includes(q)
      );
    });
  }, [memberPickerEnvKey, envs, activeEquipment, memberPickerSearch]);

  // ---- Render: barra de dirty (compartilhada lista/detalhe) -----------------
  const dirtyBar = dirty && (
    <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        {scheduleChanged
          ? 'Alterações não salvas. Salvar recalcula as visitas futuras (realizadas e em andamento são preservadas).'
          : 'Alterações não salvas nos dados dos ambientes.'}
      </p>
      <div className="flex w-full gap-2 sm:w-auto">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 sm:flex-none min-h-11 sm:min-h-9 active:scale-[0.98] transition-transform rounded-xl"
          onClick={handleReset}
          disabled={saving}
        >
          Descartar
        </Button>
        <Button
          size="sm"
          className="flex-1 sm:flex-none min-h-11 sm:min-h-9 active:scale-[0.98] transition-transform rounded-xl"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
          Salvar alterações
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 min-w-0 w-full">
      {isLooseSelected ? (
        /* ============ DETALHE DO GRUPO "SEM AMBIENTE" (comum) ============ */
        <Card className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl lg:rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
          <CardHeader className="flex flex-col items-start gap-2 space-y-0">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 min-h-11 sm:min-h-9 active:scale-[0.98] transition-transform"
              onClick={() => setSelectedEnvKey(null)}
            >
              <ChevronLeft className="mr-1 h-4 w-4" /> Voltar aos ambientes
            </Button>
            <CardTitle className="flex min-w-0 items-center gap-2 text-base sm:text-lg">
              <Badge variant="outline" className="shrink-0">Sem ambiente</Badge>
              <span className="min-w-0 break-words">Equipamentos não atribuídos</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Equipamentos deste contrato que ainda não estão em nenhum ambiente. Adicione a um ambiente ou remova do contrato.
            </p>
            {dirty && (
              <span className="text-xs text-warning">Há alterações não salvas neste contrato.</span>
            )}
          </CardHeader>
          <CardContent className="min-w-0 space-y-4">
            {renderLooseEquipment()}
            {dirtyBar}
          </CardContent>
        </Card>
      ) : selectedEnv ? (
        /* ===================== DETALHE DO AMBIENTE ===================== */
        <Card className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl lg:rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
          <CardHeader className="flex flex-col items-start gap-2 space-y-0">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 min-h-11 sm:min-h-9 active:scale-[0.98] transition-transform"
              onClick={() => setSelectedEnvKey(null)}
            >
              <ChevronLeft className="mr-1 h-4 w-4" /> Voltar aos ambientes
            </Button>
            <div className="flex w-full items-center justify-between gap-2">
              <CardTitle className="flex min-w-0 items-center gap-2 text-base sm:text-lg">
                <Badge variant="info" className="shrink-0">Ambiente {selectedEnvIdx + 1}</Badge>
                <span className="min-w-0 break-words">
                  {selectedEnv.identificacao.trim() || 'Sem identificação'}
                </span>
              </CardTitle>
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
            {dirty && (
              <span className="text-xs text-warning">Há alterações não salvas neste contrato.</span>
            )}
          </CardHeader>
          <CardContent className="min-w-0 space-y-4">
            {renderEnvFields(selectedEnv, selectedEnvIdx)}
            {renderEnvEquipment(selectedEnv)}
            {dirtyBar}
          </CardContent>
        </Card>
      ) : (
        /* ===================== LISTA DE AMBIENTES ===================== */
        <Card className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl lg:rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
          <CardHeader className="flex flex-col items-start justify-between gap-2 space-y-0 sm:flex-row sm:items-center">
            <CardTitle className="flex min-w-0 items-center gap-2 text-base sm:text-lg">
              <ShieldCheck className="h-5 w-5 shrink-0 text-info" />
              <span className="min-w-0 break-words">
                {isPmoc ? 'Ambientes climatizados' : 'Ambientes'} ({envs.length})
              </span>
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="w-full sm:w-auto min-h-11 sm:min-h-9 active:scale-[0.98] transition-transform rounded-xl"
              onClick={addEnvironment}
            >
              <Plus className="mr-1 h-4 w-4" /> Adicionar ambiente
            </Button>
          </CardHeader>
          <CardContent className="min-w-0 space-y-4">
            {envs.length === 0 && looseItems.length === 0 ? (
              <EmptyState
                size="compact"
                icon={<ShieldCheck className="h-10 w-10" />}
                title="Nenhum ambiente cadastrado"
                description={
                  isPmoc
                    ? 'Cadastre os ambientes climatizados deste contrato.'
                    : 'Organize os equipamentos deste contrato em ambientes.'
                }
                action={{ label: 'Adicionar ambiente', onClick: addEnvironment }}
              />
            ) : (
              <div className="space-y-2">
                {envs.map((env, idx) => (
                  <button
                    key={env.key}
                    type="button"
                    onClick={() => setSelectedEnvKey(env.key)}
                    className="flex w-full min-h-16 items-center gap-3 rounded-2xl border-2 bg-card p-3 text-left shadow-sm transition-colors hover:bg-muted/40 active:scale-[0.99]"
                  >
                    {env.photo_url ? (
                      <img
                        src={env.photo_url}
                        alt={env.identificacao.trim() || `Ambiente ${idx + 1}`}
                        className="h-12 w-12 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                        <ShieldCheck className="h-6 w-6" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="info" className="shrink-0">Ambiente {idx + 1}</Badge>
                        <span className="truncate text-sm font-semibold">
                          {env.identificacao.trim() || 'Sem identificação'}
                        </span>
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

                {/* Grupo virtual "Sem ambiente" (só comum). Equipamentos soltos
                    dos contratos antigos (environment_id NULL). Clicável, abre o
                    detalhe; NÃO é um registro de contract_environments. */}
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

                <p className="pt-1 text-xs text-muted-foreground">
                  {totalEquipment} equipamento(s) no total entram neste contrato.
                </p>
              </div>
            )}

            {dirtyBar}
          </CardContent>
        </Card>
      )}

      {/* Picker do catálogo PMOC por máquina (drawer no mobile, dialog no desktop). */}
      <ResponsiveModal
        open={showCatalogPicker}
        onOpenChange={(v) => { setShowCatalogPicker(v); if (!v) { setPickerMachineEqId(null); setPickerMachineScope(null); } }}
        title="Checklists da Máquina"
        footer={
          <div className="flex flex-row items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{pickerSelection.size + pickerTemplateSelection.size} selecionada(s)</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setShowCatalogPicker(false); setPickerMachineEqId(null); setPickerMachineScope(null); }}>Cancelar</Button>
              <Button onClick={confirmCatalogPicker}>Aplicar à máquina</Button>
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
          customTemplates={customTemplateOptions}
          selectedTemplateIds={pickerTemplateSelection}
          onChangeTemplates={setPickerTemplateSelection}
        />
      </ResponsiveModal>

      {/* Picker de equipamentos do cliente pro ambiente (multi-seleção + busca). */}
      <ResponsiveModal
        open={!!memberPickerEnvKey}
        onOpenChange={(v) => { if (!v) setMemberPickerEnvKey(null); }}
        title={memberPickerEnvKey === LOOSE_ENV_KEY ? 'Adicionar equipamento ao contrato' : 'Adicionar equipamento ao ambiente'}
      >
        <div className="space-y-3 p-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar equipamento do cliente..."
              value={memberPickerSearch}
              onChange={(e) => setMemberPickerSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          <Button
            variant="outline"
            className="w-full min-h-11 active:scale-[0.98] transition-transform rounded-xl"
            onClick={() => setShowCreateEquipment(true)}
          >
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
                title={
                  activeEquipment.length === 0
                    ? 'Cliente sem equipamentos ativos'
                    : 'Todos já estão em algum ambiente'
                }
                description={
                  activeEquipment.length === 0
                    ? 'Crie um equipamento para adicioná-lo a este ambiente.'
                    : 'Os equipamentos do cliente já foram distribuídos nos ambientes.'
                }
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
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors min-h-11',
                      selected ? 'bg-primary/5' : 'hover:bg-muted/50',
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                        selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                      )}
                    >
                      {selected && <Check className="h-3.5 w-3.5" />}
                    </div>
                    <EquipmentAvatar photoUrl={eq.photo_url} name={eq.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{eq.name}</p>
                      {[eq.brand, eq.model].filter(Boolean).length > 0 && (
                        <p className="truncate text-xs text-muted-foreground">
                          {[eq.brand, eq.model].filter(Boolean).join(' - ')}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <Button
            className="w-full min-h-11 active:scale-[0.98] transition-transform rounded-xl"
            onClick={confirmMemberPicker}
            disabled={memberPickerSelection.size === 0}
          >
            <Plus className="mr-2 h-4 w-4" />
            Adicionar {memberPickerSelection.size > 0 ? `${memberPickerSelection.size} ` : ''}
            equipamento{memberPickerSelection.size !== 1 ? 's' : ''}
          </Button>
        </div>
      </ResponsiveModal>

      {/* Criar equipamento do cliente na hora (reusa o formulário oficial). */}
      <EquipmentFormDialog
        open={showCreateEquipment}
        onOpenChange={setShowCreateEquipment}
        onSubmit={handleCreateEquipment}
        customers={contractCustomer}
        categories={categories}
        isLoading={createEquipment.isPending}
      />

      {/* Confirmação de remoção de ambiente. Excluir o ambiente também remove os
          equipamentos dele do contrato e das próximas visitas (P2a). */}
      <AlertDialog open={!!removingEnvKey} onOpenChange={(open) => { if (!open) setRemovingEnvKey(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover ambiente?</AlertDialogTitle>
            <AlertDialogDescription>
              {removingEnvEquipCount > 0
                ? `Os ${removingEnvEquipCount} equipamento(s) deste ambiente serão removidos do contrato e das próximas visitas. Visitas já realizadas e em andamento são preservadas. A mudança só é aplicada ao salvar. Continuar?`
                : 'O ambiente sairá do contrato. A mudança só é aplicada ao salvar.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (removingEnvKey) removeEnvironment(removingEnvKey); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de remover equipamento. mode 'env' tira do ambiente (no comum
          volta pro grupo "Sem ambiente", não sai do contrato; no PMOC sai do
          contrato). mode 'loose' tira de vez do contrato. */}
      <AlertDialog open={!!removingMember} onOpenChange={(open) => { if (!open) setRemovingMember(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removingMember?.mode === 'loose'
                ? 'Remover equipamento do contrato?'
                : !isPmoc
                  ? 'Tirar equipamento do ambiente?'
                  : 'Remover equipamento do ambiente?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{removingMember ? (removingMember.label ?? (removingMember.eqId ? equipmentById.get(removingMember.eqId)?.name : null) ?? 'Equipamento') : ''}</strong>{' '}
              {removingMember?.mode === 'loose'
                ? 'sai do contrato. A mudança só é aplicada ao salvar — aí as visitas futuras são recalculadas sem esse equipamento.'
                : !isPmoc
                  ? 'volta para o grupo "Sem ambiente" (continua no contrato). A mudança só é aplicada ao salvar.'
                  : 'sai deste ambiente e do contrato. A mudança só é aplicada ao salvar — aí as visitas futuras são recalculadas sem esse equipamento.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!removingMember) return;
                if (removingMember.mode === 'loose') {
                  // Remove pela chave estável (cobre item manual sem eqId).
                  if (removingMember.looseKey) removeLooseItem(removingMember.looseKey);
                } else if (removingMember.envKey && removingMember.eqId) {
                  removeEquipmentFromEnv(removingMember.envKey, removingMember.eqId);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {removingMember?.mode === 'env' && !isPmoc ? 'Tirar do ambiente' : 'Remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de regeneração das visitas futuras. */}
      <AlertDialog open={showRegenConfirm} onOpenChange={setShowRegenConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recalcular visitas futuras?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Mudar os equipamentos ou a rotina (escopo, fase, checklists) vai{' '}
                  <strong>refazer {regenCount} visita(s) futura(s)</strong> ainda não realizadas, atualizando o checklist
                  por equipamento.
                </p>
                <p className="text-sm">
                  Visitas <strong>concluídas, em andamento</strong> e <strong>passadas</strong> são preservadas intactas.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={applySave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Salvar e recalcular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Calculadora de área (largura × comprimento → m²). */}
      <AreaCalculatorModal
        open={!!areaCalcEnvKey}
        onOpenChange={(v) => { if (!v) setAreaCalcEnvKey(null); }}
        onApply={(areaBR) => { if (areaCalcEnvKey) updateField(areaCalcEnvKey, 'area_climatizada_m2', areaBR); }}
      />

      {/* Calculadora de carga térmica (ferramenta da Área do Técnico → TR). */}
      <CargaTermicaCalculatorModal
        open={!!cargaCalcEnvKey}
        onOpenChange={(v) => { if (!v) setCargaCalcEnvKey(null); }}
        onApply={(trBR) => { if (cargaCalcEnvKey) updateField(cargaCalcEnvKey, 'carga_termica_tr', trBR); }}
      />

      {/* Viewer da foto do equipamento (ampliada). */}
      <ImagePreviewModal
        open={!!previewPhoto}
        src={previewPhoto?.src ?? ''}
        alt={previewPhoto?.alt}
        onClose={() => setPreviewPhoto(null)}
      />
    </div>
  );

  // ===================== render helpers (closures) =====================

  // Campos do ambiente. No PMOC: completo (refrigeração — área, carga térmica,
  // ocupantes). No comum: só os genéricos (identificação + tipo/uso + foto); os
  // campos de refrigeração ficam escondidos (mas continuam indo no payload como
  // estão — NULL/vazio — pra não perder dado nem divergir do save do PMOC).
  function renderEnvFields(env: EnvRow, idx: number) {
    return (
      <div className="space-y-3">
        <EnvironmentPhotoField
          value={env.photo_url}
          onChange={(url) => setEnvPhoto(env.key, url)}
          envLabel={env.identificacao.trim() || `Ambiente ${idx + 1}`}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Identificação do ambiente</Label>
            <Input value={env.identificacao} onChange={(e) => updateField(env.key, 'identificacao', e.target.value)} placeholder="Ex: 2º andar — Sala 201" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{isPmoc ? 'Tipo de atividade' : 'Tipo / uso do ambiente'}</Label>
            <Input value={env.tipo_atividade} onChange={(e) => updateField(env.key, 'tipo_atividade', e.target.value)} placeholder="Ex: Escritório administrativo" />
          </div>
          {isPmoc && (
          <>
          <div className="space-y-1.5">
            <Label className="text-xs">Área climatizada (m²)</Label>
            <div className="flex items-center gap-2">
              <NumericInput
                decimal
                value={env.area_climatizada_m2}
                onValueChange={(v) => updateField(env.key, 'area_climatizada_m2', v)}
                placeholder="Ex: 120,5"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 shrink-0 px-3"
                onClick={() => setAreaCalcEnvKey(env.key)}
              >
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
                    <NumericInput
                      decimal
                      value={env.carga_termica_tr}
                      onValueChange={(v) => updateField(env.key, 'carga_termica_tr', v)}
                      placeholder="Ex: 5,0"
                      className={showHint ? 'pr-24' : undefined}
                    />
                    {showHint && (
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 max-w-[40%] truncate text-xs text-muted-foreground">
                        = {(tr * 12000).toLocaleString('pt-BR')} BTUs
                      </span>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 shrink-0 px-3"
                    onClick={() => setCargaCalcEnvKey(env.key)}
                  >
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
            <NumericInput value={env.ocupantes_fixos} onValueChange={(v) => updateField(env.key, 'ocupantes_fixos', v)} placeholder="Ex: 12" />
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
            <NumericInput value={env.ocupantes_flutuantes} onValueChange={(v) => updateField(env.key, 'ocupantes_flutuantes', v)} placeholder="Ex: 30" />
          </div>
          </>
          )}
        </div>
      </div>
    );
  }

  // Equipamentos MEMBROS do ambiente: lista enxuta (só os que estão no ambiente),
  // cada um com chevron de config (PMOC) e botão remover.
  function renderEnvEquipment(env: EnvRow) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Wrench className="h-3.5 w-3.5 text-info" />
            Equipamentos deste ambiente ({env.equipment_ids.length})
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-9 active:scale-[0.98] transition-transform rounded-xl"
            onClick={() => openMemberPicker(env.key)}
          >
            <Plus className="mr-1 h-4 w-4" /> Adicionar equipamento
          </Button>
        </div>

        {env.equipment_ids.length === 0 ? (
          <EmptyState
            size="compact"
            icon={<Wrench className="h-10 w-10" />}
            title="Nenhum equipamento neste ambiente"
            description="Adicione um equipamento do cliente a este ambiente."
            action={{ label: 'Adicionar equipamento', onClick: () => openMemberPicker(env.key) }}
          />
        ) : (
          <div className="divide-y overflow-hidden rounded-lg border bg-muted/20">
            {env.equipment_ids.map((eqId) => {
              const eq = equipmentById.get(eqId);
              const cfg = machineConfigs[eqId];
              const expanded = expandedEqIds.has(eqId);
              // Comum: expansão do editor de checklist por equipamento.
              const checklistExpanded = expandedChecklistEqIds.has(eqId);
              const checklistCount = getCommonChecklist(eqId).formTemplateIds.length;
              const name = eq?.name ?? 'Equipamento';
              return (
                <div key={eqId}>
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    {/* Chevron de expansão. PMOC: config por máquina. Comum: editor
                        de checklist por equipamento. */}
                    {isPmoc ? (
                      <button
                        type="button"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60"
                        onClick={() => toggleExpanded(eqId)}
                        aria-label={expanded ? 'Recolher configuração' : 'Expandir configuração'}
                        aria-expanded={expanded}
                      >
                        <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60"
                        onClick={() => toggleChecklistExpanded(eqId)}
                        aria-label={checklistExpanded ? 'Recolher checklists' : 'Expandir checklists'}
                        aria-expanded={checklistExpanded}
                      >
                        <ChevronDown className={cn('h-4 w-4 transition-transform', checklistExpanded && 'rotate-180')} />
                      </button>
                    )}
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
                    {!isPmoc && (
                      <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                        {checklistCount} checklist{checklistCount === 1 ? '' : 's'}
                      </Badge>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-destructive active:scale-90 transition-transform rounded-xl"
                      title={isPmoc ? 'Remover do ambiente' : 'Tirar do ambiente'}
                      aria-label={isPmoc ? 'Remover do ambiente' : 'Tirar do ambiente'}
                      onClick={() => setRemovingMember({ mode: 'env', envKey: env.key, eqId })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Checklist por equipamento (contrato COMUM) — paridade com o
                      formulário. Dentro do chevron expansível (fechado por padrão).
                      Escolhe os checklists do equipamento + marca "Adicionar na 1ª
                      OS" por pergunta. */}
                  {!isPmoc && checklistExpanded && (
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

                  {/* Rotina POR MÁQUINA (Fase 5) — paridade com o formulário. Só PMOC
                      e dentro do chevron expansível (fechado por padrão). Escopo +
                      começa-na-visita + checklists do catálogo. */}
                  {isPmoc && expanded && (
                    <div className="space-y-2.5 bg-muted/30 px-3 pb-3 pt-1">
                      {/* 1) Escopo da norma */}
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

                      {/* 2) Começa na visita + Checklists (lado a lado; empilha no mobile) */}
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
                          <Select
                            value={String(cfg?.startVisit ?? 12)}
                            onValueChange={(v) => setMachineStartVisit(eqId, Number(v))}
                          >
                            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {START_VISIT_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={String(o.value)} className="text-xs">{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 w-full text-xs sm:w-auto"
                          disabled={catalogLoading}
                          onClick={() => openMachinePicker(eqId)}
                        >
                          <ShieldCheck className="h-3.5 w-3.5 mr-1.5 text-info" />
                          Checklists da Máquina
                        </Button>
                      </div>

                      {/* Resumo dos checklists da máquina */}
                      <span className="block text-[11px] text-muted-foreground">
                        {cfg ? `${cfg.activities.length} checklist(s)` : '—'}
                        {cfg?.customized && <span className="ml-1 text-info">· personalizado</span>}
                      </span>

                      {/* Preview: em que visita começa e o que inclui */}
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Equipamentos do grupo virtual "Sem ambiente" (só comum). Mesma UI de membro
  // (foto/nome/marca-modelo). Lixeira = remover DO CONTRATO (mode 'loose'). Botão
  // "Adicionar a um ambiente" move o item pra um ambiente real.
  function renderLooseEquipment() {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Wrench className="h-3.5 w-3.5 text-info" />
            Equipamentos sem ambiente ({looseItems.length})
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-9 active:scale-[0.98] transition-transform rounded-xl"
            onClick={() => openMemberPicker(LOOSE_ENV_KEY)}
          >
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
            {looseItems.map((it) => {
              const eqId = it.equipment_id;
              // Item manual (eqId NULL) → sem equipamento; cai no fallback Wrench
              // do EquipmentAvatar e exibe item_name/item_description. Item com
              // equipamento → resolve foto/marca/modelo pelo cadastro.
              const eq = eqId ? equipmentById.get(eqId) : undefined;
              const key = looseItemKey(it);
              const name = eq?.name ?? it.item_name ?? 'Equipamento';
              const subtitle = [eq?.brand, eq?.model].filter(Boolean).join(' - ') || it.item_description;
              // Item COM equipamento ganha o editor de checklist (manual não tem).
              const checklistExpanded = !!eqId && expandedChecklistEqIds.has(eqId);
              const checklistCount = eqId ? getCommonChecklist(eqId).formTemplateIds.length : 0;
              return (
                <div key={key}>
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    {/* Chevron do editor de checklist (só item com equipamento). */}
                    {eqId ? (
                      <button
                        type="button"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60"
                        onClick={() => toggleChecklistExpanded(eqId)}
                        aria-label={checklistExpanded ? 'Recolher checklists' : 'Expandir checklists'}
                        aria-expanded={checklistExpanded}
                      >
                        <ChevronDown className={cn('h-4 w-4 transition-transform', checklistExpanded && 'rotate-180')} />
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
                      {subtitle && (
                        <p className="truncate text-xs text-muted-foreground">
                          {subtitle}
                          {eq?.location && <span className="text-muted-foreground"> • {eq.location}</span>}
                        </p>
                      )}
                    </div>
                    {eqId && (
                      <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                        {checklistCount} checklist{checklistCount === 1 ? '' : 's'}
                      </Badge>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-destructive active:scale-90 transition-transform rounded-xl"
                      title="Remover do contrato"
                      aria-label="Remover do contrato"
                      onClick={() => setRemovingMember({ mode: 'loose', eqId, looseKey: key, label: name })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {eqId && checklistExpanded && (
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
      </div>
    );
  }
}

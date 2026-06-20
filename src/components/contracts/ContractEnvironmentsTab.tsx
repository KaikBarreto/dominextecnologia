import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Plus, Check, Trash2, Loader2, Wrench, HelpCircle, CalendarCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { PmocChecklistPicker } from '@/components/contracts/PmocChecklistPicker';
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
import {
  useContracts,
  useContractPlanActivities,
  REGENERABLE_OS_STATUSES,
  type Contract,
} from '@/hooks/useContracts';
import { usePmocActivityCatalog } from '@/hooks/usePmocActivityCatalog';
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
    equipment_ids: [],
  };
}

/**
 * Aba "Ambientes" da tela de detalhe (contrato PMOC). CRUD dos ambientes
 * climatizados + atribuição de equipamentos por ambiente (exclusivo entre
 * ambientes) + a ROTINA POR MÁQUINA (escopo da norma + começa-na-visita +
 * checklists do catálogo PMOC), com paridade total ao formulário de contrato.
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
  const { equipment } = useEquipment(contract.customer_id || undefined);
  const activeEquipment = useMemo(() => equipment.filter((eq: any) => eq.status === 'active'), [equipment]);
  const { data: existingPlan } = useContractPlanActivities(contract.id);
  const { activities: catalogActivities, groups: catalogGroups, isLoading: catalogLoading } = usePmocActivityCatalog();

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
        equipment_ids: items
          .filter((it) => it.environment_id === e.id && it.equipment_id)
          .map((it) => it.equipment_id as string),
      }));
  }, [contract.contract_environments, contract.contract_items]);

  const [envs, setEnvs] = useState<EnvRow[]>(initialEnvs);
  const [removingEnvKey, setRemovingEnvKey] = useState<string | null>(null);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [regenCount, setRegenCount] = useState(0);
  const [saving, setSaving] = useState(false);

  // Rotina POR MÁQUINA (Fase 5). Chave = equipment_id. Reconstruída do que está
  // persistido (contract_items + contract_plan_activities) pela MESMA fonte única
  // usada pelo formulário; auto-sincada com os equipamentos dos ambientes.
  const [machineConfigs, setMachineConfigs] = useState<Record<string, MachineConfig>>({});
  // Snapshot da reconstrução inicial — base pra detectar mudança de rotina.
  const [initialMachineConfigs, setInitialMachineConfigs] = useState<Record<string, MachineConfig>>({});
  const [machineConfigsLoaded, setMachineConfigsLoaded] = useState(false);

  // Picker do catálogo PMOC POR MÁQUINA. `pickerMachineEqId` = equipamento alvo;
  // ao confirmar, a seleção SUBSTITUI a listagem daquela máquina.
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);
  const [pickerMachineEqId, setPickerMachineEqId] = useState<string | null>(null);
  const [pickerMachineScope, setPickerMachineScope] = useState<PmocMachineScope | null>(null);
  const [pickerSelection, setPickerSelection] = useState<Set<string>>(new Set());

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

  const envsDirty = sigOf(initialEnvs) !== sigOf(envs);
  const machineDirty = machineConfigsLoaded && machineSigOf(initialMachineConfigs) !== machineSigOf(machineConfigs);
  const dirty = envsDirty || machineDirty;

  // O cronograma muda quando o conjunto de equipamentos OU a rotina por máquina
  // (escopo/fase/checklists) muda — ambos re-expandem as visitas futuras.
  const equipmentSetChanged = useMemo(() => {
    const flat = (rows: EnvRow[]) => [...new Set(rows.flatMap((e) => e.equipment_ids))].sort().join(',');
    return flat(initialEnvs) !== flat(envs);
  }, [initialEnvs, envs]);
  const scheduleChanged = equipmentSetChanged || machineDirty;

  const totalEquipment = useMemo(
    () => new Set(envs.flatMap((e) => e.equipment_ids)).size,
    [envs],
  );

  const addEnvironment = () => setEnvs((prev) => [...prev, newEnvRow()]);
  const removeEnvironment = (key: string) => {
    setEnvs((prev) => prev.filter((e) => e.key !== key));
    setRemovingEnvKey(null);
  };
  const updateField = (key: string, field: keyof EnvRow, value: string) =>
    setEnvs((prev) => prev.map((e) => (e.key === key ? { ...e, [field]: value } : e)));

  const toggleEquipment = (envKey: string, eqId: string) => {
    setEnvs((prev) =>
      prev.map((e) => {
        if (e.key === envKey) {
          const has = e.equipment_ids.includes(eqId);
          return {
            ...e,
            equipment_ids: has ? e.equipment_ids.filter((id) => id !== eqId) : [...e.equipment_ids, eqId],
          };
        }
        // Tira de outros ambientes quando passa a pertencer a este.
        const targetHad = prev.find((x) => x.key === envKey)?.equipment_ids.includes(eqId);
        if (!targetHad) return { ...e, equipment_ids: e.equipment_ids.filter((id) => id !== eqId) };
        return e;
      }),
    );
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
    setMachineConfigs((prev) => {
      const cur = prev[eqId];
      if (!cur) return prev;
      return { ...prev, [eqId]: { ...cur, activities: selected, customized: true } };
    });
    toast({ title: `Checklists da máquina atualizados (${selected.length} item(ns))` });
    setShowCatalogPicker(false);
    setPickerMachineEqId(null);
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
        if (!eq) continue;
        out.push({
          equipment_id: eq.id,
          item_name: eq.name,
          item_description: [eq.brand, eq.model].filter(Boolean).join(' - ') || null,
        });
      }
    }
    return out;
  }, [envs, activeEquipment, equipment]);

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
      equipment_ids: e.equipment_ids,
    }));

    // Contrato não-PMOC: comportamento leve antigo (só itens básicos + ambientes,
    // sem escopo/plano por máquina).
    if (!isPmoc) {
      const items = derivedItems.map((i) => ({
        equipment_id: i.equipment_id,
        item_name: i.item_name,
        item_description: i.item_description,
      }));
      return { items, environments, plan_activities: undefined as any };
    }

    const items = buildPmocItemsWithScope({ items: derivedItems, machineConfigs });
    const planRows = buildPmocPlanFromMachines({ items: derivedItems, machineConfigs, catalogActivities });
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
  };

  return (
    <div className="space-y-6 min-w-0 w-full">
      <Card className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl lg:rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
        <CardHeader className="flex flex-col items-start justify-between gap-2 space-y-0 sm:flex-row sm:items-center">
          <CardTitle className="flex min-w-0 items-center gap-2 text-base sm:text-lg">
            <ShieldCheck className="h-5 w-5 shrink-0 text-info" />
            <span className="min-w-0 break-words">Ambientes climatizados ({envs.length})</span>
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
          {envs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <ShieldCheck className="h-7 w-7" aria-hidden="true" />
              </div>
              <p className="text-sm text-muted-foreground">Nenhum ambiente cadastrado neste contrato.</p>
              <Button
                size="sm"
                variant="outline"
                className="min-h-11 active:scale-[0.98] transition-transform rounded-xl"
                onClick={addEnvironment}
              >
                <Plus className="mr-1 h-4 w-4" /> Adicionar ambiente
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {envs.map((env, idx) => (
                <div key={env.key} className="rounded-xl border p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant="info" className="shrink-0">Ambiente {idx + 1}</Badge>
                      <span className="truncate text-sm font-medium">
                        {env.identificacao.trim() || 'Sem identificação'}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive active:scale-90 transition-transform rounded-xl"
                      onClick={() => setRemovingEnvKey(env.key)}
                      aria-label="Remover ambiente"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Identificação do ambiente</Label>
                      <Input value={env.identificacao} onChange={(e) => updateField(env.key, 'identificacao', e.target.value)} placeholder="Ex: 2º andar — Sala 201" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Tipo de atividade</Label>
                      <Input value={env.tipo_atividade} onChange={(e) => updateField(env.key, 'tipo_atividade', e.target.value)} placeholder="Ex: Escritório administrativo" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Área climatizada (m²)</Label>
                      <Input inputMode="decimal" value={env.area_climatizada_m2} onChange={(e) => updateField(env.key, 'area_climatizada_m2', e.target.value)} placeholder="Ex: 120,5" />
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
                      <Input inputMode="decimal" value={env.carga_termica_tr} onChange={(e) => updateField(env.key, 'carga_termica_tr', e.target.value)} placeholder="Ex: 5,0" />
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
                      <Input inputMode="numeric" value={env.ocupantes_fixos} onChange={(e) => updateField(env.key, 'ocupantes_fixos', e.target.value)} placeholder="Ex: 12" />
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
                      <Input inputMode="numeric" value={env.ocupantes_flutuantes} onChange={(e) => updateField(env.key, 'ocupantes_flutuantes', e.target.value)} placeholder="Ex: 30" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-xs">
                      <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                      Equipamentos deste ambiente ({env.equipment_ids.length})
                    </Label>
                    {activeEquipment.length === 0 ? (
                      <p className="text-xs text-muted-foreground">O cliente não tem equipamentos ativos cadastrados.</p>
                    ) : (
                      <div className="max-h-96 divide-y overflow-y-auto rounded-md border">
                        {activeEquipment.map((eq: any) => {
                          const checked = env.equipment_ids.includes(eq.id);
                          const ownerKey = equipmentOwnerEnvKey.get(eq.id);
                          const ownedByOther = !checked && ownerKey && ownerKey !== env.key;
                          const cfg = machineConfigs[eq.id];
                          return (
                            <div key={eq.id} className={cn(ownedByOther && 'opacity-50')}>
                              <label
                                className={cn(
                                  'flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors',
                                  !ownedByOther && 'hover:bg-muted/50',
                                )}
                              >
                                <input
                                  type="checkbox"
                                  className="rounded border-border"
                                  checked={checked}
                                  onChange={() => toggleEquipment(env.key, eq.id)}
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium">{eq.name}</p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {[eq.brand, eq.model].filter(Boolean).join(' - ')}
                                    {ownedByOther && ' · já em outro ambiente'}
                                  </p>
                                </div>
                              </label>

                              {/* Rotina POR MÁQUINA (Fase 5) — paridade com o formulário.
                                  Só PMOC e só quando o equipamento está marcado. Escopo +
                                  começa-na-visita + checklists do catálogo. */}
                              {isPmoc && checked && (
                                <div className="px-3 pb-3 pt-1 space-y-2.5 bg-muted/20">
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
                                      onChange={(v) => setMachineScope(eq.id, v as PmocMachineScope)}
                                      off={{ value: 'ac', label: 'Só ar-condicionado' }}
                                      on={{ value: 'full', label: 'Grande Porte (VRF/Chiller…)' }}
                                      size="default"
                                      className="[&_button]:text-xs"
                                      aria-label="Escopo da norma da máquina"
                                    />
                                  </div>

                                  {/* 2) Começa na visita */}
                                  <div className="flex flex-col gap-1.5">
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
                                      onValueChange={(v) => setMachineStartVisit(eq.id, Number(v))}
                                    >
                                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        {START_VISIT_OPTIONS.map((o) => (
                                          <SelectItem key={o.value} value={String(o.value)} className="text-xs">{o.label}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  {/* 3) Checklists da máquina */}
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] text-muted-foreground">
                                      {cfg ? `${cfg.activities.length} checklist(s)` : '—'}
                                      {cfg?.customized && <span className="ml-1 text-info">· personalizado</span>}
                                    </span>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-8 text-xs"
                                      disabled={catalogLoading}
                                      onClick={() => openMachinePicker(eq.id)}
                                    >
                                      <ShieldCheck className="h-3.5 w-3.5 mr-1.5 text-info" />
                                      Checklists do catálogo PMOC
                                    </Button>
                                  </div>

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
                </div>
              ))}

              <p className="text-xs text-muted-foreground">
                {totalEquipment} equipamento(s) no total entram neste contrato.
              </p>
            </div>
          )}

          {/* Barra de salvar — só quando há mudança pendente. */}
          {dirty && (
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
          )}
        </CardContent>
      </Card>

      {/* Picker do catálogo PMOC por máquina (drawer no mobile, dialog no desktop). */}
      <ResponsiveModal
        open={showCatalogPicker}
        onOpenChange={(v) => { setShowCatalogPicker(v); if (!v) { setPickerMachineEqId(null); setPickerMachineScope(null); } }}
        title="Checklists da máquina (catálogo PMOC)"
        footer={
          <div className="flex flex-row items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{pickerSelection.size} selecionada(s)</span>
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
        />
      </ResponsiveModal>

      {/* Confirmação de remoção de ambiente. */}
      <AlertDialog open={!!removingEnvKey} onOpenChange={(open) => { if (!open) setRemovingEnvKey(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover ambiente?</AlertDialogTitle>
            <AlertDialogDescription>
              O ambiente sairá do contrato. Os equipamentos dele ficam sem ambiente (não são excluídos). A mudança só é
              aplicada ao salvar.
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
    </div>
  );
}

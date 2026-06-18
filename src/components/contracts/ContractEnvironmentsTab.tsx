import { useMemo, useState } from 'react';
import { ShieldCheck, Plus, Check, Trash2, Loader2, Wrench } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { useContracts, REGENERABLE_OS_STATUSES, type Contract } from '@/hooks/useContracts';
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
 * ambientes). Ao salvar, dispara `updateContractEnvironments` (diff de itens +
 * sync de ambientes + regeneração de visitas futuras quando o conjunto de
 * equipamentos muda) — nunca toca a linha do contrato. Mudança que refaz visitas
 * futuras passa pelo diálogo de confirmação.
 */
export function ContractEnvironmentsTab({ contract }: ContractEnvironmentsTabProps) {
  const { toast } = useToast();
  const { updateContractEnvironments } = useContracts();
  const { equipment } = useEquipment(contract.customer_id || undefined);
  const activeEquipment = useMemo(() => equipment.filter((eq: any) => eq.status === 'active'), [equipment]);

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
  const dirty = sigOf(initialEnvs) !== sigOf(envs);

  // Conjunto de equipamentos mudou? (só ele dispara regeneração de visitas)
  const equipmentSetChanged = useMemo(() => {
    const flat = (rows: EnvRow[]) => [...new Set(rows.flatMap((e) => e.equipment_ids))].sort().join(',');
    return flat(initialEnvs) !== flat(envs);
  }, [initialEnvs, envs]);

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

  const buildPayload = () => {
    const seen = new Set<string>();
    const items: { equipment_id: string; item_name: string; item_description?: string | null }[] = [];
    for (const env of envs) {
      for (const eqId of env.equipment_ids) {
        if (seen.has(eqId)) continue;
        seen.add(eqId);
        const eq = activeEquipment.find((e: any) => e.id === eqId) || equipment.find((e: any) => e.id === eqId);
        if (!eq) continue;
        items.push({
          equipment_id: eq.id,
          item_name: eq.name,
          item_description: [eq.brand, eq.model].filter(Boolean).join(' - ') || null,
        });
      }
    }
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
    return { items, environments };
  };

  const applySave = async () => {
    setShowRegenConfirm(false);
    setSaving(true);
    try {
      const { items, environments } = buildPayload();
      await updateContractEnvironments.mutateAsync({ id: contract.id, items, environments });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!dirty) return;
    // Só o conjunto de equipamentos refaz visitas — campos de ambiente não.
    if (isActive && equipmentSetChanged && futureRegenerable > 0) {
      setRegenCount(futureRegenerable);
      setShowRegenConfirm(true);
      return;
    }
    void applySave();
  };

  const handleReset = () => setEnvs(initialEnvs);

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
                      <Label className="text-xs">Carga térmica (TR)</Label>
                      <Input inputMode="decimal" value={env.carga_termica_tr} onChange={(e) => updateField(env.key, 'carga_termica_tr', e.target.value)} placeholder="Ex: 5,0" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Nº de ocupantes fixos</Label>
                      <Input inputMode="numeric" value={env.ocupantes_fixos} onChange={(e) => updateField(env.key, 'ocupantes_fixos', e.target.value)} placeholder="Ex: 12" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Nº de ocupantes flutuantes</Label>
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
                      <div className="max-h-44 divide-y overflow-y-auto rounded-md border">
                        {activeEquipment.map((eq: any) => {
                          const checked = env.equipment_ids.includes(eq.id);
                          const ownerKey = equipmentOwnerEnvKey.get(eq.id);
                          const ownedByOther = !checked && ownerKey && ownerKey !== env.key;
                          return (
                            <label
                              key={eq.id}
                              className={cn(
                                'flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors',
                                ownedByOther ? 'opacity-50' : 'hover:bg-muted/50',
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
                {equipmentSetChanged
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
                  Mudar os equipamentos dos ambientes vai <strong>refazer {regenCount} visita(s) futura(s)</strong> ainda
                  não realizadas, atualizando o checklist por equipamento.
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

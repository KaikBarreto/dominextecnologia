import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Trash2, Wrench, ClipboardList, Check, Loader2, ChevronUp, ChevronDown, X,
} from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { EmptyState } from '@/components/mobile/EmptyState';
import { EquipmentFormDialog } from '@/components/customers/EquipmentFormDialog';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { useEquipment } from '@/hooks/useEquipment';
import { useEditOsScope, type EditOsScopeItem } from '@/hooks/useEditOsScope';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { cn } from '@/lib/utils';

/** Item de escopo que já veio na OS (leitura da junção service_order_equipment). */
export interface EditOsScopeSeedItem {
  equipment_id: string | null;
  form_template_id: string | null;
  equipment: { id: string; name: string } | null;
  form_template: { id: string; name: string } | null;
}

/** IDs de escopo (equip×template) que TÊM resposta preenchida — pra confirmar perda. */
export interface AnsweredKey {
  equipmentId: string | null;
  templateId: string;
}

interface EditOsScopeDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceOrderId: string;
  customerId: string;
  customer?: { id: string; name: string } | null;
  /** Escopo atual da OS (mesma leitura do accordion de preenchimento). */
  seedItems: EditOsScopeSeedItem[];
  /** Pares equip×template que já têm ao menos 1 resposta preenchida. */
  answeredKeys: AnsweredKey[];
  /** Chamado após salvar com sucesso — recarrega equipamentos/respostas na tela. */
  onSaved: () => void;
}

/** Grupo interno editável: 1 equipamento (ou avulso) com N templates, ordenável. */
interface ScopeGroup {
  /** Chave estável interna (uuid do equip ou 'standalone'). */
  key: string;
  equipmentId: string | null;
  equipmentName: string | null;
  templateIds: string[];
}

const STANDALONE_KEY = 'standalone';

type TFlow = typeof MESSAGES['pt-br']['app']['os']['technicianFlow'];

export function EditOsScopeDrawer({
  open,
  onOpenChange,
  serviceOrderId,
  customerId,
  customer,
  seedItems,
  answeredKeys,
  onSaved,
}: EditOsScopeDrawerProps) {
  const { locale: appLocale } = useAppLocaleContext();
  const flow: TFlow =
    (MESSAGES[appLocale as keyof typeof MESSAGES]?.app?.os?.technicianFlow as TFlow) ??
    MESSAGES['pt-br'].app.os.technicianFlow;
  const t = flow.editScope;

  const { toast } = useToast();
  const { templates } = useFormTemplates();
  const { createEquipment } = useEquipment(customerId);
  const { editScope } = useEditOsScope();

  const [tab, setTab] = useState<'equipments' | 'standalone'>('equipments');
  // Grupos por equipamento (equipmentId != null), na ordem de exibição.
  const [equipmentGroups, setEquipmentGroups] = useState<ScopeGroup[]>([]);
  // Templates avulsos (equipmentId = null).
  const [standaloneTemplateIds, setStandaloneTemplateIds] = useState<string[]>([]);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [confirmLossOpen, setConfirmLossOpen] = useState(false);
  // Seletor de checklists aberto (chave do grupo ou STANDALONE_KEY), null = fechado.
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const activeTemplates = useMemo(
    () => (templates ?? []).filter((tpl: any) => tpl.is_active !== false),
    [templates],
  );
  const templateName = (id: string) =>
    (templates ?? []).find((tpl: any) => tpl.id === id)?.name ?? id;

  // Hidrata o estado a partir do escopo atual sempre que o drawer abre.
  useEffect(() => {
    if (!open) return;
    const byEquip = new Map<string, ScopeGroup>();
    const standalone: string[] = [];
    for (const it of seedItems) {
      if (it.equipment_id) {
        const key = it.equipment_id;
        if (!byEquip.has(key)) {
          byEquip.set(key, {
            key,
            equipmentId: it.equipment_id,
            equipmentName: it.equipment?.name ?? null,
            templateIds: [],
          });
        }
        if (it.form_template_id) byEquip.get(key)!.templateIds.push(it.form_template_id);
      } else if (it.form_template_id) {
        standalone.push(it.form_template_id);
      }
    }
    setEquipmentGroups(Array.from(byEquip.values()));
    setStandaloneTemplateIds(standalone);
    setTab('equipments');
    setPickerFor(null);
  }, [open, seedItems]);

  // ── Monta o estado desejado completo pra RPC ────────────────────────────
  const buildItems = (): EditOsScopeItem[] => {
    const items: EditOsScopeItem[] = equipmentGroups.map((g) => ({
      equipment_id: g.equipmentId,
      form_template_ids: g.templateIds,
    }));
    if (standaloneTemplateIds.length > 0) {
      items.push({ equipment_id: null, form_template_ids: standaloneTemplateIds });
    }
    return items;
  };

  // Detecta se algum par respondido saiu do escopo desejado (perda de resposta).
  const hasAnsweredRemoval = (): boolean => {
    return answeredKeys.some(({ equipmentId, templateId }) => {
      if (equipmentId === null) return !standaloneTemplateIds.includes(templateId);
      const group = equipmentGroups.find((g) => g.equipmentId === equipmentId);
      // Equipamento removido, ou template removido do equipamento.
      return !group || !group.templateIds.includes(templateId);
    });
  };

  // ── Ações de edição ─────────────────────────────────────────────────────
  const toggleEquipmentTemplate = (groupKey: string, templateId: string) => {
    setEquipmentGroups((prev) =>
      prev.map((g) => {
        if (g.key !== groupKey) return g;
        const has = g.templateIds.includes(templateId);
        return {
          ...g,
          templateIds: has
            ? g.templateIds.filter((id) => id !== templateId)
            : [...g.templateIds, templateId],
        };
      }),
    );
  };

  const toggleStandaloneTemplate = (templateId: string) => {
    setStandaloneTemplateIds((prev) =>
      prev.includes(templateId) ? prev.filter((id) => id !== templateId) : [...prev, templateId],
    );
  };

  const removeEquipmentGroup = (groupKey: string) => {
    setEquipmentGroups((prev) => prev.filter((g) => g.key !== groupKey));
  };

  const moveEquipment = (index: number, dir: -1 | 1) => {
    setEquipmentGroups((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const moveTemplate = (groupKey: string, index: number, dir: -1 | 1) => {
    setEquipmentGroups((prev) =>
      prev.map((g) => {
        if (g.key !== groupKey) return g;
        const next = [...g.templateIds];
        const target = index + dir;
        if (target < 0 || target >= next.length) return g;
        [next[index], next[target]] = [next[target], next[index]];
        return { ...g, templateIds: next };
      }),
    );
  };

  const moveStandalone = (index: number, dir: -1 | 1) => {
    setStandaloneTemplateIds((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  // Quick create de equipamento — reusa EquipmentFormDialog, cria via hook e
  // já anexa o equipamento novo (sem checklist) ao escopo, auto-selecionado.
  const handleQuickCreate = async (data: any) => {
    const created = await createEquipment.mutateAsync({ ...data, customer_id: customerId } as any);
    if (created) {
      const c = created as any;
      setEquipmentGroups((prev) => {
        if (prev.some((g) => g.equipmentId === c.id)) return prev;
        return [...prev, { key: c.id, equipmentId: c.id, equipmentName: c.name, templateIds: [] }];
      });
    }
  };

  // ── Salvar ──────────────────────────────────────────────────────────────
  const doSave = async () => {
    setConfirmLossOpen(false);
    try {
      await editScope.mutateAsync({ serviceOrderId, items: buildItems() });
      toast({ title: t.toastSaved });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const description = mapRpcError(msg, t);
      toast({ variant: 'destructive', title: t.errGeneric, description });
    }
  };

  const handleSaveClick = () => {
    if (hasAnsweredRemoval()) {
      setConfirmLossOpen(true);
      return;
    }
    doSave();
  };

  const saving = editScope.isPending;

  const tabs = [
    { value: 'equipments', label: t.tabEquipments, icon: <Wrench className="h-3.5 w-3.5" /> },
    { value: 'standalone', label: t.tabStandalone, icon: <ClipboardList className="h-3.5 w-3.5" /> },
  ];

  const footer = (
    <Button className="w-full" size="lg" onClick={handleSaveClick} disabled={saving}>
      {saving ? (
        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t.btnSaving}</>
      ) : (
        <><Check className="h-4 w-4 mr-2" />{t.btnSave}</>
      )}
    </Button>
  );

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        title={t.title}
        description={t.description}
        footer={footer}
      >
        <div className="pt-2">
          <MobilePillTabs
            tabs={tabs}
            activeTab={tab}
            onTabChange={(v) => setTab(v as 'equipments' | 'standalone')}
          />
        </div>

        {/* ── Aba Equipamentos ── */}
        {tab === 'equipments' && (
          <div className="mt-4 space-y-3">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setQuickCreateOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t.addEquipment}
            </Button>

            {equipmentGroups.length === 0 ? (
              <EmptyState
                size="compact"
                icon={<Wrench className="h-full w-full" />}
                title={t.emptyEquipmentsTitle}
                description={t.emptyEquipmentsDesc}
              />
            ) : (
              equipmentGroups.map((g, gi) => (
                <div key={g.key} className="rounded-lg border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-2">
                      <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium text-sm">
                        {g.equipmentName ?? g.equipmentId}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button" variant="ghost" size="icon" className="h-8 w-8"
                        disabled={gi === 0} onClick={() => moveEquipment(gi, -1)}
                        aria-label="↑"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button" variant="ghost" size="icon" className="h-8 w-8"
                        disabled={gi === equipmentGroups.length - 1} onClick={() => moveEquipment(gi, 1)}
                        aria-label="↓"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button" variant="ghost" size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => removeEquipmentGroup(g.key)}
                        aria-label={t.removeEquipment}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-2 space-y-1.5">
                    {g.templateIds.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{t.noChecklistOnEquipment}</p>
                    ) : (
                      g.templateIds.map((tid, ti) => (
                        <ChecklistRow
                          key={tid}
                          name={templateName(tid)}
                          index={ti}
                          count={g.templateIds.length}
                          onUp={() => moveTemplate(g.key, ti, -1)}
                          onDown={() => moveTemplate(g.key, ti, 1)}
                          onRemove={() => toggleEquipmentTemplate(g.key, tid)}
                        />
                      ))
                    )}
                  </div>

                  <Button
                    type="button" variant="ghost" size="sm"
                    className="mt-2 h-8 text-primary hover:text-primary"
                    onClick={() => setPickerFor(g.key)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    {t.selectChecklists}
                  </Button>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Aba Checklists avulsos ── */}
        {tab === 'standalone' && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">{t.standaloneHint}</p>
            {standaloneTemplateIds.length === 0 ? (
              <EmptyState
                size="compact"
                icon={<ClipboardList className="h-full w-full" />}
                title={t.emptyStandaloneTitle}
                description={t.emptyStandaloneDesc}
              />
            ) : (
              <div className="space-y-1.5">
                {standaloneTemplateIds.map((tid, ti) => (
                  <ChecklistRow
                    key={tid}
                    name={templateName(tid)}
                    index={ti}
                    count={standaloneTemplateIds.length}
                    onUp={() => moveStandalone(ti, -1)}
                    onDown={() => moveStandalone(ti, 1)}
                    onRemove={() => toggleStandaloneTemplate(tid)}
                  />
                ))}
              </div>
            )}
            <Button
              type="button" variant="outline" className="w-full"
              onClick={() => setPickerFor(STANDALONE_KEY)}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t.addStandalone}
            </Button>
          </div>
        )}
      </ResponsiveModal>

      {/* Seletor de checklists (multi-select) — modal próprio por cima */}
      <ResponsiveModal
        open={pickerFor !== null}
        onOpenChange={(o) => { if (!o) setPickerFor(null); }}
        title={t.selectorTitle}
        footer={
          <Button className="w-full" onClick={() => setPickerFor(null)}>
            {t.selectorDone}
          </Button>
        }
      >
        {activeTemplates.length === 0 ? (
          <EmptyState
            size="compact"
            icon={<ClipboardList className="h-full w-full" />}
            title={t.selectorEmpty}
          />
        ) : (
          <div className="space-y-1 pt-2">
            {activeTemplates.map((tpl: any) => {
              const isStandalone = pickerFor === STANDALONE_KEY;
              const group = isStandalone
                ? null
                : equipmentGroups.find((g) => g.key === pickerFor);
              const checked = isStandalone
                ? standaloneTemplateIds.includes(tpl.id)
                : !!group?.templateIds.includes(tpl.id);
              return (
                <label
                  key={tpl.id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer select-none transition-colors',
                    checked ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => {
                      if (isStandalone) toggleStandaloneTemplate(tpl.id);
                      else if (pickerFor) toggleEquipmentTemplate(pickerFor, tpl.id);
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{tpl.name}</span>
                </label>
              );
            })}
          </div>
        )}
      </ResponsiveModal>

      {/* Quick create de equipamento (reusa o dialog canônico) */}
      <EquipmentFormDialog
        open={quickCreateOpen}
        onOpenChange={setQuickCreateOpen}
        equipment={null}
        onSubmit={handleQuickCreate}
        customers={customer ? [customer as any] : []}
        isLoading={createEquipment.isPending}
      />

      {/* Confirmação de perda de respostas — card branco, título+ícone saturado */}
      <AlertDialog open={confirmLossOpen} onOpenChange={setConfirmLossOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              {t.confirmLossTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>{t.confirmLossDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.confirmLossCancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={doSave}
            >
              {t.confirmLossConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Linha de um checklist dentro de um grupo — nome + reordenar + remover. */
function ChecklistRow({
  name, index, count, onUp, onDown, onRemove,
}: {
  name: string;
  index: number;
  count: number;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-muted/40 pl-2.5 pr-1 py-1">
      <ClipboardList className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
      <Button
        type="button" variant="ghost" size="icon" className="h-7 w-7"
        disabled={index === 0} onClick={onUp} aria-label="↑"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button" variant="ghost" size="icon" className="h-7 w-7"
        disabled={index === count - 1} onClick={onDown} aria-label="↓"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button" variant="ghost" size="icon"
        className="h-7 w-7 text-destructive hover:text-destructive"
        onClick={onRemove} aria-label="X"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/** Mapeia a mensagem crua da RPC pra copy amigável PT-BR (por idioma via `t`). */
function mapRpcError(msg: string, t: TFlow['editScope']): string {
  if (msg.includes('Não autenticado')) return t.errNotAuthenticated;
  if (msg.includes('não encontrada')) return t.errOrderNotFound;
  if (msg.includes('Sem acesso')) return t.errNoAccess;
  if (msg.includes('Sem permissão')) return t.errNoPermission;
  if (msg.includes('PMOC')) return t.errPmoc;
  return t.errGeneric;
}

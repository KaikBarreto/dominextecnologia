import { useMemo, useState } from 'react';
import { Wrench, Plus, Search, Check, Trash2, Loader2, Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
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
import { EmptyState } from '@/components/mobile/EmptyState';
import { useEquipment } from '@/hooks/useEquipment';
import { useContracts, REGENERABLE_OS_STATUSES, type Contract, type ContractItem } from '@/hooks/useContracts';
import { getErrorMessage } from '@/utils/errorMessages';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// Item de trabalho da aba (espelha o shape enviado pro hook). Mantém o `id` do
// contract_item original (quando existe) só pra key/UI; o hook faz o diff por
// chave estável (equipment_id || nome manual), então não dependemos do id.
interface WorkingItem {
  id?: string;
  equipment_id?: string | null;
  item_name: string;
  item_description?: string | null;
  form_template_id?: string | null;
}

interface ContractEquipmentTabProps {
  contract: Contract;
}

// Chave estável idêntica à do hook (equipment_id ou nome do item manual).
function itemKey(it: { equipment_id?: string | null; item_name: string }): string {
  return it.equipment_id ? `eq:${it.equipment_id}` : `manual:${(it.item_name || '').trim().toLowerCase()}`;
}

/**
 * Aba "Equipamentos" da tela de detalhe do contrato. CRUD do conjunto de
 * equipamentos do contrato (contract_items). Adicionar escolhe equipamentos do
 * CLIENTE do contrato (multi-seleção); remover tira do contrato. Ao salvar,
 * dispara `updateContractEquipment` (diff + regeneração de visitas futuras) —
 * nunca toca outros campos do contrato (sem UPDATE vazio). Mudança que refaz
 * visitas futuras passa pelo diálogo de confirmação antes de aplicar.
 */
export function ContractEquipmentTab({ contract }: ContractEquipmentTabProps) {
  const { toast } = useToast();
  const { updateContractEquipment } = useContracts();
  // Equipamentos do cliente do contrato (escopo por customer_id). Mesma fonte
  // que o ContractFormDialog usa pra o picker de itens.
  const { equipment } = useEquipment(contract.customer_id || undefined);
  const activeEquipment = useMemo(() => equipment.filter((eq: any) => eq.status === 'active'), [equipment]);

  // Lista de trabalho — começa do conjunto persistido. Add/remover mexem aqui;
  // só persiste no "Salvar alterações".
  const initialItems = useMemo<WorkingItem[]>(
    () =>
      (contract.contract_items || []).map((i: ContractItem) => ({
        id: i.id,
        equipment_id: i.equipment_id || undefined,
        item_name: i.item_name,
        item_description: i.item_description || undefined,
        form_template_id: i.form_template_id || undefined,
      })),
    [contract.contract_items],
  );
  const [workingItems, setWorkingItems] = useState<WorkingItem[]>(initialItems);

  // Picker de equipamentos (multi-seleção) — só equipamentos do cliente que
  // ainda não estão no contrato.
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerSelection, setPickerSelection] = useState<Set<string>>(new Set());

  // Confirmação de remoção e de regeneração.
  const [removingItem, setRemovingItem] = useState<WorkingItem | null>(null);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [regenCount, setRegenCount] = useState(0);
  const [saving, setSaving] = useState(false);

  // Assinatura do conjunto pra detectar mudança (idempotência da UI).
  const initialSig = useMemo(() => initialItems.map(itemKey).sort().join('§'), [initialItems]);
  const currentSig = useMemo(() => workingItems.map(itemKey).sort().join('§'), [workingItems]);
  const dirty = initialSig !== currentSig;

  // ids de equipamentos já no conjunto de trabalho (pra esconder do picker).
  const usedEquipmentIds = useMemo(
    () => new Set(workingItems.map((i) => i.equipment_id).filter(Boolean) as string[]),
    [workingItems],
  );

  // Equipamentos do cliente ainda NÃO vinculados, filtrados pela busca.
  const pickerEquipment = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return activeEquipment.filter((eq: any) => {
      if (usedEquipmentIds.has(eq.id)) return false;
      if (!q) return true;
      return (
        eq.name?.toLowerCase().includes(q) ||
        eq.brand?.toLowerCase().includes(q) ||
        eq.model?.toLowerCase().includes(q)
      );
    });
  }, [activeEquipment, usedEquipmentIds, pickerSearch]);

  const togglePicker = (eqId: string) => {
    setPickerSelection((prev) => {
      const next = new Set(prev);
      if (next.has(eqId)) next.delete(eqId);
      else next.add(eqId);
      return next;
    });
  };

  const openPicker = () => {
    setPickerSearch('');
    setPickerSelection(new Set());
    setShowPicker(true);
  };

  const confirmPicker = () => {
    const toAdd: WorkingItem[] = activeEquipment
      .filter((eq: any) => pickerSelection.has(eq.id))
      .map((eq: any) => ({
        equipment_id: eq.id,
        item_name: eq.name,
        item_description: [eq.brand, eq.model].filter(Boolean).join(' - ') || undefined,
      }));
    if (toAdd.length > 0) {
      setWorkingItems((prev) => [...prev, ...toAdd]);
    }
    setShowPicker(false);
  };

  const removeItem = (item: WorkingItem) => {
    setWorkingItems((prev) => prev.filter((i) => itemKey(i) !== itemKey(item)));
    setRemovingItem(null);
  };

  // Quantas OSs futuras não-realizadas seriam refeitas (preview do diálogo).
  const futureRegenerable = useMemo(() => {
    const todayStr = (() => {
      const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      return fmt.format(new Date());
    })();
    return ((contract.service_orders || []) as any[]).filter(
      (os) => REGENERABLE_OS_STATUSES.has(os.status ?? '') && (os.scheduled_date ?? '') >= todayStr,
    ).length;
  }, [contract.service_orders]);

  const isActive = contract.status === 'active';

  const applySave = async () => {
    setShowRegenConfirm(false);
    setSaving(true);
    try {
      await updateContractEquipment.mutateAsync({
        id: contract.id,
        items: workingItems.map((i) => ({
          equipment_id: i.equipment_id || null,
          item_name: i.item_name,
          item_description: i.item_description || null,
          form_template_id: i.form_template_id || null,
        })),
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!dirty) return;
    // Conjunto mudou E há visitas futuras a refazer (contrato ativo) → confirma.
    if (isActive && futureRegenerable > 0) {
      setRegenCount(futureRegenerable);
      setShowRegenConfirm(true);
      return;
    }
    void applySave();
  };

  const handleResetChanges = () => setWorkingItems(initialItems);

  return (
    <div className="space-y-6 min-w-0 w-full">
      <Card className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl lg:rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
        <CardHeader className="flex flex-col items-start justify-between gap-2 space-y-0 sm:flex-row sm:items-center">
          <CardTitle className="flex min-w-0 items-center gap-2 text-base sm:text-lg">
            <Wrench className="h-5 w-5 shrink-0" />
            <span className="min-w-0 break-words">Equipamentos do Contrato ({workingItems.length})</span>
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="w-full sm:w-auto min-h-11 sm:min-h-9 active:scale-[0.98] transition-transform rounded-xl"
            onClick={openPicker}
          >
            <Plus className="mr-1 h-4 w-4" /> Adicionar equipamento
          </Button>
        </CardHeader>
        <CardContent className="min-w-0">
          {workingItems.length === 0 ? (
            <EmptyState
              size="compact"
              icon={<Package className="h-10 w-10" />}
              title="Nenhum equipamento no contrato"
              action={{ label: 'Adicionar equipamento', onClick: openPicker }}
            />
          ) : (
            <div className="space-y-2 min-w-0">
              {workingItems.map((item) => (
                <div
                  key={itemKey(item)}
                  className="flex min-w-0 items-start gap-3 rounded-xl border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium">{item.item_name}</p>
                    {item.item_description && (
                      <p className="break-words text-xs text-muted-foreground">{item.item_description}</p>
                    )}
                  </div>
                  {item.equipment_id ? (
                    <Badge variant="secondary" className="shrink-0 self-start text-xs">Equipamento</Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0 self-start text-xs">Item manual</Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 min-h-11 min-w-11 sm:h-8 sm:w-8 sm:min-h-8 sm:min-w-8 text-destructive active:scale-90 transition-transform rounded-xl"
                    title="Remover do contrato"
                    onClick={() => setRemovingItem(item)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Barra de salvar — só aparece quando há mudança pendente. */}
          {dirty && (
            <div className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Alterações não salvas. Salvar recalcula as visitas futuras (realizadas e em andamento são preservadas).
              </p>
              <div className="flex w-full gap-2 sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none min-h-11 sm:min-h-9 active:scale-[0.98] transition-transform rounded-xl"
                  onClick={handleResetChanges}
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

      {/* Picker de equipamentos do cliente (multi-seleção). */}
      <ResponsiveModal open={showPicker} onOpenChange={setShowPicker} title="Adicionar equipamentos">
        <div className="space-y-3 p-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar equipamento do cliente..."
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          {pickerEquipment.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {activeEquipment.length === 0
                ? 'O cliente não tem equipamentos cadastrados.'
                : 'Todos os equipamentos do cliente já estão no contrato.'}
            </p>
          ) : (
            <div className="max-h-72 divide-y overflow-y-auto rounded-md border">
              {pickerEquipment.map((eq: any) => {
                const selected = pickerSelection.has(eq.id);
                return (
                  <button
                    key={eq.id}
                    type="button"
                    onClick={() => togglePicker(eq.id)}
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
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
            onClick={confirmPicker}
            disabled={pickerSelection.size === 0}
          >
            <Plus className="mr-2 h-4 w-4" />
            Adicionar {pickerSelection.size > 0 ? `${pickerSelection.size} ` : ''}
            equipamento{pickerSelection.size !== 1 ? 's' : ''}
          </Button>
        </div>
      </ResponsiveModal>

      {/* Confirmação de remoção. */}
      <AlertDialog open={!!removingItem} onOpenChange={(open) => { if (!open) setRemovingItem(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover equipamento?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{removingItem?.item_name}</strong> sairá deste contrato. A mudança só é aplicada ao salvar — aí
              as visitas futuras são recalculadas sem esse equipamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (removingItem) removeItem(removingItem); }}
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
                  Mudar os equipamentos do contrato vai <strong>refazer {regenCount} visita(s) futura(s)</strong> ainda
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

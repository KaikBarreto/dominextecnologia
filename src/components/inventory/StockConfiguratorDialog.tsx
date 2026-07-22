/**
 * StockConfiguratorDialog — configura quais materiais estão presentes em um local de estoque.
 * Abre via botão "Configurar itens deste local" na aba do local ativo (Inventory.tsx).
 * Mobile = drawer (ResponsiveModal), desktop = modal.
 */
import { useState, useMemo } from 'react';
import { Package, Search, Settings2 } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { EmptyState } from '@/components/mobile/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fuzzyIncludes } from '@/lib/utils';
import { useInventory, type InventoryItem } from '@/hooks/useInventory';
import { useMaterialGroups } from '@/hooks/useMaterialGroups';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import type { Stock } from '@/hooks/useStocks';

interface StockConfiguratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stock: Stock;
  /** Abre o dialog de transferência para resolver saldo bloqueado.
   *  fromStockId é o local que tem saldo e está bloqueando a remoção — deve ser
   *  pré-selecionado como ORIGEM na transferência. */
  onOpenTransfer: (item: InventoryItem, fromStockId: string) => void;
}

export function StockConfiguratorDialog({ open, onOpenChange, stock, onOpenTransfer }: StockConfiguratorDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.stockConfigurator;
  const { toast } = useToast();
  const { items, getPresenceForStock, addGroupToStock, setStockMaterials } = useInventory();
  const { groups } = useMaterialGroups();

  const [search, setSearch] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  // Estado local de presença: { [inventoryId]: boolean }
  const [presenceMap, setPresenceMap] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const item of items) {
      map[item.id] = getPresenceForStock(item.id, stock.id);
    }
    return map;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingGroup, setIsAddingGroup] = useState(false);

  // Re-inicializa quando o dialog abre (garante dados frescos do cache)
  const handleOpenChange = (v: boolean) => {
    if (v) {
      const map: Record<string, boolean> = {};
      for (const item of items) {
        map[item.id] = getPresenceForStock(item.id, stock.id);
      }
      setPresenceMap(map);
      setSearch('');
      setSelectedGroupId('');
    }
    onOpenChange(v);
  };

  // Lista filtrada para exibição (busca no dataset completo — [[feedback_busca_universal_telas_listagem]])
  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    return items.filter(
      (item) =>
        fuzzyIncludes(item.name, search) ||
        fuzzyIncludes(item.sku, search) ||
        fuzzyIncludes(item.category, search),
    );
  }, [items, search]);

  const allSelected = items.length > 0 && items.every((i) => presenceMap[i.id] !== false);
  const noneSelected = items.length > 0 && items.every((i) => presenceMap[i.id] === false);

  const handleMarkAll = () => {
    const map: Record<string, boolean> = {};
    for (const i of items) { map[i.id] = true; }
    setPresenceMap(map);
  };

  const handleUnmarkAll = () => {
    const map: Record<string, boolean> = {};
    for (const i of items) { map[i.id] = false; }
    setPresenceMap(map);
  };

  const handleAddGroup = async () => {
    if (!selectedGroupId) return;
    setIsAddingGroup(true);
    try {
      await addGroupToStock.mutateAsync({ stockId: stock.id, groupId: selectedGroupId });
      // Marca todos os itens do grupo no estado local
      const groupItems = items.filter((i) => i.group_id === selectedGroupId);
      setPresenceMap((prev) => {
        const next = { ...prev };
        for (const i of groupItems) { next[i.id] = true; }
        return next;
      });
      setSelectedGroupId('');
    } catch {
      // erro já tratado pelo hook
    } finally {
      setIsAddingGroup(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    const presentIds = items.filter((i) => presenceMap[i.id] !== false).map((i) => i.id);
    try {
      await setStockMaterials.mutateAsync({ stockId: stock.id, inventoryIds: presentIds });
      toast({ title: t.successMessage });
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = String((err as Error).message ?? '');
      if (msg.includes('presence_has_balance')) {
        const afterToken = msg.split('presence_has_balance:')[1] ?? '';
        const blockedNames = afterToken.trim() || '?';
        // Encontra o primeiro item bloqueado para abrir transferência
        const blockedItem = items.find((i) => blockedNames.includes(i.name));
        toast({
          variant: 'destructive',
          title: t.presenceError.title.replace('{names}', blockedNames),
          description: `${t.presenceError.description} ${t.presenceError.transfer}.`,
        });
        if (blockedItem) {
          onOpenChange(false);
          // Passa stock.id como origem: é exatamente este local (que está sendo
          // configurado) que tem saldo e impede a remoção do material.
          onOpenTransfer(blockedItem, stock.id);
        }
      }
      // erro genérico já tratado pelo hook
    } finally {
      setIsSaving(false);
    }
  };

  const selectedGroupName = groups.find((g) => g.id === selectedGroupId)?.name;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleOpenChange}
      title={t.dialogTitle.replace('{stock}', stock.name)}
      className="sm:max-w-[520px]"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1" disabled={isSaving}>
            {t.cancel}
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="flex-1">
            {isSaving ? t.saving : t.save}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Adicionar por grupo */}
        {groups.length > 0 && (
          <div className="flex items-center gap-2">
            <Select
              value={selectedGroupId}
              onValueChange={setSelectedGroupId}
            >
              <SelectTrigger className="flex-1 min-w-0">
                <SelectValue placeholder={t.addByGroupPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: g.color ?? '#6B7280' }}
                      />
                      {g.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={handleAddGroup}
              disabled={!selectedGroupId || isAddingGroup}
            >
              {t.addByGroupButton}
            </Button>
          </div>
        )}

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Marcar / Desmarcar todos */}
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleMarkAll} disabled={allSelected}>
            {t.markAll}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleUnmarkAll} disabled={noneSelected}>
            {t.unmarkAll}
          </Button>
          <span className="text-xs text-muted-foreground ml-auto">
            {items.filter((i) => presenceMap[i.id] !== false).length}/{items.length}
          </span>
        </div>

        {/* Lista de materiais */}
        {items.length === 0 ? (
          <EmptyState
            size="compact"
            icon={<Package className="h-10 w-10" />}
            title={t.empty}
          />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            size="compact"
            icon={<Search className="h-10 w-10" />}
            title={t.emptyFiltered}
          />
        ) : (
          <div className="rounded-xl border divide-y max-h-[400px] overflow-y-auto">
            {filteredItems.map((item) => {
              const isPresent = presenceMap[item.id] !== false;
              return (
                <label
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  <Checkbox
                    checked={isPresent}
                    onCheckedChange={(checked) =>
                      setPresenceMap((prev) => ({ ...prev, [item.id]: !!checked }))
                    }
                    className="shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    {item.sku && (
                      <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                    )}
                  </div>
                  {item.group_id && (
                    <div
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: groups.find((g) => g.id === item.group_id)?.color ?? '#6B7280',
                      }}
                    />
                  )}
                  <Package className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                </label>
              );
            })}
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}

/** Botão gatilho que abre o StockConfiguratorDialog */
export function StockConfiguratorButton({ stock, onOpenTransfer }: { stock: Stock; onOpenTransfer: (item: InventoryItem, fromStockId: string) => void }) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.stockConfigurator;
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 h-9 shrink-0 rounded-xl"
        onClick={() => setOpen(true)}
      >
        <Settings2 className="h-4 w-4" />
        <span className="hidden sm:inline">{t.buttonLabel}</span>
      </Button>
      <StockConfiguratorDialog
        open={open}
        onOpenChange={setOpen}
        stock={stock}
        onOpenTransfer={onOpenTransfer}
      />
    </>
  );
}

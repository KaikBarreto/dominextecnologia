/**
 * StockConfiguratorDialog — configura quais materiais estão presentes em um local de estoque.
 * Abre via botão "Configurar itens deste local" na aba do local ativo (Inventory.tsx).
 * Mobile = drawer (ResponsiveModal), desktop = modal.
 */
import { useState, useMemo, useEffect, useRef } from 'react';
import { Package, Search, Settings2, Users, AlertCircle } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { EmptyState } from '@/components/mobile/EmptyState';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { fuzzyIncludes } from '@/lib/utils';
import { useInventory, type InventoryItem } from '@/hooks/useInventory';
import { useMaterialGroups } from '@/hooks/useMaterialGroups';
import { useUsers } from '@/hooks/useUsers';
import { useStockAccess } from '@/hooks/useStockAccess';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import type { Stock } from '@/hooks/useStocks';

/** Papéis que sempre têm acesso a qualquer local (o banco os libera sozinho). */
const ALWAYS_ACCESS_ROLES = ['admin', 'gestor', 'super_admin'];

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
  const { items, isLoading: itemsLoading, getPresenceForStock, addGroupToStock, setStockMaterials, stockLevelsLoaded } = useInventory();
  const { groups } = useMaterialGroups();

  const [search, setSearch] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  // Estado local de presença: { [inventoryId]: boolean }. Nasce vazio de
  // propósito: só é preenchido pelo efeito de hidratação abaixo, depois de
  // stockLevels (fonte de verdade) e items terem carregado.
  const [presenceMap, setPresenceMap] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingGroup, setIsAddingGroup] = useState(false);

  // Trava de hidratação: mesma lógica do InventoryFormDialog. `hydratedRef`
  // garante UMA hidratação por abertura (não deixa um refetch em background
  // sobrescrever o que o usuário já mexeu); `itemsHydrated` (estado) é o que a
  // UI usa pra skeleton/controles desabilitados e pra travar o Salvar.
  const hydratedRef = useRef(false);
  const [itemsHydrated, setItemsHydrated] = useState(false);
  const stocksSectionReady = stockLevelsLoaded && !itemsLoading;

  // Zera a trava a cada abertura (ou troca do local sendo configurado).
  useEffect(() => {
    hydratedRef.current = false;
    setItemsHydrated(false);
  }, [open, stock.id]);

  // Hidrata presença UMA VEZ por abertura, só depois de stocksSectionReady —
  // nunca antes. Mesma correção do InventoryFormDialog: sem essa trava, abrir
  // o dialog antes da query de stockLevels resolver fazia getPresenceForStock
  // cair no default permissivo (true) pra todo material.
  useEffect(() => {
    if (!open) return;
    if (hydratedRef.current) return;
    if (!stocksSectionReady) return;
    const map: Record<string, boolean> = {};
    for (const item of items) {
      map[item.id] = getPresenceForStock(item.id, stock.id);
    }
    setPresenceMap(map);
    hydratedRef.current = true;
    setItemsHydrated(true);
    // items/getPresenceForStock mudam de identidade a cada render (a segunda é
    // recriada a cada chamada de useInventory()) — não entram nas deps pra não
    // disparar o efeito em todo render; o gate real é open + stocksSectionReady,
    // com hydratedRef travando a segunda execução.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stock.id, stocksSectionReady]);

  // --- Aba ativa (Itens | Acesso) ---
  const [activeTab, setActiveTab] = useState<'items' | 'access'>('items');

  // --- Acesso por local ---
  const { users, error: usersError } = useUsers();
  const { access, isLoading: accessLoading, setAccess } = useStockAccess(stock.id, open, {
    successMessage: t.access.successMessage,
    errorMessage: t.access.errorMessage,
  });

  // Usuários "sempre com acesso" (admin/gestor/super_admin) não entram no array;
  // os demais são controláveis via switch.
  const alwaysUsers = useMemo(
    () => users.filter((u) => u.role && ALWAYS_ACCESS_ROLES.includes(u.role)),
    [users],
  );
  const controllableUsers = useMemo(
    () => users.filter((u) => !u.role || !ALWAYS_ACCESS_ROLES.includes(u.role)),
    [users],
  );

  const [restricted, setRestricted] = useState(false);
  // { [user_id]: boolean } — só dos usuários controláveis
  const [accessMap, setAccessMap] = useState<Record<string, boolean>>({});
  const [isSavingAccess, setIsSavingAccess] = useState(false);

  // Hidrata o estado de acesso quando a query resolve.
  useEffect(() => {
    if (!access) return;
    setRestricted(access.restricted);
    const map: Record<string, boolean> = {};
    for (const u of controllableUsers) {
      map[u.user_id] = access.user_ids.includes(u.user_id);
    }
    setAccessMap(map);
    // controllableUsers muda de referência conforme users carrega; access é a fonte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access, users]);

  // Reseta busca/grupo/aba ao abrir. A hidratação de presenceMap é feita pelo
  // efeito acima (guardado por hydratedRef) — não aqui, pra nunca rodar antes
  // de stocksSectionReady.
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setSearch('');
      setSelectedGroupId('');
      setActiveTab('items');
    }
    onOpenChange(v);
  };

  const handleSaveAccess = async () => {
    setIsSavingAccess(true);
    try {
      const userIds = restricted
        ? controllableUsers.filter((u) => accessMap[u.user_id]).map((u) => u.user_id)
        : [];
      await setAccess.mutateAsync({ stockId: stock.id, restricted, userIds });
      onOpenChange(false);
    } catch {
      // erro já tratado pelo hook
    } finally {
      setIsSavingAccess(false);
    }
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
    if (!selectedGroupId || !itemsHydrated) return;
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
    if (!itemsHydrated) return;
    setIsSaving(true);
    // Só considera chaves que EXISTEM no mapa — ausente do mapa nunca é
    // tratado como presente (era esse default cego que corrompia a presença
    // real quando o dialog salvava antes de stockLevels carregar).
    const presentIds = items
      .filter((i) => i.id in presenceMap && presenceMap[i.id] === true)
      .map((i) => i.id);
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
        activeTab === 'items' ? (
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1" disabled={isSaving}>
              {t.cancel}
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !itemsHydrated} className="flex-1">
              {isSaving ? t.saving : t.save}
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1" disabled={isSavingAccess}>
              {t.cancel}
            </Button>
            <Button onClick={handleSaveAccess} disabled={isSavingAccess} className="flex-1">
              {isSavingAccess ? t.access.saving : t.access.save}
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        <MobilePillTabs
          variant="underline"
          activeTab={activeTab}
          onTabChange={(v) => setActiveTab(v as 'items' | 'access')}
          tabs={[
            { value: 'items', label: t.access.tabItems, icon: <Package className="h-4 w-4" /> },
            { value: 'access', label: t.access.tabLabel, icon: <Users className="h-4 w-4" /> },
          ]}
        />

        {activeTab === 'items' && (
        <div className="space-y-4">
        {/* Adicionar por grupo */}
        {groups.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <SearchableSelect
                value={selectedGroupId}
                onValueChange={setSelectedGroupId}
                placeholder={t.addByGroupPlaceholder}
                searchPlaceholder={t.addByGroupSearchPlaceholder}
                options={groups.map((g) => ({
                  value: g.id,
                  label: g.name,
                  icon: (
                    <div
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: g.color ?? '#6B7280' }}
                    />
                  ),
                }))}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={handleAddGroup}
              disabled={!selectedGroupId || isAddingGroup || !itemsHydrated}
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
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleMarkAll} disabled={!itemsHydrated || allSelected}>
            {t.markAll}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleUnmarkAll} disabled={!itemsHydrated || noneSelected}>
            {t.unmarkAll}
          </Button>
          {itemsHydrated ? (
            <span className="text-xs text-muted-foreground ml-auto">
              {items.filter((i) => presenceMap[i.id] !== false).length}/{items.length}
            </span>
          ) : (
            <Skeleton className="h-3 w-10 ml-auto" />
          )}
        </div>

        {/* Lista de materiais */}
        {!itemsHydrated ? (
          // Skeleton: nasce aqui em vez do estado "tudo marcado" enquanto os
          // stockLevels ainda não chegaram — era esse default permissivo que
          // corrompia a presença real ao salvar, antes desta correção.
          <div className="rounded-xl border divide-y max-h-[400px] overflow-y-auto">
            {Array.from({ length: Math.max(items.length, 3) }).map((_, idx) => (
              <div key={idx} className="flex items-center gap-3 px-3 py-2.5">
                <Skeleton className="h-4 w-4 rounded-sm shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                </div>
                <Skeleton className="h-2 w-2 rounded-full shrink-0" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
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
        )}

        {activeTab === 'access' && (
        <div className="space-y-4">
          {/* Toggle: aberto (padrão) vs restrito */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{t.access.restrictLabel}</span>
              <LabeledSwitch
                value={restricted ? 'on' : 'off'}
                onChange={(v) => setRestricted(v === 'on')}
                off={{ value: 'off', label: t.access.openLabel }}
                on={{ value: 'on', label: t.access.restrictedLabel }}
                size="default"
                aria-label={t.access.restrictLabel}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {restricted ? t.access.restrictedHint : t.access.openHint}
            </p>
          </div>

          {/* Lista de usuários (só quando restrito) */}
          {restricted && (
            usersError ? (
              <EmptyState
                size="compact"
                icon={<AlertCircle className="h-10 w-10" />}
                title={t.access.usersError}
              />
            ) : accessLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t.access.loading}</p>
            ) : users.length === 0 ? (
              <EmptyState
                size="compact"
                icon={<Users className="h-10 w-10" />}
                title={t.access.usersEmpty}
              />
            ) : (
              <div className="rounded-xl border divide-y max-h-[360px] overflow-y-auto">
                {/* Admin/gestor/super_admin: sempre com acesso, switch travado */}
                {alwaysUsers.map((u) => (
                  <div key={u.user_id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.full_name || u.email}</p>
                      <p className="text-xs text-muted-foreground">{t.access.alwaysHasAccess}</p>
                    </div>
                    <Switch checked disabled className="shrink-0" />
                  </div>
                ))}
                {/* Demais usuários: controláveis */}
                {controllableUsers.map((u) => (
                  <div key={u.user_id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.full_name || u.email}</p>
                      {u.email && u.full_name && (
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      )}
                    </div>
                    <Switch
                      checked={!!accessMap[u.user_id]}
                      onCheckedChange={(checked) =>
                        setAccessMap((prev) => ({ ...prev, [u.user_id]: !!checked }))
                      }
                      className="shrink-0"
                    />
                  </div>
                ))}
              </div>
            )
          )}
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

import { useState, useCallback, useMemo } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useStocks } from '@/hooks/useStocks';
import { useInventory } from '@/hooks/useInventory';
import { useMaterialGroups } from '@/hooks/useMaterialGroups';
import { useInventoryCounts } from '@/hooks/useInventoryCounts';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useToast } from '@/hooks/use-toast';
import { cn, fuzzyIncludes } from '@/lib/utils';
import { Package, Warehouse, Users, AlignJustify, Search } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'stocks' | 'scope' | 'confirm';

export function InventoryCountWizard({ open, onOpenChange }: Props) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.inventoryCount.wizard;
  const { stocks } = useStocks();
  const { items: inventoryItems } = useInventory();
  const { groups } = useMaterialGroups();
  const { createCount } = useInventoryCounts();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('stocks');
  const [selectedStocks, setSelectedStocks] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [scopeMode, setScopeMode] = useState<'all' | 'groups' | 'items'>('all');
  const [notes, setNotes] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');

  const reset = useCallback(() => {
    setStep('stocks');
    setSelectedStocks([]);
    setSelectedGroups([]);
    setSelectedItems([]);
    setScopeMode('all');
    setNotes('');
    setItemSearch('');
    setGroupSearch('');
  }, []);

  const handleClose = () => {
    onOpenChange(false);
    reset();
  };

  const toggleStock = (id: string) => {
    setSelectedStocks((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  const toggleGroup = (id: string) => {
    setSelectedGroups((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    );
  };

  const toggleItem = (id: string) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  // Itens filtrados pela busca (modo 'items')
  const filteredItems = useMemo(
    () =>
      inventoryItems.filter(
        (item) =>
          fuzzyIncludes(item.name, itemSearch) || fuzzyIncludes(item.sku, itemSearch),
      ),
    [inventoryItems, itemSearch],
  );

  // Grupos filtrados pela busca (modo 'groups')
  const filteredGroups = useMemo(
    () => groups.filter((g) => fuzzyIncludes(g.name, groupSearch)),
    [groups, groupSearch],
  );

  // Selecionar todos os visíveis / limpar
  const allVisibleItemsSelected =
    filteredItems.length > 0 && filteredItems.every((i) => selectedItems.includes(i.id));

  const allVisibleGroupsSelected =
    filteredGroups.length > 0 && filteredGroups.every((g) => selectedGroups.includes(g.id));

  const toggleSelectAllItems = () => {
    if (allVisibleItemsSelected) {
      // Remove apenas os visíveis; mantém selecionados fora do filtro
      const visibleIds = new Set(filteredItems.map((i) => i.id));
      setSelectedItems((prev) => prev.filter((id) => !visibleIds.has(id)));
    } else {
      const visibleIds = filteredItems.map((i) => i.id);
      setSelectedItems((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const toggleSelectAllGroups = () => {
    if (allVisibleGroupsSelected) {
      const visibleIds = new Set(filteredGroups.map((g) => g.id));
      setSelectedGroups((prev) => prev.filter((id) => !visibleIds.has(id)));
    } else {
      const visibleIds = filteredGroups.map((g) => g.id);
      setSelectedGroups((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const canProceedToScope = selectedStocks.length > 0;
  // Evita criar inventário vazio: exige seleção dentro do escopo escolhido.
  const canConfirm =
    selectedStocks.length > 0 &&
    (scopeMode === 'all' ||
      (scopeMode === 'groups' && selectedGroups.length > 0) ||
      (scopeMode === 'items' && selectedItems.length > 0));

  const handleCreate = async () => {
    try {
      await createCount.mutateAsync({
        notes: notes.trim() || undefined,
        stockIds: selectedStocks,
        groupIds: scopeMode === 'groups' ? selectedGroups : undefined,
        itemIds: scopeMode === 'items' ? selectedItems : undefined,
      });
      toast({ title: t.successTitle });
      handleClose();
    } catch {
      // error handled in hook
    }
  };

  const stepTitles: Record<Step, string> = {
    stocks: t.stepStocks,
    scope: t.stepScope,
    confirm: t.stepConfirm,
  };

  const footer = (
    <div className="flex items-center justify-between gap-2 p-4 border-t bg-background">
      <Button variant="outline" onClick={step === 'stocks' ? handleClose : () => setStep(step === 'confirm' ? 'scope' : 'stocks')}>
        {step === 'stocks' ? t.cancel : t.back}
      </Button>
      {step === 'stocks' && (
        <Button
          disabled={!canProceedToScope}
          onClick={() => setStep('scope')}
        >
          {t.next}
        </Button>
      )}
      {step === 'scope' && (
        <Button onClick={() => setStep('confirm')}>
          {t.next}
        </Button>
      )}
      {step === 'confirm' && (
        <Button
          disabled={!canConfirm || createCount.isPending}
          onClick={handleCreate}
        >
          {createCount.isPending ? t.creating : t.create}
        </Button>
      )}
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleClose}
      title={stepTitles[step]}
      footer={footer}
    >
      <div className="p-4 space-y-4">
        {/* Indicador de etapa */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <StepDot active={step === 'stocks'} done={step !== 'stocks'} />
          <span className={step === 'stocks' ? 'text-foreground font-medium' : ''}>{t.stepStocks}</span>
          <div className="flex-1 h-px bg-border" />
          <StepDot active={step === 'scope'} done={step === 'confirm'} />
          <span className={step === 'scope' ? 'text-foreground font-medium' : ''}>{t.stepScope}</span>
          <div className="flex-1 h-px bg-border" />
          <StepDot active={step === 'confirm'} done={false} />
          <span className={step === 'confirm' ? 'text-foreground font-medium' : ''}>{t.stepConfirm}</span>
        </div>

        {/* Etapa 1: Locais de estoque */}
        {step === 'stocks' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t.stocksHint}</p>
            {stocks.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.noStocks}</p>
            ) : (
              <div className="space-y-2">
                {stocks.map((s) => (
                  <label
                    key={s.id}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                      selectedStocks.includes(s.id)
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50',
                    )}
                  >
                    <Checkbox
                      checked={selectedStocks.includes(s.id)}
                      onCheckedChange={() => toggleStock(s.id)}
                    />
                    <Warehouse className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium">{s.name}</span>
                    {s.is_default && (
                      <span className="ml-auto text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                        {t.defaultBadge}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Etapa 2: Escopo */}
        {step === 'scope' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t.scopeHint}</p>

            {/* Opções de escopo */}
            <div className="space-y-2">
              {[
                { mode: 'all' as const, icon: <AlignJustify className="h-4 w-4" />, label: t.scopeAll },
                { mode: 'groups' as const, icon: <Users className="h-4 w-4" />, label: t.scopeGroups },
                { mode: 'items' as const, icon: <Package className="h-4 w-4" />, label: t.scopeItems },
              ].map(({ mode, icon, label }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setScopeMode(mode)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-xl border text-left text-sm transition-colors',
                    scopeMode === mode
                      ? 'border-primary bg-primary/5 font-medium'
                      : 'border-border hover:bg-muted/50',
                  )}
                >
                  <span className="text-muted-foreground">{icon}</span>
                  {label}
                </button>
              ))}
            </div>

            {/* Seleção de grupos */}
            {scopeMode === 'groups' && (
              <div className="space-y-2">
                {groups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.noGroups}</p>
                ) : (
                  <>
                    {/* Campo de busca */}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                      <Input
                        value={groupSearch}
                        onChange={(e) => setGroupSearch(e.target.value)}
                        placeholder={t.searchGroupsPlaceholder}
                        className="pl-8 h-8 text-sm"
                      />
                    </div>
                    {/* Selecionar todos + contador */}
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={toggleSelectAllGroups}
                        className="text-xs text-primary hover:underline"
                      >
                        {allVisibleGroupsSelected ? t.clearSelection : t.selectAll}
                      </button>
                      <span className="text-xs text-muted-foreground">
                        {t.selectedCount
                          .replace('{selected}', String(selectedGroups.length))
                          .replace('{total}', String(groups.length))}
                      </span>
                    </div>
                    {/* Lista */}
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {filteredGroups.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2 text-center">{t.noGroups}</p>
                      ) : (
                        filteredGroups.map((g) => (
                          <label
                            key={g.id}
                            className={cn(
                              'flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors',
                              selectedGroups.includes(g.id) ? 'border-primary bg-primary/5' : 'border-border',
                            )}
                          >
                            <Checkbox
                              checked={selectedGroups.includes(g.id)}
                              onCheckedChange={() => toggleGroup(g.id)}
                            />
                            <div
                              className="h-3 w-3 rounded-full shrink-0"
                              style={{ backgroundColor: g.color ?? '#6B7280' }}
                            />
                            <span className="text-sm">{g.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Seleção de itens */}
            {scopeMode === 'items' && (
              <div className="space-y-2">
                {inventoryItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.noItems}</p>
                ) : (
                  <>
                    {/* Campo de busca */}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                      <Input
                        value={itemSearch}
                        onChange={(e) => setItemSearch(e.target.value)}
                        placeholder={t.searchItemsPlaceholder}
                        className="pl-8 h-8 text-sm"
                      />
                    </div>
                    {/* Selecionar todos + contador */}
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={toggleSelectAllItems}
                        className="text-xs text-primary hover:underline"
                      >
                        {allVisibleItemsSelected ? t.clearSelection : t.selectAll}
                      </button>
                      <span className="text-xs text-muted-foreground">
                        {t.selectedCount
                          .replace('{selected}', String(selectedItems.length))
                          .replace('{total}', String(inventoryItems.length))}
                      </span>
                    </div>
                    {/* Lista */}
                    <div className="space-y-1.5 max-h-56 overflow-y-auto">
                      {filteredItems.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2 text-center">{t.noItems}</p>
                      ) : (
                        filteredItems.map((item) => (
                          <label
                            key={item.id}
                            className={cn(
                              'flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors',
                              selectedItems.includes(item.id) ? 'border-primary bg-primary/5' : 'border-border',
                            )}
                          >
                            <Checkbox
                              checked={selectedItems.includes(item.id)}
                              onCheckedChange={() => toggleItem(item.id)}
                            />
                            <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <span className="text-sm truncate block">{item.name}</span>
                              {item.sku && (
                                <span className="text-[10px] text-muted-foreground font-mono">{item.sku}</span>
                              )}
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Etapa 3: Confirmar + Observações */}
        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
              <p className="text-sm font-medium">{t.confirmSummary}</p>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  {t.confirmStocks}:{' '}
                  <span className="text-foreground font-medium">
                    {stocks.filter((s) => selectedStocks.includes(s.id)).map((s) => s.name).join(', ')}
                  </span>
                </p>
                <p>
                  {t.confirmScope}:{' '}
                  <span className="text-foreground font-medium">
                    {scopeMode === 'all'
                      ? t.scopeAll
                      : scopeMode === 'groups'
                      ? `${selectedGroups.length} ${t.confirmGroupCount}`
                      : `${selectedItems.length} ${t.confirmItemCount}`}
                  </span>
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="count-notes">{t.notesLabel}</Label>
              <Textarea
                id="count-notes"
                placeholder={t.notesPlaceholder}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}

function StepDot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <div
      className={cn(
        'h-2 w-2 rounded-full shrink-0 transition-colors',
        active ? 'bg-primary' : done ? 'bg-primary/40' : 'bg-muted-foreground/30',
      )}
    />
  );
}

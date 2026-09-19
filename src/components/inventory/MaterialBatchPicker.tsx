import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Package, Plus, Search } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumericInput } from '@/components/ui/numeric-input';
import { EmptyState } from '@/components/mobile/EmptyState';
import { formatQty } from '@/components/inventory/InventoryMaterialSelect';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { readPastedCents } from '@/lib/money-paste-mask';
import { cn, fuzzyIncludesAny } from '@/lib/utils';
import type { InventoryItem } from '@/hooks/useInventory';

/**
 * Seleção de UM item devolvida pelo picker. `inventoryId` xor `manualName`:
 * quando vem do catálogo, `manualName` é null; quando é material avulso
 * (criado na hora, sem cadastro no estoque), `inventoryId` é null.
 * `unitPrice` é informativo pro item de catálogo (o preço de venda já
 * cadastrado); quem monta o item final (`buildMaterialItem`) recalcula a
 * partir do próprio `inventory_id` pra garantir que o cálculo não diverge do
 * fluxo antigo — nunca confie só nesse campo pra item de catálogo.
 */
export interface MaterialBatchSelection {
  inventoryId: string | null;
  manualName: string | null;
  quantity: number;
  unitPrice: number;
}

interface MaterialBatchPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Catálogo de materiais (recebido por prop — componente burro, sem Supabase). */
  items: InventoryItem[];
  /** Ids dos materiais mais usados pelo tenant (top N), pro grupo "Mais usados". */
  frequentIds?: string[];
  /** Confirma o lote inteiro de uma vez. O picker já fecha sozinho depois. */
  onConfirm: (selections: MaterialBatchSelection[]) => void;
}

interface ManualDraft {
  name: string;
  quantity: number;
  unitPrice: number;
}

/** Normaliza pra busca (case e acento insensível): "Cobre 3/8" ~ "cobre 3/8". */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase()
    .trim();
}

/** Lê "2,5" ou "2.5" como número; vazio/õinválido vira 0. */
function parseQtyInput(raw: string): number {
  if (!raw) return 0;
  const n = parseFloat(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Sheet de seleção em lote de materiais, mobile-first (Drawer no celular,
 * Dialog no desktop, via `ResponsiveModal`). Um toque abre, busca com foco
 * automático, marca quantidade direto na lista, um toque no rodapé adiciona
 * tudo de uma vez.
 *
 * Componente burro: recebe o catálogo por prop, nunca fala com Supabase (a
 * fronteira é o hook do chamador). Devolve só a SELEÇÃO — quem monta o
 * `FormQuoteItem` final (preço, custo, BDI) é sempre o chamador, reusando a
 * mesma função pura do fluxo item-a-item (regra de não-regressão de preço).
 */
export function MaterialBatchPicker({ open, onOpenChange, items, frequentIds = [], onConfirm }: MaterialBatchPickerProps) {
  const { locale, currency } = useAppLocaleContext();
  const tq = MESSAGES[locale].app.crm.quotes;
  // Só pra a unidade padrão ("un") de material sem unidade cadastrada — mesma
  // copy que o seletor de material da OS já usa.
  const tOs = MESSAGES[locale].app.os.stockConsumption;
  const fmt = (v: number) => formatMoney(round2(v), currency, locale);

  const [search, setSearch] = useState('');
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const [manualDrafts, setManualDrafts] = useState<ManualDraft[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Estado interno zera a cada abertura. O foco automático no campo de busca
  // é o ponto central do chamado (o teclado tem que subir sozinho) — o
  // Drawer/Dialog costuma roubar o foco do primeiro elemento focável no frame
  // de abertura, então força de novo logo depois desse frame.
  useEffect(() => {
    if (!open) return;
    setSearch('');
    setQtyMap({});
    setManualDrafts([]);
    const id = setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open]);

  const trimmedSearch = search.trim();
  const normalizedSearch = normalize(trimmedSearch);

  const filteredItems = useMemo(() => {
    if (!trimmedSearch) return items;
    return items.filter((i) => fuzzyIncludesAny([i.name, i.sku, i.category], trimmedSearch));
  }, [items, trimmedSearch]);

  const hasExactMatch = useMemo(() => {
    if (!normalizedSearch) return false;
    return items.some((i) => normalize(i.name) === normalizedSearch);
  }, [items, normalizedSearch]);

  const { frequentGroup, restGroup } = useMemo(() => {
    if (normalizedSearch) return { frequentGroup: [] as InventoryItem[], restGroup: filteredItems };
    const idSet = new Set(frequentIds);
    const frequent = frequentIds
      .map((id) => items.find((i) => i.id === id))
      .filter((i): i is InventoryItem => !!i);
    const rest = items.filter((i) => !idSet.has(i.id));
    return { frequentGroup: frequent, restGroup: rest };
  }, [items, filteredItems, frequentIds, normalizedSearch]);

  const getQty = (id: string) => parseQtyInput(qtyMap[id] ?? '');

  const setQtyFor = (id: string, value: number) => {
    const clamped = Math.max(0, round2(value));
    setQtyMap((prev) => ({ ...prev, [id]: clamped === 0 ? '' : formatQty(clamped) }));
  };

  // Tap no corpo da linha marca com qtd 1 (caso comum, zero fricção). Tap de
  // novo NÃO desmarca — evita perda acidental; pra tirar é só zerar pelo "−".
  const handleRowTap = (id: string) => {
    if (getQty(id) > 0) return;
    setQtyFor(id, 1);
  };

  const manualDraft = useMemo(
    () => manualDrafts.find((d) => normalize(d.name) === normalizedSearch),
    [manualDrafts, normalizedSearch],
  );

  const upsertManualDraft = (patch: Partial<ManualDraft>) => {
    if (!trimmedSearch) return;
    setManualDrafts((prev) => {
      const idx = prev.findIndex((d) => normalize(d.name) === normalizedSearch);
      if (idx === -1) {
        return [...prev, { name: trimmedSearch, quantity: 0, unitPrice: 0, ...patch }];
      }
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const showManualRow = trimmedSearch.length > 0 && !hasExactMatch;
  const nothingToShow = !normalizedSearch && items.length === 0;

  const selectedCount =
    Object.values(qtyMap).filter((v) => parseQtyInput(v) > 0).length +
    manualDrafts.filter((d) => d.quantity > 0).length;

  const selectedTotal =
    Object.entries(qtyMap).reduce((sum, [id, raw]) => {
      const qty = parseQtyInput(raw);
      if (qty <= 0) return sum;
      const item = items.find((i) => i.id === id);
      const price = Number(item?.sale_price ?? item?.cost_price ?? 0);
      return sum + qty * price;
    }, 0) +
    manualDrafts.reduce((sum, d) => (d.quantity > 0 ? sum + d.quantity * d.unitPrice : sum), 0);

  const handleConfirm = () => {
    const selections: MaterialBatchSelection[] = [];
    for (const item of items) {
      const qty = getQty(item.id);
      if (qty > 0) {
        selections.push({
          inventoryId: item.id,
          manualName: null,
          quantity: qty,
          unitPrice: Number(item.sale_price ?? item.cost_price ?? 0),
        });
      }
    }
    for (const d of manualDrafts) {
      if (d.quantity > 0 && d.name.trim()) {
        selections.push({ inventoryId: null, manualName: d.name.trim(), quantity: d.quantity, unitPrice: d.unitPrice });
      }
    }
    if (selections.length === 0) return;
    onConfirm(selections);
    onOpenChange(false);
  };

  const renderRow = (item: InventoryItem) => {
    const qty = getQty(item.id);
    const selected = qty > 0;
    const price = Number(item.sale_price ?? item.cost_price ?? 0);
    // Aqui NÃO mostramos saldo de estoque, de propósito. Orçar não consome
    // estoque: marcar "sem saldo" em tudo que a empresa não estoca é ruído e
    // assusta quem está fechando na rua. Além disso o saldo de `inventory` é
    // o espelho AGREGADO de todos os locais — exibi-lo aqui mostraria número
    // de local que o usuário pode não ter acesso. O que ele precisa pra digitar
    // a quantidade é a UNIDADE (metro, kg, peça).
    const unit = item.unit || tOs.sectionUnit;
    const sublabel = item.sku ? `SKU ${item.sku}` : item.category || null;

    return (
      <div
        key={item.id}
        role="button"
        tabIndex={0}
        onClick={() => handleRowTap(item.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleRowTap(item.id);
          }
        }}
        className={cn(
          'flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
          selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/40',
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.name}</p>
          {sublabel && <p className="truncate text-xs text-muted-foreground">{sublabel}</p>}
          <p className="text-xs text-muted-foreground">{fmt(price)} / {unit}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={() => setQtyFor(item.id, qty - 1)}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <NumericInput
            decimal
            maxDecimals={2}
            value={qtyMap[item.id] ?? ''}
            onValueChange={(v) => setQtyMap((prev) => ({ ...prev, [item.id]: v }))}
            placeholder="0"
            className="h-10 w-14 text-center px-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={() => setQtyFor(item.id, qty + 1)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={tq.materialPickerTitle}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-sm">
            <p className="font-medium">
              {selectedCount === 1
                ? tq.materialPickerSelectedCountOne
                : tq.materialPickerSelectedCount.replace('{count}', String(selectedCount))}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {tq.materialPickerSelectedTotal.replace('{total}', fmt(selectedTotal))}
            </p>
          </div>
          <Button type="button" onClick={handleConfirm} disabled={selectedCount === 0} className="shrink-0">
            {tq.materialPickerConfirm}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="sticky top-0 z-10 -mt-1 border-b bg-background pb-3 pt-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              autoFocus
              inputMode="search"
              enterKeyHint="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tq.materialPickerSearch}
              className="h-11 pl-9"
            />
          </div>
        </div>

        <div className="space-y-3">
          {frequentGroup.length > 0 && (
            <div className="space-y-2">
              <p className="px-1 text-xs font-medium uppercase text-muted-foreground">{tq.materialPickerGroupFrequent}</p>
              <div className="space-y-2">{frequentGroup.map(renderRow)}</div>
            </div>
          )}

          {restGroup.length > 0 && (
            <div className="space-y-2">
              {frequentGroup.length > 0 && (
                <p className="px-1 text-xs font-medium uppercase text-muted-foreground">{tq.materialPickerGroupAll}</p>
              )}
              <div className="space-y-2">{restGroup.map(renderRow)}</div>
            </div>
          )}

          {showManualRow && (
            <div
              className={cn(
                'flex flex-col gap-2 rounded-lg border border-dashed p-3',
                (manualDraft?.quantity ?? 0) > 0 && 'border-primary border-solid bg-primary/10',
              )}
            >
              <p className="text-sm font-medium text-primary">{tq.materialPickerManual.replace('{name}', trimmedSearch)}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Label className="whitespace-nowrap text-xs text-muted-foreground">{tq.materialPickerManualPrice}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={manualDraft?.unitPrice || ''}
                  onChange={(e) => upsertManualDraft({ unitPrice: parseFloat(e.target.value) || 0 })}
                  onPaste={(e) => {
                    const cents = readPastedCents(e);
                    if (cents == null) return;
                    upsertManualDraft({ unitPrice: cents / 100 });
                  }}
                  className="h-9 w-24 text-sm"
                />
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    onClick={() => upsertManualDraft({ quantity: Math.max(0, round2((manualDraft?.quantity ?? 0) - 1)) })}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <NumericInput
                    decimal
                    maxDecimals={2}
                    value={manualDraft && manualDraft.quantity > 0 ? formatQty(manualDraft.quantity) : ''}
                    onValueChange={(v) => upsertManualDraft({ quantity: parseQtyInput(v) })}
                    placeholder="0"
                    className="h-10 w-14 text-center px-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    onClick={() => upsertManualDraft({ quantity: round2((manualDraft?.quantity ?? 0) + 1) })}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {nothingToShow && (
            <EmptyState icon={<Package className="h-8 w-8" />} title={tq.materialPickerEmpty} size="compact" />
          )}
        </div>
      </div>
    </ResponsiveModal>
  );
}

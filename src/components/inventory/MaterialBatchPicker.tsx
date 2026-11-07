import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Minus, Package, Plus, Search, X } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyField } from '@/components/ui/CurrencyField';
import { Label } from '@/components/ui/label';
import { NumericInput } from '@/components/ui/numeric-input';
import { EmptyState } from '@/components/mobile/EmptyState';
import { formatQty } from '@/components/inventory/InventoryMaterialSelect';
import { InventoryItemThumbnail } from '@/components/inventory/InventoryItemThumbnail';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney, getCurrencySymbol } from '@/lib/format';
import { readPastedCents } from '@/lib/money-paste-mask';
import { cn, fuzzyIncludesAny } from '@/lib/utils';
import type { InventoryItem } from '@/hooks/useInventory';

/**
 * Seleção de UM item devolvida pelo picker. `inventoryId` xor `manualName`:
 * quando vem do catálogo, `manualName` é null; quando é material avulso
 * (criado na hora, sem cadastro no estoque), `inventoryId` é null.
 * `unitCost` e `unitPrice` mantêm separados o custo da empresa e o valor
 * cobrado do cliente. `unitPrice` é informativo pro item de catálogo (o preço de venda já
 * cadastrado); quem monta o item final (`buildMaterialItem`) recalcula a
 * partir do próprio `inventory_id` pra garantir que o cálculo não diverge do
 * fluxo antigo — nunca confie só nesse campo pra item de catálogo.
 */
export interface MaterialBatchSelection {
  inventoryId: string | null;
  manualName: string | null;
  quantity: number;
  unitCost: number;
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
  quantityInput: string;
  unitCost: number;
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

const pickerCopy = {
  'pt-br': { description: 'Escolha os materiais, ajuste as quantidades e adicione tudo de uma vez.', selection: 'Sua seleção', emptySelection: 'Sua seleção começa aqui', selectionHint: 'Escolha um material na lista para incluir no orçamento.', catalog: 'Catálogo de materiais', quantity: 'Quantidade', remove: 'Remover', increase: 'Aumentar quantidade de', decrease: 'Diminuir quantidade de', manual: 'Material avulso', total: 'Total dos materiais', unit: 'por unidade' },
  en: { description: 'Choose materials, adjust quantities and add them all at once.', selection: 'Your selection', emptySelection: 'Your selection starts here', selectionHint: 'Choose a material from the list to include in the quote.', catalog: 'Materials catalog', quantity: 'Quantity', remove: 'Remove', increase: 'Increase quantity of', decrease: 'Decrease quantity of', manual: 'Custom material', total: 'Materials total', unit: 'per unit' },
  es: { description: 'Elija materiales, ajuste las cantidades y agréguelos todos a la vez.', selection: 'Su selección', emptySelection: 'Su selección comienza aquí', selectionHint: 'Elija un material de la lista para incluirlo en el presupuesto.', catalog: 'Catálogo de materiales', quantity: 'Cantidad', remove: 'Eliminar', increase: 'Aumentar cantidad de', decrease: 'Disminuir cantidad de', manual: 'Material sin registrar', total: 'Total de materiales', unit: 'por unidad' },
  fr: { description: 'Choisissez les matériaux, ajustez les quantités et ajoutez-les en une fois.', selection: 'Votre sélection', emptySelection: 'Votre sélection commence ici', selectionHint: 'Choisissez un matériau dans la liste pour l’inclure dans le devis.', catalog: 'Catalogue de matériaux', quantity: 'Quantité', remove: 'Supprimer', increase: 'Augmenter la quantité de', decrease: 'Diminuer la quantité de', manual: 'Matériau personnalisé', total: 'Total des matériaux', unit: 'par unité' },
};

function MaterialPhoto({ src, name, small = false }: { src?: string | null; name: string; small?: boolean }) {
  return (
    <InventoryItemThumbnail imageUrl={src} name={name} fit="contain" fallbackVariant="plain"
      className={cn('border-0 bg-zinc-100 dark:bg-zinc-900 [&_svg]:text-zinc-400 dark:[&_svg]:text-zinc-500', small ? 'h-11 w-11' : 'h-16 w-16 sm:h-20 sm:w-20 [&_svg]:h-7 [&_svg]:w-7')} />
  );
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
  const copy = pickerCopy[locale];
  // Só pra a unidade padrão ("un") de material sem unidade cadastrada — mesma
  // copy que o seletor de material da OS já usa.
  const tOs = MESSAGES[locale].app.os.stockConsumption;
  const fmt = (v: number) => formatMoney(round2(v), currency, locale);
  const currencySymbol = getCurrencySymbol(currency, locale);

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
        return [...prev, { name: trimmedSearch, quantity: 0, quantityInput: '', unitCost: 0, unitPrice: 0, ...patch }];
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

  const selectedEntries = [
    ...items.filter(item => getQty(item.id) > 0).map(item => ({
      id: item.id, name: item.name, imageUrl: item.image_url,
      quantity: getQty(item.id), unit: item.unit || tOs.sectionUnit,
      price: Number(item.sale_price ?? item.cost_price ?? 0), manual: false,
    })),
    ...manualDrafts.filter(draft => draft.quantity > 0).map(draft => ({
      id: draft.name, name: draft.name, imageUrl: null,
      quantity: draft.quantity, unit: tOs.sectionUnit, price: draft.unitPrice, manual: true,
    })),
  ];

  const removeSelected = (id: string, manual: boolean) => {
    if (manual) setManualDrafts(previous => previous.filter(draft => draft.name !== id));
    else setQtyFor(id, 0);
  };

  const selectionList = (
    <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
      {selectedEntries.map(entry => (
        <li key={`${entry.manual ? 'manual' : 'catalog'}-${entry.id}`} className="flex items-start gap-3 py-4">
          <MaterialPhoto src={entry.imageUrl} name={entry.name} small />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="break-words text-sm font-semibold leading-snug">{entry.name}</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{formatQty(entry.quantity)} {entry.unit} × {fmt(entry.price)}</p>
            {entry.manual && <p className="text-xs text-zinc-500 dark:text-zinc-400">{copy.manual}</p>}
            <p className="break-words text-sm font-bold tabular-nums">{fmt(entry.quantity * entry.price)}</p>
          </div>
          <Button type="button" variant="destructive-ghost" size="icon" className="-mr-2 -mt-1 h-9 w-9 shrink-0" aria-label={`${copy.remove} ${entry.name}`} onClick={() => removeSelected(entry.id, entry.manual)}>
            <X className="h-4 w-4" />
          </Button>
        </li>
      ))}
    </ul>
  );

  const handleConfirm = () => {
    const selections: MaterialBatchSelection[] = [];
    for (const item of items) {
      const qty = getQty(item.id);
      if (qty > 0) {
        selections.push({
          inventoryId: item.id,
          manualName: null,
          quantity: qty,
          unitCost: Number(item.cost_price ?? 0),
          unitPrice: Number(item.sale_price ?? item.cost_price ?? 0),
        });
      }
    }
    for (const d of manualDrafts) {
      if (d.quantity > 0 && d.name.trim()) {
        selections.push({
          inventoryId: null,
          manualName: d.name.trim(),
          quantity: d.quantity,
          unitCost: d.unitCost,
          unitPrice: d.unitPrice,
        });
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
        className={cn(
          'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 border-b border-zinc-200 py-5 transition-colors dark:border-zinc-800 sm:gap-x-5',
          selected && 'border-primary',
        )}
      >
        <button type="button" aria-label={`${tq.materialPickerConfirm}: ${item.name}`} aria-pressed={selected} onClick={() => handleRowTap(item.id)} className="col-span-2 flex min-w-0 items-center gap-4 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 dark:focus-visible:ring-zinc-100 sm:col-span-1">
          <span className="relative shrink-0">
            <MaterialPhoto src={item.image_url} name={item.name} />
            {selected && <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-3.5 w-3.5" aria-hidden="true" /></span>}
          </span>
          <span className="min-w-0 space-y-1.5">
            <span className="block break-words text-base font-semibold leading-snug sm:text-lg">{item.name}</span>
            {sublabel && <span className="block break-words text-xs text-zinc-500 dark:text-zinc-400 sm:text-sm">{sublabel}</span>}
            <span className="block text-sm font-medium tabular-nums text-zinc-700 dark:text-zinc-200">{fmt(price)} <span className="font-normal text-zinc-500 dark:text-zinc-400">/ {unit}</span></span>
          </span>
        </button>
        <div className="col-span-2 flex flex-wrap items-center justify-between gap-3 pl-20 sm:col-span-1 sm:flex-col sm:items-end sm:gap-2 sm:pl-0">
          <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`${copy.decrease} ${item.name}`}
            className="h-11 w-11 shrink-0"
            disabled={qty <= 0}
            onClick={() => setQtyFor(item.id, qty - 1)}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <NumericInput
            decimal
            maxDecimals={2}
            aria-label={`${copy.quantity} de ${item.name}`}
            value={qtyMap[item.id] ?? ''}
            onValueChange={(v) => setQtyMap((prev) => ({ ...prev, [item.id]: v }))}
            placeholder="0"
            className="h-11 w-14 border-x-0 border-t-0 rounded-none px-1 text-center text-base font-semibold"
          />
          <Button
            type="button"
            size="icon"
            aria-label={`${copy.increase} ${item.name}`}
            className="h-11 w-11 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setQtyFor(item.id, qty + 1)}
          >
            <Plus className="h-4 w-4" />
          </Button>
          </div>
          {selected && <p className="text-right text-sm font-bold tabular-nums">{fmt(qty * price)}</p>}
        </div>
      </div>
    );
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={tq.materialPickerTitle}
      className="sm:h-[min(88dvh,900px)] sm:!max-w-[min(1280px,calc(100vw-3rem))] sm:p-7 [&_h2]:text-xl sm:[&_h2]:text-2xl"
      drawerClassName="h-[94dvh] max-h-[94dvh]"
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1 sm:justify-start">
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 sm:text-base">
              {selectedCount === 1
                ? tq.materialPickerSelectedCountOne
                : tq.materialPickerSelectedCount.replace('{count}', String(selectedCount))}
            </p>
            <p className="break-words text-lg font-bold tabular-nums text-zinc-950 dark:text-zinc-50 sm:text-xl">
              {tq.materialPickerSelectedTotal.replace('{total}', fmt(selectedTotal))}
            </p>
          </div>
          <Button type="button" onClick={handleConfirm} disabled={selectedCount === 0} className="h-[3.25rem] w-full shrink-0 bg-primary px-7 text-base font-bold text-primary-foreground hover:bg-primary/90 sm:h-14 sm:w-auto">
            <Plus className="h-5 w-5" />
            {tq.materialPickerConfirm}
          </Button>
        </div>
      }
    >
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-9">
      <div className="min-w-0">
        <div className="sticky top-0 z-10 -mt-1 bg-background pb-4 pt-1">
          <p className="mb-4 hidden text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 sm:block">{copy.description}</p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500 dark:text-zinc-400" />
            <Input
              ref={searchInputRef}
              autoFocus
              inputMode="search"
              enterKeyHint="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tq.materialPickerSearch}
              className="h-[3.25rem] rounded-lg border-zinc-300 bg-zinc-50 pl-12 pr-4 text-base dark:border-zinc-700 dark:bg-zinc-900 sm:h-14"
            />
          </div>
        </div>

        {selectedCount > 0 && (
          <details className="mb-5 border-y border-zinc-200 dark:border-zinc-800 lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-semibold">
              <span>{copy.selection} ({selectedCount})</span><ChevronDown className="h-4 w-4" />
            </summary>
            {selectionList}
          </details>
        )}

        <div className="space-y-6">
          {frequentGroup.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-bold tracking-wide text-zinc-600 dark:text-zinc-400">{tq.materialPickerGroupFrequent}</p>
              <div>{frequentGroup.map(renderRow)}</div>
            </div>
          )}

          {restGroup.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-bold tracking-wide text-zinc-600 dark:text-zinc-400">{frequentGroup.length > 0 ? tq.materialPickerGroupAll : copy.catalog}</p>
              <div>{restGroup.map(renderRow)}</div>
            </div>
          )}

          {showManualRow && (
            <div
              className={cn(
                'flex flex-col gap-5 rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700 sm:p-5',
                (manualDraft?.quantity ?? 0) > 0 && 'border-primary border-solid',
              )}
            >
              <div className="flex items-center gap-3"><Package className="h-5 w-5 shrink-0" /><p className="break-words text-base font-semibold">{tq.materialPickerManual.replace('{name}', trimmedSearch)}</p></div>
              <div className="flex flex-wrap items-end gap-x-4 gap-y-5">
                <div className="space-y-1">
                  <Label className="block whitespace-nowrap text-sm font-semibold text-foreground">{tq.serviceColUnitCost}</Label>
                  <CurrencyField symbol={currencySymbol} className="w-32">
                  <Input
                    aria-label={`${tq.serviceColUnitCost} de ${trimmedSearch}`}
                    type="number"
                    min={0}
                    step="0.01"
                    value={manualDraft?.unitCost || ''}
                    onChange={(e) => upsertManualDraft({ unitCost: parseFloat(e.target.value) || 0 })}
                    className="h-11 text-right text-base"
                  />
                  </CurrencyField>
                </div>
                <div className="space-y-1">
                  <Label className="block whitespace-nowrap text-sm font-semibold text-foreground">{tq.materialPickerManualPrice}</Label>
                  <CurrencyField symbol={currencySymbol} className="w-32">
                  <Input
                    aria-label={`${tq.materialPickerManualPrice} de ${trimmedSearch}`}
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
                    className="h-11 text-right text-base"
                  />
                  </CurrencyField>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    aria-label={`${copy.decrease} ${trimmedSearch}`}
                    onClick={() => {
                      const quantity = Math.max(0, round2((manualDraft?.quantity ?? 0) - 1));
                      upsertManualDraft({ quantity, quantityInput: quantity > 0 ? formatQty(quantity) : '' });
                    }}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <NumericInput
                    decimal
                    maxDecimals={2}
                    aria-label={`${copy.quantity} de ${trimmedSearch}`}
                    value={manualDraft?.quantityInput ?? ''}
                    onValueChange={(v) => upsertManualDraft({ quantity: parseQtyInput(v), quantityInput: v })}
                    placeholder="0"
                    className="h-10 w-14 text-center px-1"
                  />
                  <Button
                    type="button"
                    size="icon"
                    aria-label={`${copy.increase} ${trimmedSearch}`}
                    className="h-11 w-11 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => {
                      const quantity = round2((manualDraft?.quantity ?? 0) + 1);
                      upsertManualDraft({ quantity, quantityInput: formatQty(quantity) });
                    }}
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
      <aside className="hidden min-w-0 border-l border-zinc-200 pl-7 dark:border-zinc-800 lg:block">
        <div className="sticky top-0 space-y-5 pt-1">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
            <h3 className="text-xl font-bold tracking-tight">{copy.selection}</h3>
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-2 text-sm font-bold text-primary-foreground">{selectedCount}</span>
          </div>
          {selectedCount > 0 ? <div className="max-h-[47dvh] overflow-y-auto pr-1">{selectionList}</div> : (
            <div className="space-y-3 py-10 text-center">
              <Package className="mx-auto h-9 w-9 text-zinc-300 dark:text-zinc-700" aria-hidden="true" />
              <p className="font-semibold text-zinc-800 dark:text-zinc-100">{copy.emptySelection}</p>
              <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">{copy.selectionHint}</p>
            </div>
          )}
          <div className="space-y-1 border-t border-zinc-200 pt-5 dark:border-zinc-800">
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{copy.total}</p>
            <p className="break-words text-2xl font-bold tracking-tight tabular-nums text-zinc-950 dark:text-zinc-50">{fmt(selectedTotal)}</p>
          </div>
        </div>
      </aside>
      </div>
    </ResponsiveModal>
  );
}

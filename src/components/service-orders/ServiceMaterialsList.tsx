import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NumericInput, parseDecimalInputValue } from '@/components/ui/numeric-input';
import { CurrencyField } from '@/components/ui/CurrencyField';
import { InventoryItemThumbnail } from '@/components/inventory/InventoryItemThumbnail';
import { Label } from '@/components/ui/label';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useInventory } from '@/hooks/useInventory';
import { useServiceMaterials, type ServiceMaterial } from '@/hooks/useServiceMaterials';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { formatMoney, getCurrencySymbol } from '@/lib/format';
import { MESSAGES } from '@/lib/i18n/messages';
import { unitLabel } from '@/lib/inventoryUnits';
import {
  isServiceMaterialCostOverride,
  materialBdiTotal,
  materialBdiUnitValue,
  sortServiceMaterials,
  type ServiceMaterialSortDirection,
  type ServiceMaterialSortKey,
} from '@/lib/serviceMaterialTable';

interface Props {
  serviceId: string;
  /** Fator calculado pela fonte canônica do BDI em ServiceCostsTab. */
  bdiFactor: number;
}

interface SortableHeadProps {
  label: string;
  sortKey: ServiceMaterialSortKey;
  activeKey: ServiceMaterialSortKey;
  direction: ServiceMaterialSortDirection;
  onSort: (key: ServiceMaterialSortKey) => void;
  className?: string;
}

function SortableHead({ label, sortKey, activeKey, direction, onSort, className }: SortableHeadProps) {
  const active = activeKey === sortKey;
  const ariaSort = active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none';
  const Icon = !active ? ArrowUpDown : direction === 'asc' ? ArrowUp : ArrowDown;

  return (
    <TableHead className={className} aria-sort={ariaSort}>
      <button
        type="button"
        className="inline-flex w-full items-center gap-1.5 whitespace-nowrap text-left font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => onSort(sortKey)}
        aria-label={`Ordenar por ${label}. ${active ? `Ordem atual: ${direction === 'asc' ? 'crescente' : 'decrescente'}.` : 'Sem ordenação ativa.'}`}
      >
        {label}
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </button>
    </TableHead>
  );
}

function toRawDecimal(value: number | null | undefined): string {
  return value == null ? '' : String(value).replace('.', ',');
}

function keepExistingDrafts(
  previous: Record<string, string>,
  materials: ServiceMaterial[],
  value: (material: ServiceMaterial) => number | null | undefined,
): Record<string, string> {
  const next = Object.fromEntries(
    materials.map((material) => [material.id, previous[material.id] ?? toRawDecimal(value(material))]),
  );
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  const unchanged = previousKeys.length === nextKeys.length
    && nextKeys.every((key) => previous[key] === next[key]);
  return unchanged ? previous : next;
}

export function ServiceMaterialsList({ serviceId, bdiFactor }: Props) {
  const { locale, currency } = useAppLocaleContext();
  const currencySymbol = getCurrencySymbol(currency, locale);
  const money = (value: number) => formatMoney(value, currency, locale);
  const t = MESSAGES[locale].app.os.serviceMaterials;
  const { items } = useInventory();
  const {
    materials,
    isLoading,
    error,
    createMaterial,
    updateMaterial,
    deleteMaterial,
    totalCost,
  } = useServiceMaterials(serviceId);

  const [stockItemId, setStockItemId] = useState('');
  const [manualName, setManualName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [quantityText, setQuantityText] = useState('1');
  const [purchasePriceText, setPurchasePriceText] = useState('0');
  const [rowQtyText, setRowQtyText] = useState<Record<string, string>>({});
  const [rowCostText, setRowCostText] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<ServiceMaterialSortKey>('material');
  const [sortDirection, setSortDirection] = useState<ServiceMaterialSortDirection>('asc');

  useEffect(() => {
    setRowQtyText((previous) => keepExistingDrafts(previous, materials, (material) => material.quantity));
    setRowCostText((previous) => keepExistingDrafts(previous, materials, (material) => material.purchase_price));
  }, [materials]);

  const inventoryOptions = useMemo(
    () => (items ?? []).map((item) => ({
      value: item.id,
      label: item.name,
      sublabel: item.sku ? `SKU: ${item.sku}` : undefined,
      icon: <InventoryItemThumbnail name={item.name} imageUrl={item.image_url} fit="contain" fallbackVariant="plain" className="h-9 w-9 bg-muted/30" />,
    })),
    [items],
  );

  const selectedInv = useMemo(
    () => (items ?? []).find((item) => item.id === stockItemId) ?? null,
    [items, stockItemId],
  );

  const inventoryById = useMemo(
    () => new Map((items ?? []).map((item) => [item.id, item])),
    [items],
  );

  const sortedMaterials = useMemo(
    () => sortServiceMaterials(materials, sortKey, sortDirection, bdiFactor),
    [materials, sortKey, sortDirection, bdiFactor],
  );

  const overriddenMaterials = useMemo(
    () => materials.filter((material) => {
      if (!material.stock_item_id) return false;
      const canonicalCost = inventoryById.get(material.stock_item_id)?.cost_price;
      return isServiceMaterialCostOverride(material.purchase_price, canonicalCost);
    }),
    [inventoryById, materials],
  );

  const totalWithBdi = materialBdiTotal(materials, bdiFactor);

  const addMaterial = async () => {
    const isFromStock = !!stockItemId;
    const name = isFromStock ? (selectedInv?.name ?? '') : manualName;
    if (!name.trim()) return;

    const unit = selectedInv?.unit ?? 'un';
    const price = isFromStock ? Number(selectedInv?.cost_price ?? 0) : purchasePrice;

    await createMaterial.mutateAsync({
      stock_item_id: isFromStock ? stockItemId : null,
      item_name: name,
      unit,
      quantity,
      purchase_price: price,
      sale_price: null,
      sort_order: 0,
    });

    setStockItemId('');
    setManualName('');
    setQuantity(1);
    setQuantityText('1');
    setPurchasePrice(0);
    setPurchasePriceText('0');
  };

  const handleQuantityText = (raw: string) => {
    setQuantityText(raw);
    setQuantity(parseDecimalInputValue(raw) ?? 0);
  };

  const handleSort = (nextKey: ServiceMaterialSortKey) => {
    if (nextKey === sortKey) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(nextKey);
    setSortDirection('asc');
  };

  const commitQuantity = (material: ServiceMaterial) => {
    const raw = rowQtyText[material.id] ?? toRawDecimal(material.quantity);
    const quantityValue = parseDecimalInputValue(raw) ?? 0;
    if (quantityValue === Number(material.quantity)) return;

    updateMaterial.mutate(
      { id: material.id, quantity: quantityValue },
      { onError: () => setRowQtyText((current) => ({ ...current, [material.id]: toRawDecimal(material.quantity) })) },
    );
  };

  const commitCost = (material: ServiceMaterial) => {
    const raw = rowCostText[material.id] ?? toRawDecimal(material.purchase_price);
    const costValue = parseDecimalInputValue(raw) ?? 0;
    if (costValue === Number(material.purchase_price)) return;

    updateMaterial.mutate(
      { id: material.id, purchase_price: costValue },
      { onError: () => setRowCostText((current) => ({ ...current, [material.id]: toRawDecimal(material.purchase_price) })) },
    );
  };

  const commitOnEnter = (event: KeyboardEvent<HTMLInputElement>, commit: () => void) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    }
  };

  const restoreCanonicalCost = (material: ServiceMaterial, canonicalCost: number) => {
    setRowCostText((current) => ({ ...current, [material.id]: toRawDecimal(canonicalCost) }));
    updateMaterial.mutate({ id: material.id, purchase_price: canonicalCost });
  };

  const renderUnitSuffix = (unit: string | null | undefined): ReactNode => (
    <span className="whitespace-nowrap text-xs text-muted-foreground">/ {unitLabel(unit)}</span>
  );

  return (
    <Card className="border-0 bg-background/80 shadow-sm">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{t.sectionTitle}</p>
            <p className="text-xs text-muted-foreground">{t.sectionSubtitle}</p>
          </div>
          <div className="flex flex-wrap items-end justify-end gap-x-5 gap-y-2 text-right">
            <div>
              <p className="text-xs text-muted-foreground">Seu custo total</p>
              <p className="text-sm font-semibold text-foreground">{money(totalCost)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cliente paga com BDI</p>
              <p className="text-sm font-semibold text-foreground">{money(totalWithBdi)}</p>
            </div>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          “Seu custo” é o que sai da empresa para comprar o insumo. “Cliente paga com BDI” é a referência de venda com imposto, administração e lucro aplicados.
        </p>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <div className="space-y-1.5 lg:col-span-2">
            <Label className="text-xs">{t.labelStockItem}</Label>
            <SearchableSelect
              options={inventoryOptions}
              value={stockItemId}
              onValueChange={setStockItemId}
              placeholder={t.placeholderStockItem}
            />
            {!stockItemId && (
              <div className="pt-2">
                <Label className="text-xs">{t.labelManualName}</Label>
                <Input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder={t.placeholderManualName} />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t.labelQuantity}</Label>
            <NumericInput decimal value={quantityText} onValueChange={handleQuantityText} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t.labelUnitCost}</Label>
            <div className="flex items-center gap-2">
              <CurrencyField symbol={currencySymbol} className="w-40 shrink-0">
                <NumericInput
                  decimal
                  className="text-right"
                  value={stockItemId ? toRawDecimal(selectedInv?.cost_price) : purchasePriceText}
                  onValueChange={(raw) => {
                    setPurchasePriceText(raw);
                    setPurchasePrice(parseDecimalInputValue(raw) ?? 0);
                  }}
                  disabled={!!stockItemId}
                  aria-describedby={stockItemId ? 'canonical-purchase-cost-help' : undefined}
                />
              </CurrencyField>
              {renderUnitSuffix(selectedInv?.unit ?? 'un')}
            </div>
            {stockItemId && (
              <p id="canonical-purchase-cost-help" className="text-xs text-muted-foreground">
                Custo de compra atual do estoque.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" className="h-11 bg-primary font-semibold text-primary-foreground hover:bg-primary/90" onClick={addMaterial} disabled={createMaterial.isPending}>
            <Plus className="mr-2 h-4 w-4" />
            {t.btnAdd}
          </Button>
        </div>

        {overriddenMaterials.length > 0 && (
          <NoticeBanner variant="warning" title="Custo de compra sobrescrito">
            {overriddenMaterials.length === 1
              ? '1 insumo usa um custo manual e deixou de acompanhar automaticamente o custo de compra do estoque. O BDI continua sendo aplicado sobre o valor informado.'
              : `${overriddenMaterials.length} insumos usam custo manual e deixaram de acompanhar automaticamente o custo de compra do estoque. O BDI continua sendo aplicado sobre os valores informados.`}
          </NoticeBanner>
        )}

        {isLoading ? (
          <div className="rounded-xl bg-muted/30 p-6 text-center text-sm text-muted-foreground">Carregando insumos…</div>
        ) : error ? (
          <div className="rounded-xl bg-muted/30 p-6 text-center text-sm text-destructive">Não foi possível carregar os insumos.</div>
        ) : materials.length === 0 ? (
          <div className="rounded-xl bg-muted/30 p-6 text-center text-sm text-muted-foreground">{t.emptyState}</div>
        ) : (
          <div className="overflow-x-auto rounded-xl bg-muted/20">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label={t.colMaterial} sortKey="material" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortableHead label={t.colQty} sortKey="quantity" activeKey={sortKey} direction={sortDirection} onSort={handleSort} className="w-[170px]" />
                  <SortableHead label="Seu custo unit." sortKey="unit_cost" activeKey={sortKey} direction={sortDirection} onSort={handleSort} className="w-[210px]" />
                  <SortableHead label="Cliente paga / un. (BDI)" sortKey="bdi_value" activeKey={sortKey} direction={sortDirection} onSort={handleSort} className="w-[190px]" />
                  <SortableHead label="Seu custo total" sortKey="subtotal" activeKey={sortKey} direction={sortDirection} onSort={handleSort} className="w-[150px]" />
                  <TableHead className="w-[70px]"><span className="sr-only">Ações</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedMaterials.map((material) => {
                  const linkedItem = material.stock_item_id ? inventoryById.get(material.stock_item_id) : undefined;
                  const canonicalCost = linkedItem?.cost_price;
                  const overridden = !!material.stock_item_id
                    && isServiceMaterialCostOverride(material.purchase_price, canonicalCost);
                  const bdiUnitValue = materialBdiUnitValue(material.purchase_price, bdiFactor);
                  const readableUnit = unitLabel(material.unit);

                  return (
                    <TableRow key={material.id}>
                      <TableCell>
                        <div className="flex min-w-[160px] items-center gap-3">
                          <InventoryItemThumbnail name={material.item_name} imageUrl={linkedItem?.image_url} fit="contain" fallbackVariant="plain" className="h-11 w-11 bg-muted/30" />
                          <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">{material.item_name}</p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">{readableUnit}</span>
                            {!material.stock_item_id && <Badge variant="secondary">Manual</Badge>}
                            {overridden && <Badge className="bg-warning text-warning-foreground hover:bg-warning">Override manual</Badge>}
                          </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-[145px] items-center gap-2">
                          <NumericInput
                            decimal
                            value={rowQtyText[material.id] ?? toRawDecimal(material.quantity)}
                            onValueChange={(raw) => setRowQtyText((current) => ({ ...current, [material.id]: raw }))}
                            onBlur={() => commitQuantity(material)}
                            onKeyDown={(event) => commitOnEnter(event, () => commitQuantity(material))}
                            disabled={updateMaterial.isPending}
                            aria-label={`Quantidade de ${material.item_name} em ${readableUnit}`}
                          />
                          <span className="whitespace-nowrap text-xs text-muted-foreground">{readableUnit}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="min-w-[185px] space-y-1.5">
                          <div className="flex items-center gap-2">
                            <CurrencyField symbol={currencySymbol} className="w-40 shrink-0">
                              <NumericInput
                                decimal
                                className="text-right"
                                value={rowCostText[material.id] ?? toRawDecimal(material.purchase_price)}
                                onValueChange={(raw) => setRowCostText((current) => ({ ...current, [material.id]: raw }))}
                                onBlur={() => commitCost(material)}
                                onKeyDown={(event) => commitOnEnter(event, () => commitCost(material))}
                                disabled={updateMaterial.isPending}
                                aria-label={`Custo unitário de ${material.item_name}`}
                              />
                            </CurrencyField>
                            {renderUnitSuffix(material.unit)}
                          </div>
                          {overridden && canonicalCost != null && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs font-medium text-warning hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() => restoreCanonicalCost(material, Number(canonicalCost))}
                              disabled={updateMaterial.isPending}
                              aria-label={`Restaurar custo de compra de ${material.item_name}: ${money(Number(canonicalCost))} por ${readableUnit}`}
                            >
                              <RotateCcw className="h-3 w-3" aria-hidden="true" />
                              Restaurar {money(Number(canonicalCost))}
                            </button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="min-w-[155px]">
                          <p className="text-sm font-semibold text-foreground">{money(bdiUnitValue)} {renderUnitSuffix(material.unit)}</p>
                          <p className="text-xs text-muted-foreground">Total: {money(Number(material.quantity) * bdiUnitValue)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm font-semibold">{money(Number(material.subtotal ?? 0))}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="destructive-ghost"
                          size="icon"
                          onClick={() => deleteMaterial.mutate(material.id)}
                          className="h-8 w-8"
                          disabled={deleteMaterial.isPending}
                          aria-label={`Remover ${material.item_name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-semibold">Totais</TableCell>
                  <TableCell className="whitespace-nowrap font-semibold">{money(totalWithBdi)}</TableCell>
                  <TableCell className="whitespace-nowrap font-semibold">{money(totalCost)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

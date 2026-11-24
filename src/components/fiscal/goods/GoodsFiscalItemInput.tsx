import { useAppLocaleContext } from "@/contexts/AppLocaleContext";
import { useMemo, useRef, useState } from "react";
import { HelpCircle, Percent, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatMoney } from "@/lib/format";
import type { InventoryItem } from "@/hooks/useInventory";
import type { GoodsDirection, GoodsFiscalItem } from "@/hooks/useGoodsFiscal";

type DiscountMode = "amount" | "percent";

const parseDecimal = (value: string) => {
  const trimmed = value.trim();
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: number) => Math.round(value * 100) / 100;
const digits = (value: string | null | undefined) => String(value ?? "").replace(/\D/g, "");
const maskNcm = (value: string) => {
  const raw = digits(value).slice(0, 8);
  return [raw.slice(0, 4), raw.slice(4, 6), raw.slice(6, 8)].filter(Boolean).join(".");
};


export function GoodsFiscalItemInput({
  inventory,
  direction,
  onAddItem,
}: {
  inventory: InventoryItem[];
  direction: GoodsDirection;
  onAddItem: (item: GoodsFiscalItem) => void;
}) {
  const { locale } = useAppLocaleContext();
  const [materialId, setMaterialId] = useState("");
  const [ncm, setNcm] = useState("");
  const [cfop, setCfop] = useState("");
  const [unit, setUnit] = useState("UN");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [discount, setDiscount] = useState("");
  const [discountMode, setDiscountMode] = useState<DiscountMode>("amount");
  const materialRef = useRef<HTMLButtonElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const unitPriceRef = useRef<HTMLInputElement>(null);

  const material = inventory.find((entry) => entry.id === materialId);
  const quantityNumber = parseDecimal(quantity);
  const unitPriceNumber = parseDecimal(unitPrice);
  const gross = money(quantityNumber * unitPriceNumber);
  const discountInput = parseDecimal(discount);
  const discountNumber = Math.min(
    discountMode === "percent" ? money((gross * discountInput) / 100) : discountInput,
    gross,
  );
  const net = money(Math.max(0, gross - discountNumber));
  const options = useMemo(
    () =>
      inventory
        .filter((entry) => !entry.archived_at)
        .map((entry) => ({
          value: entry.id,
          label: entry.name,
          sublabel: [entry.sku ? `SKU ${entry.sku}` : null, entry.unit].filter(Boolean).join(" · "),
          keywords: [entry.sku, entry.category].filter((value): value is string => !!value),
        })),
    [inventory],
  );

  const selectMaterial = (id: string) => {
    const selected = inventory.find((entry) => entry.id === id);
    if (!selected) return;
    setMaterialId(id);
    setNcm(digits(selected.fiscal_ncm));
    setUnit(selected.unit || "UN");
    const selectedCfop =
      direction === "entrada"
        ? selected.fiscal_cfop_entry_internal
        : selected.fiscal_cfop_exit_internal ?? selected.fiscal_cfop_internal;
    setCfop(digits(selectedCfop));
    const price = direction === "entrada" ? selected.cost_price : selected.sale_price ?? selected.cost_price;
    setUnitPrice(price ? String(price).replace(".", ",") : "");
    requestAnimationFrame(() => {
      quantityRef.current?.focus();
      quantityRef.current?.select();
    });
  };

  const add = () => {
    if (!material || quantityNumber <= 0 || unitPriceNumber < 0) {
      toast.error("Selecione o material e informe quantidade e valor válidos.", { position: "top-center" });
      return;
    }
    if (digits(ncm).length !== 8) {
      toast.error("Informe o NCM completo com 8 dígitos.", { position: "top-center" });
      return;
    }
    if (digits(cfop).length !== 4) {
      toast.error("Informe um CFOP válido com 4 dígitos.", { position: "top-center" });
      return;
    }
    const fiscalCfop = digits(cfop);
    onAddItem({
      id: crypto.randomUUID(),
      inventoryId: material.id,
      description: material.name,
      quantity: quantityNumber,
      unitPrice: unitPriceNumber,
      discount: discountNumber,
      total: net,
      unit: unit.trim().toUpperCase() || "UN",
      ncm: digits(ncm),
      cest: material.fiscal_cest,
      gtin: material.fiscal_gtin,
      origin: material.fiscal_origin,
      cfopEntryInternal: direction === "entrada" ? fiscalCfop : material.fiscal_cfop_entry_internal,
      cfopEntryInterstate:
        direction === "entrada"
          ? material.fiscal_cfop_entry_interstate
          : material.fiscal_cfop_entry_interstate,
      cfopExitInternal: direction === "saida" ? fiscalCfop : material.fiscal_cfop_exit_internal ?? material.fiscal_cfop_internal,
      cfopExitInterstate:
        direction === "saida"
          ? material.fiscal_cfop_exit_interstate ?? material.fiscal_cfop_interstate
          : material.fiscal_cfop_exit_interstate ?? material.fiscal_cfop_interstate,
      icmsCode: material.fiscal_icms_code,
      icmsRate: material.fiscal_icms_rate,
      icmsReductionRate: material.fiscal_icms_reduction_rate,
      pisCst: material.fiscal_pis_cst,
      cofinsCst: material.fiscal_cofins_cst,
      pisRate: material.fiscal_pis_rate,
      cofinsRate: material.fiscal_cofins_rate,
      ipiCst: material.fiscal_ipi_cst,
      ipiRate: material.fiscal_ipi_rate,
      taxUnit: material.fiscal_tax_unit,
      ibsCbsCst: material.fiscal_ibs_cbs_cst,
    });
    toast.success("Item adicionado!", { position: "top-center" });
    setMaterialId("");
    setNcm("");
    setCfop("");
    setUnit("UN");
    setQuantity("");
    setUnitPrice("");
    setDiscount("");
    setDiscountMode("amount");
    requestAnimationFrame(() => materialRef.current?.focus());
  };

  return (
    <Card data-qa="nfe-item-input-card" className="border border-border/60 bg-background shadow-none">
      <div className="space-y-3 p-3 sm:p-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Material</Label>
          <SearchableSelect
            options={options}
            value={materialId}
            onValueChange={selectMaterial}
            placeholder="Escreva o nome ou código do material"
            searchPlaceholder="Buscar material..."
            emptyMessage="Nenhum material encontrado."
            triggerRef={materialRef}
            focusSearchOnOpen
            className="h-10 bg-background"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="goods-item-cfop" className="text-xs text-muted-foreground">CFOP</Label>
          <Input
            id="goods-item-cfop"
            value={cfop}
            onChange={(event) => setCfop(digits(event.target.value).slice(0, 4))}
            placeholder="Ex.: 5102 — venda de mercadoria adquirida de terceiros"
            inputMode="numeric"
            className="h-11 bg-background"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(170px,1.15fr)_minmax(0,1fr)]">
          <div className="space-y-1.5">
            <Label htmlFor="goods-item-ncm" className="text-xs text-muted-foreground">NCM</Label>
            <div className="flex gap-1">
              <Input
                id="goods-item-ncm"
                value={maskNcm(ncm)}
                onChange={(event) => setNcm(digits(event.target.value).slice(0, 8))}
                placeholder="0000.00.00"
                inputMode="numeric"
                className={digits(ncm).length !== 8 ? "h-10 border-amber-500 bg-background" : "h-10 bg-background"}
              />
              <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0" title="O NCM vem do cadastro do material">
                <HelpCircle className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-[64px_minmax(0,0.9fr)_minmax(0,1.15fr)] gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="goods-item-unit" className="text-xs text-muted-foreground">UN</Label>
              <Input id="goods-item-unit" value={unit} onChange={(event) => setUnit(event.target.value)} className="h-10 px-2" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goods-item-quantity" className="text-xs text-muted-foreground">Qtd</Label>
              <Input
                id="goods-item-quantity"
                ref={quantityRef}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                className="h-10 px-2"
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  if (unitPrice.trim()) add();
                  else unitPriceRef.current?.focus();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goods-item-price" className="text-xs text-muted-foreground">Valor</Label>
              <Input
                id="goods-item-price"
                ref={unitPriceRef}
                value={unitPrice}
                onChange={(event) => setUnitPrice(event.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                className="h-10 px-2"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    add();
                  }
                }}
              />
            </div>
          </div>
        </div>
        <div className="space-y-2 min-[380px]:grid min-[380px]:grid-cols-[minmax(0,1fr)_140px] min-[380px]:items-end min-[380px]:gap-3 min-[380px]:space-y-0">
          <div className="flex items-center justify-between gap-3">
            <Label className="flex items-center gap-1 text-xs text-muted-foreground"><Percent className="h-3.5 w-3.5" />Desconto</Label>
            <ToggleGroup type="single" value={discountMode} onValueChange={(value) => value && setDiscountMode(value as DiscountMode)} className="rounded-md border bg-background p-1">
              <ToggleGroupItem value="amount" size="sm" className="h-7 px-2 text-xs">R$</ToggleGroupItem>
              <ToggleGroupItem value="percent" size="sm" className="h-7 px-2 text-xs">%</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <Input value={discount} onChange={(event) => setDiscount(event.target.value)} inputMode="decimal" placeholder="0,00" className="h-10" />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
          <div>
            <span className="text-xs text-muted-foreground">Total líquido: </span>
            <span className="font-bold">{formatMoney(net, "BRL", locale)}</span>
            {discountNumber > 0 ? <p className="text-[11px] text-muted-foreground">Bruto {formatMoney(gross, "BRL", locale)} · Desc. {formatMoney(discountNumber, "BRL", locale)}</p> : null}
          </div>
          <Button type="button" onClick={add} disabled={!materialId} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" />Incluir
          </Button>
        </div>
      </div>
    </Card>
  );
}

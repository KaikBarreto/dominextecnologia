import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useInventory } from '@/hooks/useInventory';
import { useServiceMaterials } from '@/hooks/useServiceMaterials';
import { formatBRL } from '@/utils/currency';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface Props {
  serviceId: string;
}

export function ServiceMaterialsList({ serviceId }: Props) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.serviceMaterials;
  const { items } = useInventory();
  const { materials, createMaterial, updateMaterial, deleteMaterial, totalCost } = useServiceMaterials(serviceId);

  const [stockItemId, setStockItemId] = useState('');
  const [manualName, setManualName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [purchasePrice, setPurchasePrice] = useState(0);

  // Texto cru da quantidade (form de adicionar) e por linha da tabela. Existe
  // porque um input controlado por NUMBER engole a vírgula no meio da digitação:
  // "17," volta pra 17, o campo re-renderiza "17" e o usuário, digitando 17,99
  // naturalmente, acabava salvando 1799. Guardar a string crua no estado e
  // parsear só no uso é a régua da casa (mesmo padrão do InventoryFormDialog).
  const [quantityText, setQuantityText] = useState('1');
  const [rowQtyText, setRowQtyText] = useState<Record<string, string>>({});

  // Sincroniza o texto por linha quando a lista de materiais carrega/muda, sem
  // sobrescrever o que o usuário já está digitando numa linha rastreada.
  useEffect(() => {
    setRowQtyText((prev) => {
      const next: Record<string, string> = {};
      let changed = false;
      for (const m of materials) {
        if (prev[m.id] !== undefined) {
          next[m.id] = prev[m.id];
        } else {
          next[m.id] = m.quantity != null ? String(m.quantity).replace('.', ',') : '';
          changed = true;
        }
      }
      if (!changed && Object.keys(prev).length === Object.keys(next).length) return prev;
      return next;
    });
  }, [materials]);

  const inventoryOptions = useMemo(
    () => (items ?? []).map((i) => ({
      value: i.id,
      label: i.name,
      sublabel: i.sku ? `SKU: ${i.sku}` : undefined,
    })),
    [items]
  );

  const selectedInv = useMemo(
    () => (items ?? []).find((i) => i.id === stockItemId) ?? null,
    [items, stockItemId]
  );

  const addMaterial = async () => {
    const isFromStock = !!stockItemId;
    const name = isFromStock ? (selectedInv?.name ?? '') : manualName;
    if (!name.trim()) return;

    const unit = (selectedInv as any)?.unit ?? 'und';
    const price = isFromStock ? Number(selectedInv?.cost_price ?? 0) : purchasePrice;

    await createMaterial.mutateAsync({
      stock_item_id: isFromStock ? stockItemId : null,
      item_name: name,
      unit,
      quantity,
      purchase_price: price,
      sale_price: null,
      sort_order: 0,
    } as any);

    setStockItemId('');
    setManualName('');
    setQuantity(1);
    setQuantityText('1');
    setPurchasePrice(0);
  };

  // Atualiza o texto exibido do form de adicionar E deriva a quantidade numérica.
  const handleQuantityText = (raw: string) => {
    setQuantityText(raw);
    setQuantity(raw.trim() === '' ? 0 : (parseFloat(raw.replace(',', '.')) || 0));
  };

  // Idem, por linha da tabela — mutate direto, igual ao comportamento anterior.
  const handleRowQuantityChange = (id: string, raw: string) => {
    setRowQtyText((prev) => ({ ...prev, [id]: raw }));
    updateMaterial.mutate({ id, quantity: raw.trim() === '' ? 0 : (parseFloat(raw.replace(',', '.')) || 0) } as any);
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{t.sectionTitle}</p>
            <p className="text-xs text-muted-foreground">{t.sectionSubtitle}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{t.totalLabel}</p>
            <p className="text-sm font-semibold text-foreground">R$ {formatBRL(totalCost)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-2 space-y-1.5">
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
                <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder={t.placeholderManualName} />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t.labelQuantity}</Label>
            <NumericInput decimal value={quantityText} onValueChange={handleQuantityText} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t.labelUnitCost}</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={stockItemId ? Number(selectedInv?.cost_price ?? 0) : purchasePrice}
              onChange={(e) => setPurchasePrice(Number(e.target.value) || 0)}
              disabled={!!stockItemId}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={addMaterial} disabled={createMaterial.isPending}>
            <Plus className="h-4 w-4 mr-2" />
            {t.btnAdd}
          </Button>
        </div>

        {materials.length === 0 ? (
          <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
            {t.emptyState}
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.colMaterial}</TableHead>
                  <TableHead className="w-[110px]">{t.colQty}</TableHead>
                  <TableHead className="w-[140px]">{t.colUnitCost}</TableHead>
                  <TableHead className="w-[140px]">{t.colSubtotal}</TableHead>
                  <TableHead className="w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{m.item_name}</p>
                        <p className="text-xs text-muted-foreground">{m.unit}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <NumericInput
                        decimal
                        value={rowQtyText[m.id] ?? (m.quantity != null ? String(m.quantity).replace('.', ',') : '')}
                        onValueChange={(v) => handleRowQuantityChange(m.id, v)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={Number(m.purchase_price ?? 0)}
                        onChange={(e) => updateMaterial.mutate({ id: m.id, purchase_price: Number(e.target.value) || 0 } as any)}
                      />
                    </TableCell>
                    <TableCell className="text-sm font-semibold">R$ {formatBRL(Number(m.subtotal ?? 0))}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="destructive-ghost"
                        size="icon"
                        onClick={() => deleteMaterial.mutate(m.id)}
                        className="h-8 w-8"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

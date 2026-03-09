import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

interface Props {
  serviceId: string;
}

export function ServiceMaterialsList({ serviceId }: Props) {
  const { items } = useInventory();
  const { materials, createMaterial, updateMaterial, deleteMaterial, totalCost } = useServiceMaterials(serviceId);

  const [stockItemId, setStockItemId] = useState('');
  const [manualName, setManualName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [purchasePrice, setPurchasePrice] = useState(0);

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
    setPurchasePrice(0);
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Materiais do serviço</p>
            <p className="text-xs text-muted-foreground">Vincule materiais do estoque ou cadastre manualmente.</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-sm font-semibold text-foreground">R$ {formatBRL(totalCost)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-2 space-y-1.5">
            <Label className="text-xs">Item do estoque (opcional)</Label>
            <SearchableSelect
              options={inventoryOptions}
              value={stockItemId}
              onValueChange={setStockItemId}
              placeholder="Selecione do estoque"
            />
            {!stockItemId && (
              <div className="pt-2">
                <Label className="text-xs">Nome manual</Label>
                <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Ex: Tubo de cobre" />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Quantidade</Label>
            <Input type="number" min={0} step="0.01" value={quantity} onChange={(e) => setQuantity(Number(e.target.value) || 0)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Custo unit. (R$)</Label>
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
            Adicionar
          </Button>
        </div>

        {materials.length === 0 ? (
          <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
            Nenhum material vinculado.
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead className="w-[110px]">Qtd.</TableHead>
                  <TableHead className="w-[140px]">Custo unit.</TableHead>
                  <TableHead className="w-[140px]">Subtotal</TableHead>
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
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={Number(m.quantity ?? 0)}
                        onChange={(e) => updateMaterial.mutate({ id: m.id, quantity: Number(e.target.value) || 0 } as any)}
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

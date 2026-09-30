import { useEffect, useState } from 'react';
import { PackageCheck } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NumericInput } from '@/components/ui/numeric-input';
import { cn } from '@/lib/utils';
import { unitLabel } from '@/lib/inventoryUnits';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useCompraOrdens, type CompraOrdemRow } from '@/hooks/useCompraOrdens';

interface OrdemCompraReceiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  compraId: string;
  /** Ordem a receber. `null` = dialog fechado/sem alvo. */
  ordem: CompraOrdemRow | null;
}

/** Número salvo → texto do campo (vazio quando 0/nulo, vírgula como decimal). Mesma régua do resto do módulo de Compras. */
const toNumericText = (n: number): string => (!n ? '' : String(n).replace('.', ','));

/** Texto digitado (vírgula BR) → número. Vazio/inválido → 0. */
function parseQty(raw: string): number {
  if (!raw) return 0;
  const n = parseFloat(raw.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Recebimento de uma Ordem de Compra — parcial permitido. Lista os itens com
 * pedido/já recebido/pendente e um campo "recebendo agora" por item; a entrada
 * no estoque (no local certo) e o novo status da ordem são todos resolvidos
 * atomicamente pela RPC por trás de `receber` (useCompraOrdens).
 *
 * Nunca deixamos SUBMETER mais que o pendente: o botão de confirmar fica
 * desabilitado enquanto qualquer linha exceder, com aviso inline por item. O
 * banco também recusa (trava de duplo-clique) — aqui é só a camada de aviso
 * antecipado que a régua do módulo pede.
 */
export function OrdemCompraReceiveDialog({ open, onOpenChange, compraId, ordem }: OrdemCompraReceiveDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.compras.ordens;
  // Sem chave dedicada de "cancelar/fechar" no contrato de ordens; reaproveita
  // o genérico do editor de requisição (mesmo módulo, mesmo idioma).
  const tCancel = MESSAGES[locale].app.inventory.purchaseEditor.cancel;
  const tQtyLabel = MESSAGES[locale].app.inventory.purchaseEditor.materials.quantity;
  const { receber } = useCompraOrdens(compraId);

  // Texto cru por item (chave = item.id) — nunca formata durante a digitação.
  const [qtyText, setQtyText] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setQtyText({});
  }, [open, ordem?.id]);

  const items = ordem?.items ?? [];

  const pendingOf = (quantityOrdered: number, quantityReceived: number): number => {
    const pending = quantityOrdered - quantityReceived;
    return pending > 0 ? pending : 0;
  };

  const parsedItems = items.map((item) => ({
    item,
    qty: parseQty(qtyText[item.id] ?? ''),
    pending: pendingOf(item.quantity_ordered, item.quantity_received),
  }));
  const anyToReceive = parsedItems.some((p) => p.qty > 0);
  const anyExceeds = parsedItems.some((p) => p.qty > p.pending);
  const canConfirm = anyToReceive && !anyExceeds && !receber.isPending;

  const handleQtyChange = (itemId: string, raw: string) => {
    setQtyText((prev) => ({ ...prev, [itemId]: raw }));
  };

  const handleReceiveAll = () => {
    const next: Record<string, string> = {};
    for (const item of items) {
      const pending = pendingOf(item.quantity_ordered, item.quantity_received);
      next[item.id] = pending > 0 ? toNumericText(pending) : '';
    }
    setQtyText(next);
  };

  const handleConfirm = async () => {
    if (!ordem || !canConfirm) return;
    const itens = parsedItems
      .filter((p) => p.qty > 0)
      .map((p) => ({ item_id: p.item.id, quantity: p.qty }));
    if (itens.length === 0) return;
    try {
      await receber.mutateAsync({ ordemId: ordem.id, itens });
      onOpenChange(false);
    } catch {
      // Erro (ex.: excedeu o pedido, ordem já cancelada) já vira toast no hook.
    }
  };

  return (
    <ResponsiveModal
      open={open && !!ordem}
      onOpenChange={onOpenChange}
      title={t.receiveTitle}
      description={t.receiveHint}
      className="sm:max-w-[560px]"
      footer={
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            disabled={items.length === 0 || receber.isPending}
            onClick={handleReceiveAll}
          >
            <PackageCheck className="h-4 w-4" /> {t.receiveAll}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              {tCancel}
            </Button>
            <Button className="flex-1" disabled={!canConfirm} onClick={handleConfirm}>
              {t.receiveConfirm}
            </Button>
          </div>
        </div>
      }
    >
      {ordem && (
        <div className="space-y-2">
          {parsedItems.map(({ item, qty, pending }) => {
            const exceeds = qty > pending;
            return (
              <div key={item.id} className="space-y-2 rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{item.material_name}</p>
                  <p className="text-xs text-muted-foreground">{unitLabel(item.unit)}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-md bg-muted/40 py-1.5">
                    <p className="text-muted-foreground">{t.orderedQty}</p>
                    <p className="font-semibold">{item.quantity_ordered}</p>
                  </div>
                  <div className="rounded-md bg-muted/40 py-1.5">
                    <p className="text-muted-foreground">{t.receivedQty}</p>
                    <p className="font-semibold">{item.quantity_received}</p>
                  </div>
                  <div className="rounded-md bg-muted/40 py-1.5">
                    <p className="text-muted-foreground">{t.pendingQty}</p>
                    <p className="font-semibold">{pending}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{tQtyLabel}</Label>
                  <NumericInput
                    decimal
                    disabled={receber.isPending || pending <= 0}
                    className={cn(exceeds && 'border-destructive focus-visible:ring-destructive')}
                    value={qtyText[item.id] ?? ''}
                    onValueChange={(v) => handleQtyChange(item.id, v)}
                  />
                  {exceeds && (
                    <p className="text-xs text-destructive">
                      {t.errors.exceedsOrdered.replace('{material}', item.material_name)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ResponsiveModal>
  );
}

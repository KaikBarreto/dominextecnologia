import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { NumericInput } from '@/components/ui/numeric-input';
import { formatQty } from '@/components/inventory/InventoryMaterialSelect';
import { useInventory } from '@/hooks/useInventory';
import { useStocks } from '@/hooks/useStocks';
import {
  clearSummaryDraft,
  readSummaryDraft,
  useOsMaterials,
  writeSummaryDraft,
  type CommitLineInput,
  type OsMaterialLine,
} from '@/hooks/useOsMaterials';
import { cn } from '@/lib/utils';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface OsConsumptionSummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceOrderId: string;
  /** Monta o payload final — quem chama a RPC e finaliza a OS é a tela do técnico. */
  onConfirm: (lines: CommitLineInput[]) => void | Promise<void>;
  isConfirming?: boolean;
}

function parseQty(raw: string): number {
  return parseFloat(raw.replace(',', '.')) || 0;
}

/**
 * Resumo editável mostrado ao FINALIZAR a OS (v1.22.0). Componente burro:
 * só lê o rascunho (useOsMaterials) e entrega o payload final no onConfirm.
 * Não chama commitConsumption nem finaliza a OS — isso é responsabilidade de
 * quem orquestra (tela do técnico).
 */
export function OsConsumptionSummaryDialog({
  open,
  onOpenChange,
  serviceOrderId,
  onConfirm,
  isConfirming = false,
}: OsConsumptionSummaryDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.stockConsumption;
  const { items, getQuantityForStock } = useInventory();
  const { stocks } = useStocks();
  const { lines, pendingLines, flushPending } = useOsMaterials(serviceOrderId);

  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Hidrata o rascunho local (quantidade editada + removidos) toda vez que o
  // resumo abre — sobrevive a reload de página (regra do CEO).
  useEffect(() => {
    if (!open) return;
    const draft = readSummaryDraft(serviceOrderId);
    setQuantities(draft?.quantities ?? {});
    setRemovedIds(new Set(draft?.removed ?? []));
    void flushPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, serviceOrderId]);

  // Persiste a cada edição — não só no fechamento.
  useEffect(() => {
    if (!open) return;
    writeSummaryDraft(serviceOrderId, { quantities, removed: Array.from(removedIds) });
  }, [open, serviceOrderId, quantities, removedIds]);

  const displayLines = useMemo(
    () => lines.filter((l) => !removedIds.has(l.id)),
    [lines, removedIds],
  );

  /**
   * Delta total por par `material|estoque`, somando todas as linhas do resumo.
   * É o que permite o saldo previsto bater com o que a RPC vai realmente fazer
   * quando o mesmo material aparece em mais de uma linha.
   */
  const deltaPorPar = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const l of displayLines) {
      const q = parseQty(quantities[l.id] ?? String(l.quantity).replace('.', ','));
      const chave = `${l.inventory_id}|${l.stock_id}`;
      acc[chave] = (acc[chave] ?? 0) + (q - (l.committed_quantity ?? 0));
    }
    return acc;
  }, [displayLines, quantities]);

  const materialName = (line: OsMaterialLine) =>
    line.material?.name ?? items.find((i) => i.id === line.inventory_id)?.name ?? '—';
  const materialUnit = (line: OsMaterialLine) =>
    line.material?.unit || items.find((i) => i.id === line.inventory_id)?.unit || t.sectionUnit;
  const stockName = (line: OsMaterialLine) =>
    line.stock?.name ?? stocks.find((s) => s.id === line.stock_id)?.name ?? '—';

  const handleQtyChange = (id: string, value: string) => {
    setQuantities((prev) => ({ ...prev, [id]: value }));
  };

  const handleRemove = (id: string) => {
    setRemovedIds((prev) => new Set(prev).add(id));
  };

  const handleConfirmClick = async () => {
    if (busy || isConfirming) return;
    setBusy(true);
    try {
      // Última chance de sincronizar o que ficou preso no aparelho antes de
      // montar o payload — linha nunca inserida não pode ir com `id` pra RPC.
      const { flushed } = await flushPending();
      const stillPendingIds = new Set(
        pendingLines.filter((p) => !flushed.some((f) => f.id === p.id)).map((p) => p.id),
      );

      const payload: CommitLineInput[] = lines
        .filter((l) => !removedIds.has(l.id) && !stillPendingIds.has(l.id))
        .map((l) => ({
          id: l.id,
          inventory_id: l.inventory_id,
          stock_id: l.stock_id,
          quantity: parseQty(quantities[l.id] ?? String(l.quantity)),
          notes: l.notes ?? undefined,
        }));

      await onConfirm(payload);
      clearSummaryDraft(serviceOrderId);
      onOpenChange(false);
    } catch {
      // onConfirm (a tela do técnico) já trata e mostra o erro — aqui só
      // garantimos que o resumo continua aberto pra tentar de novo.
    } finally {
      setBusy(false);
    }
  };

  const confirming = busy || isConfirming;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t.summaryTitle}
      description={t.summaryIntro}
      footer={
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
            disabled={confirming}
          >
            {t.summaryBtnBack}
          </Button>
          <Button onClick={handleConfirmClick} disabled={confirming} className="flex-1">
            {confirming ? t.summaryBtnConfirming : t.summaryBtnConfirm}
          </Button>
        </div>
      }
    >
      {displayLines.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t.summaryEmptyAll}</p>
      ) : (
        <div className="space-y-3">
          {displayLines.map((line) => {
            const unit = materialUnit(line);
            const qtyStr = quantities[line.id] ?? String(line.quantity).replace('.', ',');
            const qty = parseQty(qtyStr);
            const currentBalance = getQuantityForStock(line.inventory_id, line.stock_id);
            // O saldo resultante é do PAR (material + estoque), não da linha
            // isolada. O mesmo material pode estar lançado em duas linhas de
            // propósito; calcular cada uma sozinha contra o saldo atual mostra
            // um número que não vai acontecer (com saldo 10 e linhas de 5 e 2,
            // daria "fica com 5" e "fica com 8", quando o real é 3) e ainda
            // esconderia o aviso de negativo. Por isso somamos o delta do grupo.
            const resulting = currentBalance - (deltaPorPar[`${line.inventory_id}|${line.stock_id}`] ?? 0);
            const resultingNegative = resulting < 0;

            return (
              <div key={line.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{materialName(line)}</p>
                    <p className="truncate text-xs text-muted-foreground">{stockName(line)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="destructive-ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => handleRemove(line.id)}
                    disabled={confirming}
                    aria-label={t.removeAria.replace('{material}', materialName(line))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <NumericInput
                      decimal
                      value={qtyStr}
                      onValueChange={(v) => handleQtyChange(line.id, v)}
                      disabled={confirming}
                    />
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{unit}</span>
                </div>

                {line.pending ? (
                  <p className="text-xs text-warning">{t.summaryPendingHint}</p>
                ) : (
                  <p className={cn('text-xs', resultingNegative ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                    {resultingNegative
                      ? t.summaryNegative.replace('{qty}', formatQty(Math.abs(resulting))).replace('{unit}', unit)
                      : t.summaryResulting.replace('{qty}', formatQty(resulting)).replace('{unit}', unit)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ResponsiveModal>
  );
}

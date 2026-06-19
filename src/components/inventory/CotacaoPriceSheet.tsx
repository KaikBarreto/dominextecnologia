import { useEffect, useMemo, useState } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/utils/currency';
import { unitLabel } from '@/lib/inventoryUnits';
import { useIsCompact } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { useCompraCotacoes, type CotacaoRow } from '@/hooks/useCompraCotacoes';
import type { CompraMaterial } from '@/hooks/useCompras';

interface CotacaoPriceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  compraId: string;
  cotacao: CotacaoRow;
  materials: CompraMaterial[];
}

/** Modo de digitação de uma célula: valor unitário ou total da linha. */
type CellMode = 'unit' | 'total';

/**
 * Converte a string digitada em número BR (aceita vírgula como decimal).
 * Retorna 0 quando vazio/inválido.
 */
function parseBR(value: string): number {
  if (!value) return 0;
  const n = parseFloat(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function CotacaoPriceSheet({
  open, onOpenChange, cotacao, materials,
}: CotacaoPriceSheetProps) {
  const isCompact = useIsCompact();
  const { toast } = useToast();
  const { loadPrices, savePrices } = useCompraCotacoes(cotacao.compra_id);

  // prices[materialId] = string digitada; modes[materialId] = 'unit' | 'total'.
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [modes, setModes] = useState<Record<string, CellMode>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    loadPrices(cotacao.id)
      .then((rows) => {
        if (cancelled) return;
        const pm: Record<string, string> = {};
        for (const r of rows) {
          pm[r.compra_material_id] = String(r.unit_price).replace('.', ',');
        }
        setPrices(pm);
        setModes({});
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cotacao.id]);

  const modeOf = (id: string): CellMode => modes[id] ?? 'unit';

  /** Preço UNITÁRIO canônico de uma linha (deriva de total quando o modo é 'total'). */
  const unitPriceOf = (mat: CompraMaterial): number => {
    const raw = parseBR(prices[mat.id] ?? '');
    if (raw <= 0) return 0;
    if (modeOf(mat.id) === 'total') {
      return mat.quantity > 0 ? raw / mat.quantity : 0;
    }
    return raw;
  };

  const lineTotalOf = (mat: CompraMaterial): number => unitPriceOf(mat) * mat.quantity;

  const grandTotal = useMemo(
    () => materials.reduce((acc, m) => acc + lineTotalOf(m), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [materials, prices, modes],
  );

  const setPrice = (id: string, value: string) =>
    setPrices((prev) => ({ ...prev, [id]: value }));

  const toggleMode = (id: string, mode: CellMode) =>
    setModes((prev) => ({ ...prev, [id]: mode }));

  const readOnly = cotacao.status === 'recusada';

  const handleSave = async () => {
    const payload = materials
      .map((m) => ({ compra_material_id: m.id, unit_price: unitPriceOf(m) }))
      .filter((p) => p.unit_price > 0);
    await savePrices.mutateAsync({ cotacaoId: cotacao.id, prices: payload });
    onOpenChange(false);
  };

  // Texto auxiliar (o "outro valor" derivado) por célula.
  const derivedHint = (mat: CompraMaterial): string | null => {
    const up = unitPriceOf(mat);
    if (up <= 0) return null;
    return modeOf(mat.id) === 'unit'
      ? `Total R$ ${formatBRL(up * mat.quantity)}`
      : `Unit. R$ ${formatBRL(up)}`;
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Preços — ${cotacao.supplier_name}`}
      className="sm:max-w-[760px]"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            <span className="text-muted-foreground">Total: </span>
            <span className="font-semibold">R$ {formatBRL(grandTotal)}</span>
          </div>
          {readOnly ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          ) : (
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={savePrices.isPending}>
                {savePrices.isPending ? 'Salvando...' : 'Salvar preços'}
              </Button>
            </div>
          )}
        </div>
      }
    >
      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Carregando preços...</p>
      ) : materials.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Esta compra não tem materiais.
        </p>
      ) : isCompact ? (
        /* ---- MOBILE: cards (material + input de preço) ---- */
        <div className="space-y-2">
          {materials.map((m) => {
            const hint = derivedHint(m);
            return (
              <div key={m.id} className="space-y-2 rounded-lg border p-3">
                <div>
                  <p className="font-medium">{m.material_name || 'Material'}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.quantity} {unitLabel(m.unit)}
                  </p>
                </div>
                <LabeledSwitch<CellMode>
                  value={modeOf(m.id)}
                  onChange={(mode) => toggleMode(m.id, mode)}
                  off={{ value: 'unit', label: 'Unitário' }}
                  on={{ value: 'total', label: 'Total' }}
                  size="default"
                  disabled={readOnly}
                  aria-label="Tipo de valor"
                />
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">R$</span>
                  <Input
                    inputMode="decimal"
                    className="h-9 text-right"
                    placeholder="0,00"
                    value={prices[m.id] ?? ''}
                    disabled={readOnly}
                    onChange={(e) => setPrice(m.id, e.target.value)}
                  />
                </div>
                {hint && <p className="text-right text-xs text-muted-foreground">{hint}</p>}
              </div>
            );
          })}
        </div>
      ) : (
        /* ---- DESKTOP: planilha tipo Excel ---- */
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b bg-muted">
                <th className="p-2 text-left font-medium">Material</th>
                <th className="w-24 p-2 text-right font-medium">Qtd.</th>
                <th className="w-28 p-2 text-center font-medium">Valor</th>
                <th className="w-44 p-2 text-right font-medium">R$ unitário / total</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => {
                const hint = derivedHint(m);
                return (
                  <tr key={m.id} className="border-b odd:bg-muted/30">
                    <td className="p-2">
                      <span className="font-medium">{m.material_name || 'Material'}</span>
                      {!m.inventory_id && (
                        <span className="ml-2 text-xs text-warning">fora do estoque</span>
                      )}
                    </td>
                    <td className="p-2 text-right text-muted-foreground">
                      {m.quantity} {unitLabel(m.unit)}
                    </td>
                    <td className="p-2 text-center">
                      <LabeledSwitch<CellMode>
                        value={modeOf(m.id)}
                        onChange={(mode) => toggleMode(m.id, mode)}
                        off={{ value: 'unit', label: 'Unit.' }}
                        on={{ value: 'total', label: 'Total' }}
                        size="default"
                        disabled={readOnly}
                        aria-label="Tipo de valor"
                      />
                    </td>
                    <td className="p-0">
                      <div className="flex items-center gap-1 px-2">
                        <span className="text-xs text-muted-foreground">R$</span>
                        <Input
                          inputMode="decimal"
                          className={cn(
                            'h-9 border-0 bg-transparent text-right shadow-none focus-visible:ring-1',
                          )}
                          placeholder="0,00"
                          value={prices[m.id] ?? ''}
                          disabled={readOnly}
                          onChange={(e) => setPrice(m.id, e.target.value)}
                        />
                      </div>
                      {hint && (
                        <p className="px-2 pb-1 text-right text-[11px] text-muted-foreground">{hint}</p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted font-semibold">
                <td className="p-2" colSpan={3}>Total geral</td>
                <td className="p-2 text-right">R$ {formatBRL(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ResponsiveModal>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/utils/currency';
import { unitLabel } from '@/lib/inventoryUnits';
import { useIsCompact } from '@/hooks/use-mobile';
import { useCompraCotacoes } from '@/hooks/useCompraCotacoes';
import type { CotacaoRow } from '@/hooks/useCompraCotacoes';
import type { CompraMaterial } from '@/hooks/useCompras';

interface CotacaoPriceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  compraId: string;
  cotacao: CotacaoRow;
  materials: CompraMaterial[];
}

/**
 * Converte a string digitada em número BR (aceita vírgula como decimal).
 * Retorna 0 quando vazio/inválido.
 */
function parseBR(value: string): number {
  if (!value) return 0;
  const n = parseFloat(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Formata um número pro input no padrão BR (vírgula como decimal), sem casas extras desnecessárias. */
function toInput(n: number): string {
  if (!(n > 0)) return '';
  // Até 4 casas pra não perder precisão no unitário derivado de total ÷ qtd.
  return n
    .toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    .replace(/\./g, '');
}

export function CotacaoPriceSheet({
  open, onOpenChange, cotacao, materials,
}: CotacaoPriceSheetProps) {
  const isCompact = useIsCompact();
  const { loadPrices, savePrices } = useCompraCotacoes(cotacao.compra_id);

  // Estado canônico: unitário (string BR) por material.
  const [units, setUnits] = useState<Record<string, string>>({});
  // Estado do campo "total" digitado, para o usuário não ter o número reformatado enquanto digita.
  const [totals, setTotals] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    loadPrices(cotacao.id)
      .then((rows) => {
        if (cancelled) return;
        const um: Record<string, string> = {};
        for (const r of rows) {
          um[r.compra_material_id] = toInput(r.unit_price);
        }
        setUnits(um);
        setTotals({});
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cotacao.id]);

  const unitPriceOf = (mat: CompraMaterial): number => parseBR(units[mat.id] ?? '');
  const lineTotalOf = (mat: CompraMaterial): number => unitPriceOf(mat) * mat.quantity;

  const grandTotal = useMemo(
    () => materials.reduce((acc, m) => acc + lineTotalOf(m), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [materials, units],
  );

  const readOnly = cotacao.status === 'recusada';

  /** Usuário digitou o valor UNITÁRIO → atualiza unitário e limpa o "total digitado" da linha. */
  const onUnitChange = (mat: CompraMaterial, value: string) => {
    setUnits((prev) => ({ ...prev, [mat.id]: value }));
    setTotals((prev) => {
      if (!(mat.id in prev)) return prev;
      const next = { ...prev };
      delete next[mat.id];
      return next;
    });
  };

  /** Usuário digitou o valor TOTAL → recalcula o unitário (total ÷ qtd). */
  const onTotalChange = (mat: CompraMaterial, value: string) => {
    setTotals((prev) => ({ ...prev, [mat.id]: value }));
    const total = parseBR(value);
    const unit = mat.quantity > 0 ? total / mat.quantity : 0;
    setUnits((prev) => ({ ...prev, [mat.id]: toInput(unit) }));
  };

  /** Valor a exibir no campo "Total": o que o usuário está digitando, ou o derivado do unitário. */
  const totalDisplay = (mat: CompraMaterial): string => {
    if (mat.id in totals) return totals[mat.id];
    const t = lineTotalOf(mat);
    return t > 0 ? formatBRL(t).replace(/\./g, '') : '';
  };

  const handleSave = async () => {
    const payload = materials
      .map((m) => ({ compra_material_id: m.id, unit_price: unitPriceOf(m) }))
      .filter((p) => p.unit_price > 0);
    await savePrices.mutateAsync({ cotacaoId: cotacao.id, prices: payload });
    onOpenChange(false);
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
            <span className="text-muted-foreground">Total geral: </span>
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
        /* ---- MOBILE: card por material, dois campos rotulados lado a lado ---- */
        <div className="space-y-2">
          {materials.map((m) => (
            <div key={m.id} className="space-y-3 rounded-lg border p-3">
              <div>
                <p className="font-medium">{m.material_name || 'Material'}</p>
                <p className="text-xs text-muted-foreground">
                  {m.quantity} {unitLabel(m.unit)}
                  {!m.inventory_id && (
                    <span className="ml-2 text-warning">fora do estoque</span>
                  )}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Valor unitário</label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">R$</span>
                    <Input
                      inputMode="decimal"
                      className="h-9 text-right"
                      placeholder="0,00"
                      value={units[m.id] ?? ''}
                      disabled={readOnly}
                      onChange={(e) => onUnitChange(m, e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Valor total</label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">R$</span>
                    <Input
                      inputMode="decimal"
                      className="h-9 text-right"
                      placeholder="0,00"
                      value={totalDisplay(m)}
                      disabled={readOnly}
                      onChange={(e) => onTotalChange(m, e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ---- DESKTOP: planilha (unitário e total editáveis) ---- */
        <div className="max-h-[60vh] overflow-auto rounded-lg border">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b bg-muted">
                <th className="p-2 text-left font-medium">Material</th>
                <th className="w-28 p-2 text-right font-medium">Qtd.</th>
                <th className="w-44 p-2 text-right font-medium">Valor unitário (R$)</th>
                <th className="w-44 p-2 text-right font-medium">Valor total (R$)</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => (
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
                  <td className="p-1">
                    <div className="flex items-center gap-1">
                      <span className="pl-1 text-xs text-muted-foreground">R$</span>
                      <Input
                        inputMode="decimal"
                        className={cn('h-9 text-right')}
                        placeholder="0,00"
                        value={units[m.id] ?? ''}
                        disabled={readOnly}
                        onChange={(e) => onUnitChange(m, e.target.value)}
                      />
                    </div>
                  </td>
                  <td className="p-1">
                    <div className="flex items-center gap-1">
                      <span className="pl-1 text-xs text-muted-foreground">R$</span>
                      <Input
                        inputMode="decimal"
                        className={cn('h-9 text-right')}
                        placeholder="0,00"
                        value={totalDisplay(m)}
                        disabled={readOnly}
                        onChange={(e) => onTotalChange(m, e.target.value)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0">
              <tr className="border-t bg-muted font-semibold">
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

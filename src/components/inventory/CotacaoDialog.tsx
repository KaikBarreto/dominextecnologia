import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { cn } from '@/lib/utils';
import { unitLabel } from '@/lib/inventoryUnits';
import { useIsCompact } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { useCompraCotacoes } from '@/hooks/useCompraCotacoes';
import type { CotacaoRow } from '@/hooks/useCompraCotacoes';
import type { CompraMaterial } from '@/hooks/useCompras';
import { SupplierFormDialog } from './SupplierFormDialog';

interface SupplierOption {
  value: string;
  label: string;
}

interface CotacaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  compraId: string;
  materials: CompraMaterial[];
  /**
   * Modo edição: cotação existente (fornecedor fixo, preços carregados).
   * Quando ausente, é modo "nova cotação" (seletor de fornecedor).
   */
  cotacao?: CotacaoRow | null;
  /** Fornecedores ainda sem cotação nesta compra (só no modo nova). */
  availableSuppliers?: SupplierOption[];
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

/**
 * Modal único de cotação:
 *  - modo "nova": escolhe fornecedor (+ criar inline) e preenche preços; salva tudo de uma vez.
 *  - modo "editar": fornecedor fixo, preços carregados; salva os preços.
 */
export function CotacaoDialog({
  open, onOpenChange, compraId, materials, cotacao, availableSuppliers = [],
}: CotacaoDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.cotacaoDialog;
  const { money } = useLocaleFormatters();
  const isCompact = useIsCompact();
  const { loadPrices, savePrices, createCotacaoWithPrices } = useCompraCotacoes(compraId);

  const isEditing = !!cotacao;
  const readOnly = cotacao?.status === 'recusada';

  // Fornecedor selecionado (só usado no modo nova).
  const [supplierId, setSupplierId] = useState('');
  const [quickOpen, setQuickOpen] = useState(false);

  // Estado canônico: unitário (string BR) por material.
  const [units, setUnits] = useState<Record<string, string>>({});
  // Estado do campo "total" digitado, para o usuário não ter o número reformatado enquanto digita.
  const [totals, setTotals] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Reset / carga ao abrir.
  useEffect(() => {
    if (!open) return;
    setSupplierId('');
    setTotals({});

    if (cotacao) {
      // Modo edição: carrega os preços da cotação.
      let cancelled = false;
      setLoading(true);
      loadPrices(cotacao.id)
        .then((rows) => {
          if (cancelled) return;
          const um: Record<string, string> = {};
          for (const r of rows) um[r.compra_material_id] = toInput(r.unit_price);
          setUnits(um);
        })
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }

    // Modo nova: planilha vazia.
    setUnits({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cotacao?.id]);

  const unitPriceOf = (mat: CompraMaterial): number => parseBR(units[mat.id] ?? '');
  const lineTotalOf = (mat: CompraMaterial): number => unitPriceOf(mat) * mat.quantity;

  const grandTotal = useMemo(
    () => materials.reduce((acc, m) => acc + lineTotalOf(m), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [materials, units],
  );

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
    const total = lineTotalOf(mat);
    // Exibe em formato pt-BR com vírgula para os inputs de cotação (entrada manual BR)
    return total > 0
      ? total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\./g, '')
      : '';
  };

  const buildPrices = () =>
    materials
      .map((m) => ({ compra_material_id: m.id, unit_price: unitPriceOf(m) }))
      .filter((p) => p.unit_price > 0);

  const handleSave = async () => {
    if (isEditing && cotacao) {
      await savePrices.mutateAsync({ cotacaoId: cotacao.id, prices: buildPrices() });
    } else {
      if (!supplierId) return;
      await createCotacaoWithPrices.mutateAsync({ supplierId, prices: buildPrices() });
    }
    onOpenChange(false);
  };

  const saving = savePrices.isPending || createCotacaoWithPrices.isPending;
  const canSave = isEditing ? true : !!supplierId;

  const title = isEditing
    ? readOnly
      ? t.titleView.replace('{name}', cotacao!.supplier_name)
      : t.titleEdit.replace('{name}', cotacao!.supplier_name)
    : t.titleNew;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      className="sm:max-w-[760px]"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            <span className="text-muted-foreground">{t.grandTotal}</span>
            <span className="font-semibold">{money(grandTotal)}</span>
          </div>
          {readOnly ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t.close}</Button>
          ) : (
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t.cancel}
              </Button>
              <Button onClick={handleSave} disabled={saving || !canSave}>
                {saving ? t.saving : isEditing ? t.savePrices : t.saveQuote}
              </Button>
            </div>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Fornecedor */}
        {isEditing ? (
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">{t.supplierLabel}</Label>
            <p className="font-medium">{cotacao!.supplier_name}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{t.supplierRequired}</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex-1">
                <SearchableSelect
                  options={availableSuppliers}
                  value={supplierId}
                  onValueChange={setSupplierId}
                  placeholder={t.supplierPlaceholder}
                  searchPlaceholder={t.supplierSearchPlaceholder}
                  emptyMessage={t.supplierAllHaveQuotes}
                />
              </div>
              <Button variant="outline" className="gap-1.5 shrink-0" onClick={() => setQuickOpen(true)}>
                <Plus className="h-4 w-4" /> {t.newSupplierButton}
              </Button>
            </div>
          </div>
        )}

        {/* Planilha de preços */}
        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t.loadingPrices}</p>
        ) : materials.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t.noMaterials}
          </p>
        ) : isCompact ? (
          /* ---- MOBILE: card por material, dois campos rotulados lado a lado ---- */
          <div className="space-y-2">
            {materials.map((m) => (
              <div key={m.id} className="space-y-3 rounded-lg border p-3">
                <div>
                  <p className="font-medium">{m.material_name || t.materialFallback}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.quantity} {unitLabel(m.unit)}
                    {!m.inventory_id && (
                      <span className="ml-2 text-warning">{t.outOfStock}</span>
                    )}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">{t.table.unitPrice}</label>
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
                    <label className="text-xs font-medium text-muted-foreground">{t.table.lineTotal}</label>
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
          <div className="max-h-[55vh] overflow-auto rounded-lg border">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-muted">
                  <th className="p-2 text-left font-medium">{t.table.material}</th>
                  <th className="w-28 p-2 text-right font-medium">{t.table.qty}</th>
                  <th className="w-44 p-2 text-right font-medium">{t.table.unitPrice}</th>
                  <th className="w-44 p-2 text-right font-medium">{t.table.lineTotal}</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m) => (
                  <tr key={m.id} className="border-b odd:bg-muted/30">
                    <td className="p-2">
                      <span className="font-medium">{m.material_name || t.materialFallback}</span>
                      {!m.inventory_id && (
                        <span className="ml-2 text-xs text-warning">{t.outOfStock}</span>
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
                  <td className="p-2" colSpan={3}>{t.table.grandTotal}</td>
                  <td className="p-2 text-right">{money(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Quick fornecedor (criar inline sem sair do modal) */}
      <SupplierFormDialog
        open={quickOpen}
        onOpenChange={setQuickOpen}
        onCreated={(s) => setSupplierId(s.id)}
      />
    </ResponsiveModal>
  );
}

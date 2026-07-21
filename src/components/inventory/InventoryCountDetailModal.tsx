import { useState, useCallback } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { NumericInput } from '@/components/ui/numeric-input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CheckCircle2, TrendingUp, TrendingDown, Minus, FileDown, FileText, FileSpreadsheet } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useInventoryCounts, type InventoryCount, type CountItemWithDetails, type InventoryCountDivergence } from '@/hooks/useInventoryCounts';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useToast } from '@/hooks/use-toast';
import { generateInventoryCountPdf } from '@/utils/inventoryCountPdfGenerator';
import { generateInventoryCountExcel } from '@/utils/inventoryCountExcelGenerator';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: InventoryCount | null;
  items: CountItemWithDetails[];
  divergences: InventoryCountDivergence[];
  loading: boolean;
  onItemsChange: () => Promise<void>;
}

export function InventoryCountDetailModal({
  open,
  onOpenChange,
  count,
  items,
  divergences,
  loading,
  onItemsChange,
}: Props) {
  const isMobile = useIsMobile();
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.inventoryCount;
  const { updateCountItem, finalizeCount } = useInventoryCounts();
  const { settings: companySettings } = useCompanySettings();
  const { enabled: whiteLabelEnabled } = useWhiteLabel();
  const { toast } = useToast();

  const [editingValues, setEditingValues] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [finalizeNotes, setFinalizeNotes] = useState('');
  const [finalizing, setFinalizing] = useState(false);
  const [activeTab, setActiveTab] = useState<'items' | 'divergences'>('items');

  const isEditable = count?.status === 'aberto';

  const getDisplayValue = (item: CountItemWithDetails): string => {
    if (item.id in editingValues) return editingValues[item.id];
    if (item.counted_qty != null) return String(item.counted_qty);
    return '';
  };

  const handleValueChange = (itemId: string, val: string) => {
    setEditingValues((prev) => ({ ...prev, [itemId]: val }));
  };

  const handleBlur = useCallback(
    async (item: CountItemWithDetails) => {
      if (!(item.id in editingValues)) return;
      const raw = editingValues[item.id];
      const parsed = raw === '' ? null : Number(raw.replace(',', '.'));
      if (parsed === item.counted_qty) {
        setEditingValues((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
        return;
      }
      setSavingIds((prev) => new Set(prev).add(item.id));
      try {
        await updateCountItem.mutateAsync({ itemId: item.id, countedQty: parsed });
        await onItemsChange();
      } finally {
        setSavingIds((prev) => { const n = new Set(prev); n.delete(item.id); return n; });
        setEditingValues((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
      }
    },
    [editingValues, updateCountItem, onItemsChange],
  );

  const handleFinalize = async () => {
    if (!count) return;
    setFinalizing(true);
    try {
      await finalizeCount.mutateAsync({ countId: count.id, notes: finalizeNotes || undefined });
      setFinalizeOpen(false);
      onOpenChange(false);
    } finally {
      setFinalizing(false);
    }
  };

  const handleExport = async (format: 'pdf' | 'excel') => {
    if (!count) return;
    try {
      const rows = items.map((item) => {
        const div = divergences.find((d) => d.item_id === item.id);
        return {
          material_name: item.material_name,
          material_sku: item.material_sku,
          stock_name: item.stock_name,
          expected_qty: item.expected_qty,
          counted_qty: item.counted_qty,
          diff: item.diff,
          unit_cost: item.unit_cost,
          diff_value: div?.diff_value ?? null,
        };
      });
      const commonParams = {
        countNumber: count.numero,
        status: t.statusLabel[count.status as keyof typeof t.statusLabel] ?? count.status,
        notes: count.notes,
        rows,
        locale,
        currency,
      };
      if (format === 'pdf') {
        await generateInventoryCountPdf({ company: companySettings, whiteLabel: whiteLabelEnabled, ...commonParams });
      } else {
        await generateInventoryCountExcel(commonParams);
      }
    } catch {
      toast({ variant: 'destructive', title: t.errorExport });
    }
  };

  const totalDiffValue = divergences.reduce((acc, d) => acc + (d.diff_value ?? 0), 0);
  const formatCurrency = (v: number) =>
    new Intl.NumberFormat(locale === 'pt-br' ? 'pt-BR' : locale, { style: 'currency', currency: 'BRL' }).format(v);

  const footer = (
    <div className="flex items-center justify-between gap-2 p-4 border-t bg-background flex-wrap">
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <FileDown className="h-4 w-4" /> {t.exportLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem
              onClick={() => handleExport('pdf')}
              className="gap-2 cursor-pointer focus:bg-info focus:text-white hover:bg-info hover:text-white"
            >
              <FileText className="h-4 w-4" /> PDF
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleExport('excel')}
              className="gap-2 cursor-pointer focus:bg-success focus:text-white hover:bg-success hover:text-white"
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t.close}
        </Button>
        {isEditable && (
          <Button
            className="bg-success text-white hover:bg-success/90 gap-2"
            onClick={() => setFinalizeOpen(true)}
          >
            <CheckCircle2 className="h-4 w-4" />
            {t.finalize}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        title={`${t.detailTitle} #${count?.numero ?? '—'}`}
        footer={footer}
      >
        <div className="p-4 space-y-4">
          {count?.notes && (
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              {count.notes}
            </div>
          )}

          {/* Mini-relatório de divergências */}
          {divergences.length > 0 && (
            <div className="rounded-xl border border-warning/40 bg-warning/5 p-3 space-y-2">
              <p className="text-sm font-semibold text-warning">
                {t.divergenceReport}: {divergences.length} {divergences.length === 1 ? t.item : t.items}
              </p>
              <p className="text-xs text-muted-foreground">
                {t.totalDiffLabel}: <span className="font-semibold text-foreground">{formatCurrency(totalDiffValue)}</span>
              </p>
            </div>
          )}

          {/* Abas */}
          <div className="flex gap-0 border-b">
            {([
              { key: 'items', label: t.tabItems },
              { key: 'divergences', label: `${t.tabDivergences} (${divergences.length})` },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  activeTab === tab.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <>
              {/* Aba Todos os itens */}
              {activeTab === 'items' && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t.colMaterial}</TableHead>
                        <TableHead>{t.colStock}</TableHead>
                        <TableHead className="text-right">{t.colExpected}</TableHead>
                        <TableHead className="text-right">{t.colCounted}</TableHead>
                        <TableHead className="text-right">{t.colDiff}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            {t.empty.noneItems}
                          </TableCell>
                        </TableRow>
                      ) : (
                        items.map((item) => {
                          const diff = item.diff ?? 0;
                          const isSaving = savingIds.has(item.id);
                          return (
                            <TableRow key={item.id}>
                              <TableCell>
                                <div>
                                  <p className="text-sm font-medium">{item.material_name}</p>
                                  {item.material_sku && (
                                    <p className="text-[10px] text-muted-foreground font-mono">{item.material_sku}</p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{item.stock_name}</TableCell>
                              <TableCell className="text-right text-sm">
                                {item.expected_qty} {item.material_unit ?? ''}
                              </TableCell>
                              <TableCell className="text-right">
                                {isEditable ? (
                                  <div className="flex justify-end">
                                    <NumericInput
                                      decimal
                                      maxDecimals={3}
                                      value={getDisplayValue(item)}
                                      onValueChange={(v) => handleValueChange(item.id, v)}
                                      onBlur={() => handleBlur(item)}
                                      disabled={isSaving}
                                      placeholder={t.notCountedPlaceholder}
                                      className="h-8 w-24 text-right text-sm"
                                    />
                                  </div>
                                ) : (
                                  <span className="text-sm">
                                    {item.counted_qty != null ? item.counted_qty : (
                                      <span className="text-muted-foreground italic">{t.notCounted}</span>
                                    )}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {item.counted_qty == null ? (
                                  <span className="text-muted-foreground">—</span>
                                ) : diff === 0 ? (
                                  <span className="flex items-center justify-end gap-1 text-muted-foreground">
                                    <Minus className="h-3 w-3" /> 0
                                  </span>
                                ) : diff > 0 ? (
                                  <span className="flex items-center justify-end gap-1 text-success font-medium">
                                    <TrendingUp className="h-3 w-3" /> +{diff}
                                  </span>
                                ) : (
                                  <span className="flex items-center justify-end gap-1 text-destructive font-medium">
                                    <TrendingDown className="h-3 w-3" /> {diff}
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Aba Divergências */}
              {activeTab === 'divergences' && (
                <div className="overflow-x-auto">
                  {divergences.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground text-sm">
                      {t.empty.noDivergences}
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t.colMaterial}</TableHead>
                          <TableHead>{t.colStock}</TableHead>
                          <TableHead className="text-right">{t.colExpected}</TableHead>
                          <TableHead className="text-right">{t.colCounted}</TableHead>
                          <TableHead className="text-right">{t.colDiff}</TableHead>
                          <TableHead className="text-right">{t.colDiffValue}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {divergences.map((d) => {
                          const diff = d.diff ?? 0;
                          return (
                            <TableRow key={d.item_id}>
                              <TableCell>
                                <div>
                                  <p className="text-sm font-medium">{d.material_name}</p>
                                  {d.material_sku && (
                                    <p className="text-[10px] text-muted-foreground font-mono">{d.material_sku}</p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{d.stock_name}</TableCell>
                              <TableCell className="text-right text-sm">{d.expected_qty ?? '—'}</TableCell>
                              <TableCell className="text-right text-sm">{d.counted_qty ?? '—'}</TableCell>
                              <TableCell className="text-right">
                                {diff > 0 ? (
                                  <Badge className="bg-success text-white">+{diff}</Badge>
                                ) : (
                                  <Badge className="bg-destructive text-white">{diff}</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right text-sm font-medium">
                                {d.diff_value != null ? formatCurrency(d.diff_value) : '—'}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        <TableRow className="font-semibold">
                          <TableCell colSpan={5} className="text-right">{t.totalDiffLabel}</TableCell>
                          <TableCell className="text-right">{formatCurrency(totalDiffValue)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </ResponsiveModal>

      {/* Dialog de finalização */}
      <AlertDialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.finalizeDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {divergences.length > 0
                ? t.finalizeDialog.descriptionWithDivergences
                    .replace('{count}', String(divergences.length))
                    .replace('{value}', formatCurrency(totalDiffValue))
                : t.finalizeDialog.descriptionNone}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 py-2">
            <Label htmlFor="finalize-notes" className="text-sm">{t.finalizeDialog.notesLabel}</Label>
            <Textarea
              id="finalize-notes"
              className="mt-1.5 resize-none"
              rows={2}
              placeholder={t.finalizeDialog.notesPlaceholder}
              value={finalizeNotes}
              onChange={(e) => setFinalizeNotes(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={finalizing}>{t.finalizeDialog.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={finalizing}
              onClick={handleFinalize}
              className="bg-success text-white hover:bg-success/90"
            >
              {finalizing ? t.finalizeDialog.finalizing : t.finalizeDialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

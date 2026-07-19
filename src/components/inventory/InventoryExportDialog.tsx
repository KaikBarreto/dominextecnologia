import { useMemo, useState, useEffect } from 'react';
import { FileText, FileSpreadsheet } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { InventoryItem } from '@/hooks/useInventory';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

export type ExportFormat = 'pdf' | 'excel';

interface InventoryExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Formato escolhido no dropdown — define qual gerador roda na confirmação. */
  format: ExportFormat | null;
  items: InventoryItem[];
  /** Recebe os itens marcados pra gerar o relatório. */
  onConfirm: (selected: InventoryItem[]) => void;
}

export function InventoryExportDialog({
  open,
  onOpenChange,
  format,
  items,
  onConfirm,
}: InventoryExportDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.exportDialog;
  // Conjunto de IDs marcados. Todos marcados por padrão ao abrir.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  }, [open, items]);

  const allSelected = items.length > 0 && selectedIds.size === items.length;
  const selectedCount = selectedIds.size;

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(items.map((i) => i.id)));
  const clearAll = () => setSelectedIds(new Set());

  const selectedItems = useMemo(
    () => items.filter((i) => selectedIds.has(i.id)),
    [items, selectedIds],
  );

  const confirmLabel = format === 'excel' ? t.exportExcel : t.exportPdf;
  const ConfirmIcon = format === 'excel' ? FileSpreadsheet : FileText;

  const handleConfirm = () => {
    if (selectedItems.length === 0) return;
    onConfirm(selectedItems);
    onOpenChange(false);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t.title}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {selectedCount !== 1
              ? t.selectedCountPlural
                  .replace('{selected}', String(selectedCount))
                  .replace('{total}', String(items.length))
              : t.selectedCount
                  .replace('{selected}', String(selectedCount))
                  .replace('{total}', String(items.length))}
          </span>
          <Button
            onClick={handleConfirm}
            disabled={selectedCount === 0}
            className="min-h-11 rounded-xl gap-2"
          >
            <ConfirmIcon className="h-4 w-4" />
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Ações em massa */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg"
            onClick={selectAll}
            disabled={allSelected}
          >
            {t.selectAll}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg"
            onClick={clearAll}
            disabled={selectedCount === 0}
          >
            {t.clearAll}
          </Button>
        </div>

        {/* Lista de materiais com checkbox */}
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t.noneToExport}
          </p>
        ) : (
          <div className="rounded-xl border bg-card divide-y">
            {items.map((item) => {
              const checked = selectedIds.has(item.id);
              const sub: string[] = [];
              if (item.sku) sub.push(item.sku);
              if (item.category) sub.push(item.category);
              return (
                <label
                  key={item.id}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors',
                    'hover:bg-muted/50',
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(item.id)}
                    aria-label={`${t.selectAll.split(' ')[0]} ${item.name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    {sub.length > 0 && (
                      <p className="truncate text-xs text-muted-foreground">{sub.join(' • ')}</p>
                    )}
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[11px]">
                    {item.quantity ?? 0} {item.unit || 'un'}
                  </Badge>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}

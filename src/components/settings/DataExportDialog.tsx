import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, FileSpreadsheet, Info, Loader2 } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import {
  DEFAULT_EXPORT_SELECTION,
  EXPORT_GROUPS,
  useCompanyDataExport,
  type ExportGroupKey,
} from '@/hooks/useCompanyDataExport';

/**
 * Modal "Exportar meus dados" — gera um único .xlsx com as abas escolhidas.
 *
 * Estrutura (de cima pra baixo):
 *  - Descrição curta.
 *  - Master checkbox "Marcar tudo" / "Limpar seleção".
 *  - Lista de checkboxes, um por ExportGroupKey (rótulo via i18n `groups`).
 *  - Aviso das abas pesadas (inventoryMovements/timeRecords vêm desmarcadas).
 *  - Barra de progresso durante a exportação.
 *  - Footer com Cancelar / Exportar.
 *
 * Consome `useCompanyDataExport()` (Dev A) — não chama supabase direto.
 *
 * Plano: docs/planos/2026-09-10-exportar-dados-empresa-excel.md
 */

export interface DataExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DataExportDialog({
  open,
  onOpenChange,
}: DataExportDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.settings.dataExport;
  const { toast } = useToast();
  const { run, progress, isRunning, error, reset } = useCompanyDataExport();

  const [selection, setSelection] = useState<Record<ExportGroupKey, boolean>>(
    DEFAULT_EXPORT_SELECTION,
  );

  // Reset do form quando o modal fecha.
  useEffect(() => {
    if (!open) {
      setSelection(DEFAULT_EXPORT_SELECTION);
      reset();
    }
  }, [open, reset]);

  const selectedCount = useMemo(
    () => Object.values(selection).filter(Boolean).length,
    [selection],
  );

  const allSelected = selectedCount === EXPORT_GROUPS.length;
  const canConfirm = selectedCount > 0 && !isRunning;

  const handleToggleAll = (checked: boolean) => {
    const next = {} as Record<ExportGroupKey, boolean>;
    for (const key of EXPORT_GROUPS) {
      next[key] = checked;
    }
    setSelection(next);
  };

  const handleToggle = (key: ExportGroupKey, checked: boolean) => {
    setSelection((prev) => ({ ...prev, [key]: checked }));
  };

  const handleConfirm = async () => {
    if (!canConfirm) return;

    try {
      await run(selection);
      toast({ title: t.successToast });
      onOpenChange(false);
    } catch (err) {
      const message = (err as { message?: string })?.message;
      toast({
        variant: 'destructive',
        title: t.errorToast,
        description: message,
      });
    }
  };

  // Bloqueia close enquanto está exportando.
  const handleOpenChange = (nextOpen: boolean) => {
    if (isRunning && !nextOpen) return;
    onOpenChange(nextOpen);
  };

  const progressPercent =
    progress && progress.total > 0 ? Math.round((progress.index / progress.total) * 100) : 0;

  const footer = isRunning ? (
    <div className="flex items-start gap-3 rounded-md border border-primary/30 bg-primary/5 p-3">
      <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
      <div className="flex-1 space-y-2 text-sm text-foreground">
        <div className="font-medium">{t.running}</div>
        {progress && (
          <>
            <div className="text-xs text-muted-foreground">
              {t.progressLabel
                .replace('{sheet}', t.sheets[progress.sheetKey] ?? progress.sheetKey)
                .replace('{rows}', String(progress.rows))}
            </div>
            <Progress value={progressPercent} className="h-1.5" />
          </>
        )}
      </div>
    </div>
  ) : (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
        {t.cancel}
      </Button>
      <Button
        onClick={handleConfirm}
        disabled={!canConfirm}
        className="w-full sm:w-auto"
      >
        <FileSpreadsheet className="mr-2 h-4 w-4" />
        {t.confirm}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleOpenChange}
      title={t.dialogTitle}
      description={t.dialogDescription}
      footer={footer}
    >
      <div className="space-y-4">
        {/* Marcar tudo / limpar */}
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <label
            className="flex min-h-[44px] flex-1 cursor-pointer items-center gap-3"
            htmlFor="export-select-all"
          >
            <Checkbox
              id="export-select-all"
              checked={allSelected}
              onCheckedChange={(c) => handleToggleAll(c === true)}
              disabled={isRunning}
            />
            <span className="text-sm font-semibold text-foreground">{t.selectAll}</span>
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-xs text-muted-foreground"
            onClick={() => handleToggleAll(false)}
            disabled={isRunning || selectedCount === 0}
          >
            {t.clearAll}
          </Button>
        </div>

        {/* Lista de checkboxes — um por grupo */}
        <div className="space-y-0.5">
          {EXPORT_GROUPS.map((key) => {
            const isChecked = selection[key];
            return (
              <label
                key={key}
                htmlFor={`export-${key}`}
                className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/40 transition-colors ${
                  isChecked ? 'bg-muted/20' : ''
                }`}
              >
                <Checkbox
                  id={`export-${key}`}
                  checked={isChecked}
                  onCheckedChange={(c) => handleToggle(key, c === true)}
                  disabled={isRunning}
                />
                <span className="text-sm font-medium text-foreground">{t.groups[key]}</span>
              </label>
            );
          })}
        </div>

        {/* Aviso das abas pesadas */}
        <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">{t.heavyHint}</p>
        </div>

        {/* Aviso de seleção vazia */}
        {selectedCount === 0 && (
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs text-foreground">{t.emptySelection}</p>
          </div>
        )}

        {/* Erro da última tentativa */}
        {error && !isRunning && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}

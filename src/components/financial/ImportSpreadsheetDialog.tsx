import { useEffect, useMemo, useRef, useState } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import {
  Upload, Download, Loader2, FileWarning, CheckCircle2, Undo2, FileSpreadsheet,
} from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { useCostCenters } from '@/hooks/useCostCenters';
import { PAYMENT_METHOD_CODES } from '@/lib/finance-payment-methods';
import { downloadFinancialImportTemplate, type FinancialTemplateLogo } from '@/utils/financialImport/buildTemplate';
import type { ParsedRow } from '@/utils/financialImport/parseSheet';
import {
  useFinancialImport,
  parseAndHashFinancialSheet,
  buildFinancialImportPayload,
  type FinancialImportRowOverride,
  type FinancialImportRevertResult,
} from '@/hooks/useFinancialImport';
import { ImportSummaryBar } from './importSpreadsheet/ImportSummaryBar';
import { ImportRowsList } from './importSpreadsheet/ImportRowsList';
import { ImportResultPanel } from './importSpreadsheet/ImportResultPanel';
import { ImportHistorySection } from './importSpreadsheet/ImportHistorySection';

interface ImportSpreadsheetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** `2026-10-18` → `18/10/2026`. Nunca `new Date(iso)` (UTC voltaria um dia). */
function formatDateBR(iso: string | null): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** `.png`/`.jpg`/`.jpeg` reconhecidos pelo `exceljs`. Qualquer outro (svg, webp) → sem logo. */
function inferImageExtension(url: string): 'png' | 'jpeg' | null {
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.png')) return 'png';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'jpeg';
  return null;
}

/** Baixa o logo como `ArrayBuffer`. Falha de rede/tipo nunca quebra o download do molde — vira `null`. */
async function resolveTemplateLogo(url: string | null): Promise<FinancialTemplateLogo | null> {
  if (!url) return null;
  const extension = inferImageExtension(url);
  if (!extension) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.arrayBuffer();
    return { data, extension };
  } catch {
    return null;
  }
}

/**
 * Upload → conferência → gravação da importação financeira por planilha.
 * `useFinancialImport` é a ÚNICA fronteira do Supabase; este componente e os
 * de `importSpreadsheet/` nunca chamam `supabase.rpc(...)` direto.
 */
export function ImportSpreadsheetDialog({ open, onOpenChange }: ImportSpreadsheetDialogProps) {
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.spreadsheetImport;
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const whiteLabel = useWhiteLabel();
  const { settings } = useCompanySettings();
  const { accounts } = useFinancialAccounts();
  const { categories } = useFinancialCategories();
  const { costCenters, activeCostCenters } = useCostCenters();
  const { preview, apply, revert } = useFinancialImport();

  const [isDragOver, setIsDragOver] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);

  const [fileName, setFileName] = useState<string | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[] | null>(null);
  const [excludedRowCount, setExcludedRowCount] = useState(0);
  const [overrides, setOverrides] = useState<Record<number, FinancialImportRowOverride>>({});
  const [selected, setSelected] = useState<Record<number, boolean>>({});

  const [revertResult, setRevertResult] = useState<FinancialImportRevertResult | null>(null);
  const [isRevertingExisting, setIsRevertingExisting] = useState(false);
  const [existingRevertResult, setExistingRevertResult] = useState<FinancialImportRevertResult | null>(null);

  const resetAll = () => {
    setFileName(null);
    setFileHash(null);
    setParsedRows(null);
    setExcludedRowCount(0);
    setOverrides({});
    setSelected({});
    setRevertResult(null);
    setExistingRevertResult(null);
    preview.reset();
    apply.reset();
    revert.reset();
  };

  useEffect(() => {
    if (!open) resetAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Sempre que uma nova conferência chega do servidor, a seleção parte do
  // default (pronta = marcada, duplicada/bloqueada = desmarcada) — reprocessar
  // depois de corrigir um campo reaplica esse default.
  useEffect(() => {
    if (!preview.data || preview.data.already_imported) return;
    const next: Record<number, boolean> = {};
    for (const row of preview.data.rows) next[row.row_number] = row.status === 'ready';
    setSelected(next);
  }, [preview.data]);

  const handleDownloadTemplate = async () => {
    setIsGeneratingTemplate(true);
    try {
      // ⚠️ Logo ESCURO no padrão Dominex: no molde o logo fica numa faixa
      // BRANCA, acima da faixa preta do título. O logo branco sumia no fundo.
      // Tenant white-label manda o logo dele, que também é lido sobre branco —
      // é por isso que a faixa do logo não é colorida.
      const logoUrl = whiteLabel.enabled && whiteLabel.logoUrl ? whiteLabel.logoUrl : whiteLabel.defaultLogoDark;
      const logo = await resolveTemplateLogo(logoUrl);
      await downloadFinancialImportTemplate({
        companyName: settings?.name || '',
        logo,
        primaryColor: whiteLabel.enabled ? whiteLabel.primaryColor : null,
        // A `color` de cada cadastro vai junto: o molde pinta a célula com a
        // MESMA cor que o item tem na tela, então categoria "Impostos" fica
        // igual aqui e no sistema. Sem cor no cadastro, o item só entra no
        // dropdown — nunca inventamos uma cor.
        accounts: accounts
          .filter((a) => a.is_active && a.type !== 'cartao')
          .map((a) => ({ name: a.name, color: a.color })),
        categories: categories.filter((c) => c.is_active).map((c) => ({ name: c.name, color: c.color })),
        costCenters: activeCostCenters.map((c) => ({ name: c.name, color: c.color })),
        paymentMethods: [...PAYMENT_METHOD_CODES],
        locale,
        currencyCode: currency,
      });
    } catch {
      toast({ variant: 'destructive', title: t.templateErrorTitle, description: t.templateErrorDescription });
    } finally {
      setIsGeneratingTemplate(false);
    }
  };

  const handleFile = async (file: File) => {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      toast({ variant: 'destructive', title: t.dropzone.invalidType });
      return;
    }
    setIsParsing(true);
    try {
      const { parsed, fileHash: hash, fileName: name } = await parseAndHashFinancialSheet(file);
      if (parsed.rows.length === 0) {
        toast({ variant: 'destructive', title: t.toasts.previewErrorTitle, description: t.parseEmptyError });
        return;
      }
      setParsedRows(parsed.rows);
      setFileHash(hash);
      setFileName(name);
      setOverrides({});
      const { rows, excludedRowNumbers } = buildFinancialImportPayload(parsed.rows, {});
      setExcludedRowCount(excludedRowNumbers.length);
      preview.mutate(
        { fileHash: hash, rows },
        { onError: (err) => toast({ variant: 'destructive', title: t.toasts.previewErrorTitle, description: err.message }) },
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleReprocess = () => {
    if (!parsedRows || !fileHash) return;
    const { rows, excludedRowNumbers } = buildFinancialImportPayload(parsedRows, overrides);
    setExcludedRowCount(excludedRowNumbers.length);
    preview.mutate(
      { fileHash, rows },
      { onError: (err) => toast({ variant: 'destructive', title: t.toasts.previewErrorTitle, description: err.message }) },
    );
  };

  const handleOverrideChange = (rowNumber: number, patch: FinancialImportRowOverride) => {
    setOverrides((prev) => ({ ...prev, [rowNumber]: { ...prev[rowNumber], ...patch } }));
  };

  const hasPendingOverrides = Object.keys(overrides).length > 0;

  const selectedRowNumbers = useMemo(() => {
    if (!preview.data) return [];
    return preview.data.rows.filter((r) => selected[r.row_number]).map((r) => r.row_number);
  }, [preview.data, selected]);

  const handleApply = () => {
    if (!parsedRows || !fileHash || !fileName || selectedRowNumbers.length === 0) return;
    const { rows } = buildFinancialImportPayload(parsedRows, overrides);
    const rowsToApply = rows.filter((r) => selectedRowNumbers.includes(r.row_number));
    apply.mutate(
      { fileName, fileHash, rows: rowsToApply },
      { onError: (err) => toast({ variant: 'destructive', title: t.toasts.applyErrorTitle, description: err.message }) },
    );
  };

  const handleRevertApplied = () => {
    if (!apply.data) return;
    revert.mutate(
      { importId: apply.data.import_id },
      {
        onSuccess: setRevertResult,
        onError: (err) => toast({ variant: 'destructive', title: t.toasts.revertErrorTitle, description: err.message }),
      },
    );
  };

  const handleRevertExisting = () => {
    const existingId = preview.data?.existing_import?.id;
    if (!existingId) return;
    setIsRevertingExisting(true);
    revert.mutate(
      { importId: existingId },
      {
        onSuccess: (res) => {
          setExistingRevertResult(res);
          setIsRevertingExisting(false);
          if (res.kept_count === 0) {
            // Desfeito por inteiro: a MESMA planilha já não está "já importada" — reconfere.
            handleReprocess();
          }
        },
        onError: (err) => {
          setIsRevertingExisting(false);
          toast({ variant: 'destructive', title: t.toasts.revertErrorTitle, description: err.message });
        },
      },
    );
  };

  const handleStartOver = () => resetAll();

  const previewData = preview.data;
  const isAlreadyImported = !!previewData?.already_imported && !existingRevertResult;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t.dialogTitle}
      className="sm:max-w-3xl"
      footer={
        apply.data ? (
          <Button className="w-full sm:w-auto" onClick={handleStartOver}>
            {t.startOver}
          </Button>
        ) : previewData && !isAlreadyImported ? (
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center">
            {hasPendingOverrides && (
              <Button variant="outline" onClick={handleReprocess} disabled={preview.isPending}>
                {preview.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.reprocessing}
                  </>
                ) : (
                  t.reprocessButton
                )}
              </Button>
            )}
            <Button onClick={handleApply} disabled={selectedRowNumbers.length === 0 || apply.isPending}>
              {apply.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t.applying}
                </>
              ) : (
                t.applyButton.replace('{count}', String(selectedRowNumbers.length))
              )}
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            {t.close}
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {!parsedRows && (
          <>
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center gap-2 min-w-0">
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground truncate">{t.uploadTitle}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={handleDownloadTemplate}
                disabled={isGeneratingTemplate}
              >
                {isGeneratingTemplate ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {t.downloadTemplate}
              </Button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) handleFile(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              disabled={isParsing}
              className={cn(
                'flex w-full flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center transition-colors',
                isDragOver ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
              )}
            >
              {isParsing ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <span className="text-sm font-medium">{t.parsing}</span>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm font-medium">{isDragOver ? t.dropzone.hover : t.dropzone.idle}</span>
                  <span className="text-xs text-muted-foreground">{t.dropzone.hint}</span>
                </>
              )}
            </button>

            <ImportHistorySection revert={revert} locale={locale} currency={currency} />
          </>
        )}

        {parsedRows && preview.isPending && !previewData && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">{t.previewing}</span>
          </div>
        )}

        {excludedRowCount > 0 && parsedRows && (
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3">
            <FileWarning className="h-4 w-4 shrink-0 text-warning mt-0.5" />
            <p className="text-sm text-muted-foreground">
              {t.excludedRowsWarning.replace('{count}', String(excludedRowCount))}
            </p>
          </div>
        )}

        {isAlreadyImported && previewData?.existing_import && (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileWarning className="h-4 w-4 shrink-0 text-warning" />
              {t.alreadyImported.title}
            </p>
            <p className="text-sm text-muted-foreground">{t.alreadyImported.description}</p>
            <p className="text-xs text-muted-foreground">
              {t.alreadyImported.existingLabel
                .replace('{fileName}', previewData.existing_import.file_name)
                .replace('{date}', formatDateBR(previewData.existing_import.created_at))}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 hover:bg-destructive hover:text-white hover:border-destructive"
              onClick={handleRevertExisting}
              disabled={isRevertingExisting}
            >
              {isRevertingExisting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
              {t.alreadyImported.viewOrRevertCta}
            </Button>
          </div>
        )}

        {existingRevertResult && existingRevertResult.kept_count > 0 && (
          <div className="space-y-1 rounded-md border border-warning/40 bg-warning/5 p-3">
            <p className="text-sm font-medium text-foreground">
              {t.result.revertPartialTitle.replace('{count}', String(existingRevertResult.kept_count))}
            </p>
            <p className="text-sm text-muted-foreground">{t.result.revertPartialDescription}</p>
          </div>
        )}

        {previewData && !isAlreadyImported && !apply.data && (
          <>
            <ImportSummaryBar
              readyCount={previewData.ready_count}
              blockedCount={previewData.blocked_count}
              duplicateCount={previewData.duplicate_count}
              totalIn={previewData.total_in}
              totalOut={previewData.total_out}
              locale={locale}
              currency={currency}
            />
            <ImportRowsList
              rows={previewData.rows}
              selected={selected}
              onToggleSelected={(rowNumber, value) => setSelected((prev) => ({ ...prev, [rowNumber]: value }))}
              overrides={overrides}
              onOverrideChange={handleOverrideChange}
              categories={categories}
              accounts={accounts}
              costCenters={costCenters}
              locale={locale}
              currency={currency}
            />
          </>
        )}

        {apply.data && !apply.data.already_imported && (
          <ImportResultPanel
            result={apply.data}
            revertResult={revertResult}
            onRevert={handleRevertApplied}
            isReverting={revert.isPending}
            locale={locale}
            currency={currency}
          />
        )}

        {/* Corrida rara (duas abas gravando o mesmo arquivo ao mesmo tempo): nada entrou agora. */}
        {apply.data?.already_imported && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t.alreadyImported.description}</p>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, AlertTriangle, CheckCircle2, FileWarning, RefreshCw } from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useBankReconciliation } from '@/hooks/useBankReconciliation';
import { useToast } from '@/hooks/use-toast';
import { formatSignedMoney } from '@/lib/reconciliation/format';
import type { CreateImportResult } from '@/lib/reconciliation/types';

interface ImportOfxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  accountName: string;
  onImported: (importId: string) => void;
}

/**
 * Os 3 ramos possíveis do retorno de `create_bank_statement_import`. Extraído
 * como função pura (ver `ImportOfxDialog.nothingNewView.test.ts`) porque um
 * bug real (2026-10-18, QA do Tech Lead) nasceu de nenhum caminho de código
 * cobrir explicitamente o ramo `nothing_new` — a RPC respondia 200 e a tela
 * ficava parada na escolha de arquivo, em silêncio. `nothing_new` nunca tem
 * `import_id` (nenhum import foi criado), por isso vem ANTES de
 * `already_imported` nesta função: se um dia a RPC mandar os dois `true` ao
 * mesmo tempo, não há import pra continuar, então `nothingNew` tem que
 * ganhar.
 */
export type ImportOfxView = 'chooseFile' | 'nothingNew' | 'alreadyImported' | 'inserted';

export function getImportOfxView(
  result: Pick<CreateImportResult, 'nothing_new' | 'already_imported'> | null,
): ImportOfxView {
  if (!result) return 'chooseFile';
  if (result.nothing_new) return 'nothingNew';
  if (result.already_imported) return 'alreadyImported';
  return 'inserted';
}

/**
 * Qual footer aparece pra cada ramo. `nothingNew` só tem o botão de fechar —
 * nunca `onImported(null)`, porque não existe import pra abrir nesse ramo.
 */
export type ImportOfxFooterAction =
  | { kind: 'form' }
  | { kind: 'close' }
  | { kind: 'continue'; ctaKey: 'alreadyImportedCta' | 'resultContinue' };

export function getImportOfxFooterAction(view: ImportOfxView): ImportOfxFooterAction {
  switch (view) {
    case 'chooseFile':
      return { kind: 'form' };
    case 'nothingNew':
      return { kind: 'close' };
    case 'alreadyImported':
      return { kind: 'continue', ctaKey: 'alreadyImportedCta' };
    case 'inserted':
      return { kind: 'continue', ctaKey: 'resultContinue' };
  }
}

/** `posted_at`/amostras chegam YYYY-MM-DD(THH:MM...). Fatiar a string, nunca `new Date(...)`. */
function formatDateBR(iso: string | null): string {
  if (!iso) return '';
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Upload + preview do resultado da importação. O preview em si só existe
 * DEPOIS de chamar `create_bank_statement_import` (não há endpoint de
 * "dry run" no contrato) — por isso o fluxo é: escolher arquivo → importar →
 * mostrar o resumo (inseridas/descartadas/sinal suspeito) antes de ir pro
 * extrato.
 */
export function ImportOfxDialog({ open, onOpenChange, accountId, accountName, onImported }: ImportOfxDialogProps) {
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.reconciliation.import;
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [importedId, setImportedId] = useState<string | null>(null);

  const { importOfx, flipSign, state: importedState } = useBankReconciliation(importedId);
  const result = importOfx.data ?? null;
  const view = getImportOfxView(result);
  const footerAction = getImportOfxFooterAction(view);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setImportedId(null);
      importOfx.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const signSuspectEntryIds = useMemo(
    () => (importedState?.entries ?? []).filter((e) => e.sign_suspect && !e.sign_flipped && e.status === 'pending').map((e) => e.id),
    [importedState],
  );

  const handleSubmit = () => {
    if (!file) return;
    importOfx.mutate(
      { file, accountId },
      {
        onSuccess: (res) => setImportedId(res.import_id),
      },
    );
  };

  const handleContinue = () => {
    // `nothing_new` não tem `import_id` (nenhum import foi criado) — este
    // botão não existe nesse ramo, mas o guarda evita um `onImported(null)`
    // que não leva a lugar nenhum se algo mudar por aqui no futuro.
    if (!result || !result.import_id) return;
    onImported(result.import_id);
    onOpenChange(false);
  };

  const handleFixSigns = () => {
    if (signSuspectEntryIds.length === 0) return;
    flipSign.mutate(
      { entryIds: signSuspectEntryIds, flipped: true },
      {
        onSuccess: (res) => {
          toast({ title: t.signSuspectFixedToast.replace('{count}', String(res.changed_count)) });
        },
      },
    );
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t.dialogTitle}
      description={view === 'chooseFile' ? t.dialogDescription.replace('{account}', accountName) : undefined}
      footer={
        footerAction.kind === 'form' ? (
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importOfx.isPending}>
              {t.cancel}
            </Button>
            <Button onClick={handleSubmit} disabled={!file || importOfx.isPending}>
              {importOfx.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t.importing}
                </>
              ) : (
                t.submit
              )}
            </Button>
          </div>
        ) : footerAction.kind === 'close' ? (
          <Button className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            {t.close}
          </Button>
        ) : (
          <Button className="w-full sm:w-auto" onClick={handleContinue}>
            {t[footerAction.ctaKey]}
          </Button>
        )
      }
    >
      {!result ? (
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".ofx"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center hover:bg-muted/50"
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm font-medium">{t.chooseFile}</span>
            <span className="text-xs text-muted-foreground">{file ? file.name : t.noFileChosen}</span>
          </button>
        </div>
      ) : result.nothing_new ? (
        <div className="space-y-3">
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileWarning className="h-4 w-4 shrink-0 text-warning" />
              {t.nothingNewTitle}
            </p>
            <p className="text-sm text-muted-foreground">
              {t.nothingNewDescription.replace('{count}', String(result.skipped_dup_count))}
            </p>
          </div>

          {result.skipped_samples.length > 0 && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t.resultSkippedSamplesTitle}
              </p>
              <div className="max-h-32 space-y-1 overflow-y-auto">
                {result.skipped_samples.map((s, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    {t.resultSkippedSampleRow
                      .replace('{date}', formatDateBR(s.posted_at))
                      .replace('{amount}', s.amount != null ? formatSignedMoney(s.amount, currency, locale) : '')
                      .replace('{memo}', s.memo || s.name || '')}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : result.already_imported ? (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileWarning className="h-4 w-4 shrink-0 text-warning" />
            {t.alreadyImportedTitle}
          </p>
          <p className="text-sm text-muted-foreground">{t.alreadyImportedDescription}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-md border bg-success/5 p-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
            <div>
              <p className="text-sm font-semibold text-foreground">{t.resultTitle}</p>
              <p className="text-sm text-muted-foreground">{t.resultInserted.replace('{count}', String(result.inserted_count))}</p>
            </div>
          </div>

          {result.acct_warning && (
            <div className="space-y-1 rounded-md border border-warning/40 bg-warning/5 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                {t.acctWarningTitle}
              </p>
              <p className="text-sm text-muted-foreground">{t.acctWarningDescription}</p>
            </div>
          )}

          {result.skipped_dup_count > 0 && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <p className="text-sm text-foreground">{t.resultSkipped.replace('{count}', String(result.skipped_dup_count))}</p>
              {result.skipped_samples.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t.resultSkippedSamplesTitle}
                  </p>
                  <div className="max-h-32 space-y-1 overflow-y-auto">
                    {result.skipped_samples.map((s, i) => (
                      <p key={i} className="text-xs text-muted-foreground">
                        {t.resultSkippedSampleRow
                          .replace('{date}', formatDateBR(s.posted_at))
                          .replace('{amount}', s.amount != null ? formatSignedMoney(s.amount, currency, locale) : '')
                          .replace('{memo}', s.memo || s.name || '')}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {result.sign_suspect_count > 0 && (
            <div className="space-y-2 rounded-md border border-warning/40 bg-warning/5 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                {t.signSuspectWarningTitle}
              </p>
              <p className="text-sm text-muted-foreground">
                {t.signSuspectWarningDescription.replace('{count}', String(result.sign_suspect_count))}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 hover:bg-warning hover:text-white hover:border-warning"
                disabled={flipSign.isPending || signSuspectEntryIds.length === 0}
                onClick={handleFixSigns}
              >
                {flipSign.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {t.signSuspectFixButton}
              </Button>
              <p className="text-[11px] text-muted-foreground">{t.signSuspectFixHint}</p>
            </div>
          )}

        </div>
      )}
    </ResponsiveModal>
  );
}

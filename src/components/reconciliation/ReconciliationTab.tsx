import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SearchableSelect, type SearchableSelectGroup } from '@/components/ui/SearchableSelect';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { useStatementImports, type StatementImportSummary } from '@/hooks/useBankReconciliation';
import type { ReconciliationTabState } from '@/lib/reconciliation/types';
import { ImportOfxDialog } from './ImportOfxDialog';
import { ReconciliationTable } from './ReconciliationTable';
import { ReconciliationHelpModal } from './ReconciliationHelpModal';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { ChevronDown, CheckCircle2, FileUp, HelpCircle, History, Play, RotateCcw, UploadCloud, X } from 'lucide-react';

export interface ReconciliationTabProps {
  /** Estado controlado pelo pai (`FinanceMovimentacoes`) — preserva entre trocas de aba. */
  state?: ReconciliationTabState;
  onStateChange?: (next: ReconciliationTabState) => void;
}

/** `period_start`/`period_end` chegam YYYY-MM-DD. Nunca `new Date(...)`. */
function formatDateBR(iso: string | null): string {
  if (!iso) return '';
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Aba "Conciliação" de Movimentações: seletor de conta, retomar, importar, histórico. */
export function ReconciliationTab({ state, onStateChange }: ReconciliationTabProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.reconciliation.tab;

  const { accounts } = useFinancialAccounts();
  // Conta `cartao` agora é válida (modo FATURA, 20261018140000) — mas o fluxo
  // dela é outro, então separa visualmente num grupo próprio em vez de
  // misturar com conta banco/caixa (briefing: oferecer, não escondER).
  const reconcilableAccounts = useMemo(() => accounts.filter((a) => a.is_active), [accounts]);
  const bankAccounts = useMemo(() => reconcilableAccounts.filter((a) => a.type !== 'cartao'), [reconcilableAccounts]);
  const cardAccounts = useMemo(() => reconcilableAccounts.filter((a) => a.type === 'cartao'), [reconcilableAccounts]);
  const accountGroups: SearchableSelectGroup[] = useMemo(
    () =>
      [
        { heading: t.accountGroupBank, options: bankAccounts.map((a) => ({ value: a.id, label: a.name })) },
        { heading: t.accountGroupCard, options: cardAccounts.map((a) => ({ value: a.id, label: a.name })) },
      ].filter((g) => g.options.length > 0),
    [bankAccounts, cardAccounts, t.accountGroupBank, t.accountGroupCard],
  );

  const [internal, setInternal] = useState<ReconciliationTabState>({ accountId: null, importId: null });
  const current = state ?? internal;
  const setState = (next: ReconciliationTabState) => {
    if (onStateChange) onStateChange(next);
    else setInternal(next);
  };

  const [importOpen, setImportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const selectedAccount = useMemo(
    () => reconcilableAccounts.find((a) => a.id === current.accountId) ?? null,
    [reconcilableAccounts, current.accountId],
  );

  const { data: imports = [], isLoading: importsLoading } = useStatementImports(current.accountId);
  const openImports = useMemo(() => imports.filter((i) => i.status === 'open'), [imports]);
  const finalizedImports = useMemo(() => imports.filter((i) => i.status === 'finalized'), [imports]);

  const openedImportIsFinalized = useMemo(
    () => !!current.importId && imports.some((i) => i.id === current.importId && i.status === 'finalized'),
    [imports, current.importId],
  );

  const handleSelectAccount = (accountId: string) => {
    // Trocar de conta zera o import aberto (o extrato é de uma conta só).
    setState({ accountId, importId: null });
    setHistoryOpen(false);
  };
  const handleImported = (importId: string) => setState({ accountId: current.accountId, importId });
  const handleResume = (importId: string) => setState({ accountId: current.accountId, importId });
  const handleReset = () => setState({ accountId: current.accountId, importId: null });

  const showLanding = !!current.accountId && !current.importId;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <SearchableSelect
            groups={accountGroups}
            value={current.accountId ?? ''}
            onValueChange={handleSelectAccount}
            placeholder={t.accountSelectorPlaceholder}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)}>
            <HelpCircle className="mr-1.5 h-3.5 w-3.5" />
            {t.helpButton}
          </Button>

          {current.accountId && current.importId && (
            <>
              <Button variant="outline" size="sm" onClick={handleReset}>
                {openedImportIsFinalized ? (
                  <>
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    {t.closeButton}
                  </>
                ) : (
                  <>
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    {t.backButton}
                  </>
                )}
              </Button>
              {!openedImportIsFinalized && (
                <Button size="sm" onClick={() => setImportOpen(true)}>
                  <FileUp className="mr-1.5 h-3.5 w-3.5" />
                  {t.importAnotherButton}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {!current.accountId && (
        <EmptyState
          icon={<UploadCloud className="h-10 w-10" />}
          title={t.emptyNoAccount.title}
          description={t.emptyNoAccount.description}
        />
      )}

      {showLanding && (
        <div className="space-y-4">
          {importsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              {openImports.length > 0 && (
                <div className="space-y-3">
                  {openImports.map((imp) => (
                    <ResumeCard key={imp.id} imp={imp} onResume={() => handleResume(imp.id)} />
                  ))}
                </div>
              )}

              {openImports.length === 0 ? (
                <EmptyState
                  icon={<UploadCloud className="h-12 w-12" />}
                  title={t.emptyNoImport.title}
                  description={t.emptyNoImport.description}
                  action={{ label: t.emptyNoImport.cta, onClick: () => setImportOpen(true) }}
                />
              ) : (
                <div className="flex justify-center">
                  <Button onClick={() => setImportOpen(true)}>
                    <FileUp className="mr-2 h-4 w-4" />
                    {t.emptyNoImport.cta}
                  </Button>
                </div>
              )}

              {finalizedImports.length > 0 && (
                <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="flex w-full items-center justify-between px-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <History className="h-4 w-4" />
                        {t.historyToggle.replace('{count}', String(finalizedImports.length))}
                      </span>
                      <ChevronDown className={`h-4 w-4 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-2">
                    {finalizedImports.map((imp) => (
                      <FinalizedRow key={imp.id} imp={imp} onOpen={() => handleResume(imp.id)} />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </>
          )}
        </div>
      )}

      {current.accountId && current.importId && <ReconciliationTable importId={current.importId} />}

      {current.accountId && (
        <ImportOfxDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          accountId={current.accountId}
          accountName={selectedAccount?.name ?? ''}
          onImported={handleImported}
        />
      )}

      <ReconciliationHelpModal open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}

function ResumeCard({ imp, onResume }: { imp: StatementImportSummary; onResume: () => void }) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.reconciliation.tab;
  const done = Math.max(0, imp.total_entries - imp.pending_count);
  const pct = imp.total_entries > 0 ? Math.round((done / imp.total_entries) * 100) : 0;

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Play className="h-4 w-4 shrink-0 text-primary" />
            {t.resumeTitle}
          </p>
          <p className="mt-1 text-sm">
            {imp.is_empty ? (
              t.resumeEmptyNotice
            ) : imp.pending_count > 0 ? (
              t.resumePendingOf.replace('{pending}', String(imp.pending_count)).replace('{total}', String(imp.total_entries))
            ) : (
              t.resumeAllResolved
            )}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {imp.file_name ? `${imp.file_name} · ` : ''}
            {imp.period_start && imp.period_end
              ? t.periodRange.replace('{start}', formatDateBR(imp.period_start)).replace('{end}', formatDateBR(imp.period_end))
              : t.periodUnknown}
          </p>
        </div>
        <Button className="shrink-0" onClick={onResume}>
          <Play className="mr-2 h-4 w-4" />
          {t.resumeContinueButton}
        </Button>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FinalizedRow({ imp, onOpen }: { imp: StatementImportSummary; onOpen: () => void }) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.reconciliation.tab;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-3 rounded-md border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{imp.file_name || '—'}</p>
        <p className="truncate text-xs text-muted-foreground">
          {imp.period_start && imp.period_end
            ? t.periodRange.replace('{start}', formatDateBR(imp.period_start)).replace('{end}', formatDateBR(imp.period_end))
            : t.periodUnknown}{' '}
          · {imp.total_entries}
        </p>
      </div>
      <Badge variant="success" className="shrink-0 gap-1 font-medium">
        <CheckCircle2 className="h-3 w-3" />
        {t.historyDoneBadge}
      </Badge>
    </button>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Lock, ListChecks } from 'lucide-react';
import { useIsCompact } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useBankReconciliation } from '@/hooks/useBankReconciliation';
import { BankExtractList, isEntrySelectable } from './BankExtractList';
import { LedgerMovementsList } from './LedgerMovementsList';
import { EntryActionPanel } from './EntryActionPanel';
import { ReconciliationBulkBar } from './ReconciliationBulkBar';
import { ReconciliationBalanceFooter } from './ReconciliationBalanceFooter';
import { isReconciliationContainerCompact } from '@/lib/reconciliation-layout';

interface ReconciliationTableProps {
  importId: string;
}

/**
 * Dois painéis (padrão Xero/Nibo): ESQUERDA = extrato importado
 * (`BankExtractList`), DIREITA = movimentações do sistema no período
 * (`LedgerMovementsList`) OU, quando uma linha do extrato está selecionada,
 * o `EntryActionPanel` daquela linha. No mobile os painéis NÃO cabem lado a
 * lado: o extrato ocupa a largura toda e selecionar uma linha abre o painel
 * de ações em drawer (`ResponsiveModal`).
 */
export function ReconciliationTable({ importId }: ReconciliationTableProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.reconciliation;
  const isViewportCompact = useIsCompact();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isContainerCompact, setIsContainerCompact] = useState(false);
  const isCompact = isViewportCompact || isContainerCompact;

  const {
    state,
    isLoading,
    matchExisting,
    searchCandidates,
    listCardBills,
    listTransferLegs,
    settleTransaction,
    createTransaction,
    createTransfer,
    payCardBill,
    createEmployeeMovement,
    flipSign,
    ignoreEntry,
    ignoreEntriesBatch,
    unignoreEntriesBatch,
    unmatchEntry,
    finalize,
    reopenReconciliation,
    createCardPurchase,
    matchCardPurchase,
    matchCardBillPayment,
    cardPayBill,
    searchCardPurchases,
  } = useBankReconciliation(importId);
  const hasState = !!state;

  // No primeiro render de loading o container final ainda não existe. Repetir
  // a instalação quando os dados chegam garante que o ResizeObserver observe
  // a largura útil real, inclusive com a sidebar expandida.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const update = (width: number) => {
      setIsContainerCompact(isReconciliationContainerCompact(width));
    };
    update(container.getBoundingClientRect().width);

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? container.getBoundingClientRect().width;
      update(width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [isLoading, hasState]);

  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mobileLedgerOpen, setMobileLedgerOpen] = useState(false);

  const entries = useMemo(() => state?.entries ?? [], [state]);
  const finalized = state?.import.status === 'finalized';

  const selectableIds = useMemo(() => new Set(entries.filter(isEntrySelectable).map((e) => e.id)), [entries]);
  useEffect(() => {
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (selectableIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [selectableIds]);

  // A linha selecionada pode deixar de existir (ex: foi casada em outra aba) —
  // fecha o painel/drawer nesse caso.
  useEffect(() => {
    if (selectedEntryId && !entries.some((e) => e.id === selectedEntryId)) {
      setSelectedEntryId(null);
    }
  }, [entries, selectedEntryId]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const selectedPending = useMemo(
    () => entries.filter((e) => selectedIds.has(e.id) && e.status === 'pending'),
    [entries, selectedIds],
  );
  const selectedIgnored = useMemo(
    () => entries.filter((e) => selectedIds.has(e.id) && e.status === 'ignored'),
    [entries, selectedIds],
  );

  const runIgnoreBatch = useCallback(() => {
    if (selectedPending.length === 0) return;
    ignoreEntriesBatch.mutate({ entryIds: selectedPending.map((e) => e.id) }, { onSuccess: clearSelection });
  }, [selectedPending, ignoreEntriesBatch, clearSelection]);

  const runUnignoreBatch = useCallback(() => {
    if (selectedIgnored.length === 0) return;
    unignoreEntriesBatch.mutate({ entryIds: selectedIgnored.map((e) => e.id) }, { onSuccess: clearSelection });
  }, [selectedIgnored, unignoreEntriesBatch, clearSelection]);

  const runFlipSignBatch = useCallback(() => {
    if (selectedPending.length === 0) return;
    flipSign.mutate({ entryIds: selectedPending.map((e) => e.id), flipped: true }, { onSuccess: clearSelection });
  }, [selectedPending, flipSign, clearSelection]);

  const selectedEntry = selectedEntryId ? entries.find((e) => e.id === selectedEntryId) ?? null : null;

  const mutations = {
    matchExisting,
    searchCandidates,
    listCardBills,
    listTransferLegs,
    settleTransaction,
    createTransaction,
    createTransfer,
    payCardBill,
    createEmployeeMovement,
    flipSign,
    ignoreEntry,
    unmatchEntry,
    createCardPurchase,
    matchCardPurchase,
    matchCardBillPayment,
    cardPayBill,
    searchCardPurchases,
  };

  if (isLoading || !state) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex min-w-0 flex-col" data-layout={isCompact ? 'compact' : 'two-panel'}>
      {finalized && (
        <div className="mb-2 flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" />
          <span className="font-medium text-foreground">{t.tab.readOnlyBanner}</span>
        </div>
      )}

      {!finalized && selectedIds.size > 0 && (
        <ReconciliationBulkBar
          selectedCount={selectedIds.size}
          ignoreCount={selectedPending.length}
          unignoreCount={selectedIgnored.length}
          flipCount={selectedPending.length}
          isIgnoring={ignoreEntriesBatch.isPending}
          isUnignoring={unignoreEntriesBatch.isPending}
          isFlipping={flipSign.isPending}
          onIgnore={runIgnoreBatch}
          onUnignore={runUnignoreBatch}
          onFlipSign={runFlipSignBatch}
          onClear={clearSelection}
        />
      )}

      {isCompact && !finalized && (
        <Button variant="outline" size="sm" className="mb-2 gap-1.5 self-start" onClick={() => setMobileLedgerOpen(true)}>
          <ListChecks className="h-3.5 w-3.5" />
          {t.ledger.mobileToggle}
        </Button>
      )}

      <div className={isCompact ? undefined : 'grid grid-cols-2 gap-4'}>
        <div className={isCompact ? undefined : 'min-w-0'}>
          <BankExtractList
            entries={entries}
            selectedEntryId={isCompact ? null : selectedEntryId}
            onSelectEntry={setSelectedEntryId}
            finalized={finalized}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
        </div>

        {!isCompact && (
          <div className="min-w-0 rounded-md border bg-card p-3">
            {selectedEntry ? (
              <EntryActionPanel
                key={selectedEntry.id}
                entry={selectedEntry}
                accountId={state.import.account_id}
                kind={state.kind}
                finalized={finalized}
                mutations={mutations}
                onClose={() => setSelectedEntryId(null)}
              />
            ) : (
              <LedgerMovementsList movements={state.ledger_movements} />
            )}
          </div>
        )}
      </div>

      {/* Mobile: linha selecionada abre o painel de ações em drawer. */}
      {isCompact && (
        <ResponsiveModal
          open={!!selectedEntry}
          onOpenChange={(open) => !open && setSelectedEntryId(null)}
          title={t.actionPanel.mobileTitle}
        >
          {selectedEntry && (
            <EntryActionPanel
              key={selectedEntry.id}
              entry={selectedEntry}
              accountId={state.import.account_id}
              kind={state.kind}
              finalized={finalized}
              mutations={mutations}
              onClose={() => setSelectedEntryId(null)}
            />
          )}
        </ResponsiveModal>
      )}

      {/* Mobile: movimentações do sistema em drawer, sob demanda. */}
      {isCompact && (
        <ResponsiveModal open={mobileLedgerOpen} onOpenChange={setMobileLedgerOpen} title={t.ledger.title}>
          <LedgerMovementsList movements={state.ledger_movements} />
        </ResponsiveModal>
      )}

      <ReconciliationBalanceFooter
        kind={state.kind}
        statementBalance={state.statement_balance}
        reconciledBalance={state.reconciled_balance}
        difference={state.difference}
        card={state.card}
        pendingCount={state.pending_count}
        matchedValueDifferenceTotal={state.matched_value_difference_total}
        matchedValueDifferenceCount={state.matched_value_difference_count}
        canFinalize={state.can_finalize}
        finalized={finalized}
        isFinalizing={finalize.isPending}
        onFinalize={() => finalize.mutate({ importId })}
        canReopen={state.can_reopen}
        isReopening={reopenReconciliation.isPending}
        onReopen={() => reopenReconciliation.mutate({ importId })}
      />
    </div>
  );
}

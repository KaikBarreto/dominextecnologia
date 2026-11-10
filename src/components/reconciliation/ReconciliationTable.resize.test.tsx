import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReconciliationTable } from './ReconciliationTable';

const mocks = vi.hoisted(() => ({
  hookValue: { current: null as Record<string, unknown> | null },
  observe: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock('@/hooks/use-mobile', () => ({ useIsCompact: () => false }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));
vi.mock('@/hooks/useBankReconciliation', () => ({ useBankReconciliation: () => mocks.hookValue.current }));
vi.mock('@/components/ui/ResponsiveModal', () => ({ ResponsiveModal: () => null }));
vi.mock('./BankExtractList', () => ({ BankExtractList: () => null, isEntrySelectable: () => false }));
vi.mock('./LedgerMovementsList', () => ({ LedgerMovementsList: () => null }));
vi.mock('./EntryActionPanel', () => ({ EntryActionPanel: () => null }));
vi.mock('./ReconciliationBulkBar', () => ({ ReconciliationBulkBar: () => null }));
vi.mock('./ReconciliationBalanceFooter', () => ({ ReconciliationBalanceFooter: () => null }));

const mutation = () => ({ isPending: false, mutate: vi.fn() });

function hookResult(isLoading: boolean, withState: boolean) {
  return {
    state: withState ? {
      entries: [],
      import: { status: 'draft', account_id: 'account-1' },
      kind: 'bank',
      ledger_movements: [],
    } : null,
    isLoading,
    matchExisting: mutation(),
    searchCandidates: vi.fn(),
    listCardBills: vi.fn(),
    listTransferLegs: vi.fn(),
    settleTransaction: mutation(),
    createTransaction: mutation(),
    createTransfer: mutation(),
    payCardBill: mutation(),
    createEmployeeMovement: mutation(),
    flipSign: mutation(),
    ignoreEntry: mutation(),
    ignoreEntriesBatch: mutation(),
    unignoreEntriesBatch: mutation(),
    unmatchEntry: mutation(),
    finalize: mutation(),
    reopenReconciliation: mutation(),
    createCardPurchase: mutation(),
    matchCardPurchase: mutation(),
    matchCardBillPayment: mutation(),
    cardPayBill: mutation(),
    searchCardPurchases: vi.fn(),
  };
}

describe('ReconciliationTable — medição do container', () => {
  beforeEach(() => {
    mocks.observe.mockClear();
    mocks.disconnect.mockClear();
    mocks.hookValue.current = hookResult(true, false);
    vi.stubGlobal('ResizeObserver', class {
      observe = mocks.observe;
      disconnect = mocks.disconnect;
    });
  });

  it('instala o ResizeObserver quando a árvore sai do loading e o container passa a existir', () => {
    const view = render(<ReconciliationTable importId="import-1" />);
    expect(mocks.observe).not.toHaveBeenCalled();

    mocks.hookValue.current = hookResult(false, true);
    view.rerender(<ReconciliationTable importId="import-1" />);

    expect(mocks.observe).toHaveBeenCalledTimes(1);
  });
});

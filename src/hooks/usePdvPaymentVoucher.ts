import { useEffect, useReducer, useRef, useState, type MutableRefObject } from 'react';
import type { CartState } from '@/lib/pdv/cart';
import { getAppliedVouchers, type PdvAppliedVoucher, type PdvSaleDraft } from '@/lib/pdv/sale-drafts';

export interface PdvPaymentVoucherSnapshot {
  draftId: string;
  cart: CartState;
  stockId: string | null;
  notes: string;
  transactionDate: string;
  appliedVoucher: PdvAppliedVoucher | null;
  appliedVouchers?: PdvAppliedVoucher[];
}

function samePaymentDraft(snapshot: PdvPaymentVoucherSnapshot, draft: PdvSaleDraft) {
  return draft.id === snapshot.draftId && draft.stockId === snapshot.stockId
    && draft.notes === snapshot.notes && draft.transactionDate === snapshot.transactionDate
    && JSON.stringify(draft.cart) === JSON.stringify(snapshot.cart)
    && JSON.stringify(getAppliedVouchers(draft)) === JSON.stringify(getAppliedVouchers(snapshot));
}

/** O diálogo edita somente o voucher do snapshot aberto, nunca o pedido ativo depois. */
export function usePdvPaymentVoucher<T extends PdvPaymentVoucherSnapshot>({
  open, enabled, scopeKey, snapshotRef, drafts, conflictingDraftIds, hasAttempt, updateDraft,
}: {
  open: boolean;
  enabled: boolean;
  scopeKey: string | null;
  snapshotRef: MutableRefObject<T | null>;
  drafts: readonly PdvSaleDraft[];
  conflictingDraftIds: readonly string[];
  hasAttempt: (draftId: string) => boolean;
  updateDraft: (draftId: string, update: (draft: PdvSaleDraft) => PdvSaleDraft) => void;
}) {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const scope = useRef({ key: scopeKey });
  if (scope.current.key !== scopeKey) scope.current = { key: scopeKey };
  const binding = useRef<{ snapshot: T; scope: typeof scope.current; isCurrent: () => boolean } | null>(null);
  const latest = useRef({ open, enabled, drafts, conflictingDraftIds, hasAttempt });
  latest.current = { open, enabled, drafts, conflictingDraftIds, hasAttempt };
  const [, refresh] = useReducer(value => value + 1, 0);
  const [editing, setEditing] = useState<T | null>(null);
  const captured = binding.current;
  const snapshot = snapshotRef.current;
  const inScope = Boolean(open && scopeKey && captured && captured.snapshot === snapshot
    && captured.scope === scope.current && captured.isCurrent());
  const draft = snapshot ? drafts.find(value => value.id === snapshot.draftId) : null;
  const canEdit = Boolean(enabled && inScope && snapshot?.cart.customerId && draft && samePaymentDraft(snapshot, draft)
    && !draft.attempt && !hasAttempt(snapshot.draftId) && !conflictingDraftIds.includes(snapshot.draftId));
  useEffect(() => {
    if (!open || !canEdit) setEditing(null);
  }, [open, canEdit]);

  function stillCurrent() {
    return Boolean(mounted.current && captured && latest.current.open && latest.current.enabled && snapshot
      && binding.current === captured && snapshotRef.current === snapshot && captured.scope === scope.current
      && captured.isCurrent());
  }
  const controller = {
    inScope,
    canEdit,
    pickerOpen: canEdit && editing === snapshot,
    // Abrir um novo diálogo cria uma nova identidade mesmo para o mesmo pedido.
    capture(value: T, isCurrent: () => boolean) {
      binding.current = { snapshot: value, scope: scope.current, isCurrent };
      setEditing(null);
    },
    onPickerOpenChange(value: boolean) {
      if (!value) { if (binding.current === captured && editing === snapshot) setEditing(null); return; }
      if (canEdit && stillCurrent()) setEditing(snapshot);
    },
    onChanges(values: PdvAppliedVoucher[]) {
      if (!canEdit || !stillCurrent() || !snapshot) return;
      const currentDraft = latest.current.drafts.find(draft => draft.id === snapshot.draftId);
      if (!currentDraft || currentDraft.attempt || latest.current.hasAttempt(snapshot.draftId)
        || latest.current.conflictingDraftIds.includes(snapshot.draftId) || !samePaymentDraft(snapshot, currentDraft)) return;
      const expected = { ...snapshot, appliedVouchers: getAppliedVouchers(snapshot).map(value => ({ ...value })) };
      const nextValues = values.map(value => ({ ...value }));
      const next = nextValues[0] ?? null;
      // O reducer permanece puro e não sobrescreve uma versão divergente que
      // tenha chegado entre o clique e a aplicação do setState do workspace.
      updateDraft(snapshot.draftId, draft => samePaymentDraft(expected, draft) && !draft.attempt
        ? { ...draft, appliedVoucher: next, appliedVouchers: nextValues }
        : draft);
      snapshot.appliedVoucher = next;
      snapshot.appliedVouchers = nextValues;
      setEditing(null);
      refresh();
    },
    reset() { binding.current = null; setEditing(null); },
  };
  return { ...controller, onChange(value: PdvAppliedVoucher | null) { controller.onChanges(value ? [value] : []); } };
}

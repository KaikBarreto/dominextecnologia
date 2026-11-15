type CashAvailability =
  | { kind: 'available'; amount: number }
  | { kind: 'restricted' | 'reconciliation' | 'unavailable'; label: string };

export function resolveCashHomeAvailability(
  canViewTreasury: boolean,
  snapshot: { available: number | null; reconciliationRequired: boolean } | null,
): CashAvailability {
  if (!canViewTreasury) return { kind: 'restricted', label: 'Acesso restrito' };
  if (snapshot?.reconciliationRequired) return { kind: 'reconciliation', label: 'Em conferência' };
  if (!snapshot || snapshot.available == null || !Number.isFinite(snapshot.available)) {
    return { kind: 'unavailable', label: 'Indisponível' };
  }
  return { kind: 'available', amount: snapshot.available };
}

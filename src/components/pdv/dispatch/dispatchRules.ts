import type { PdvDispatchDetail, PdvDispatchStatus } from '@/hooks/usePdvDispatch';

export function hasPdvDispatchConflict(items: PdvDispatchDetail['items']) {
  return items.some((item) => (
    item.remainingQuantity > 0
    && item.itemType === 'material'
    && (!item.reservations.length || item.reservations.some((reservation) => reservation.hasConflict))
  ));
}

export function shouldShowPdvDispatchActions(status: PdvDispatchStatus) {
  return status !== 'entregue';
}

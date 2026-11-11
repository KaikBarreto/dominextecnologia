import type { PdvAfterSaleWorkspace } from '@/hooks/usePdvAfterSale';

export function normalizePdvExchangeDifference({ differenceCents, differenceMethod, optionId, cashOptions, canApproveCredit }: {
  differenceCents: number | null;
  differenceMethod: string;
  optionId: string;
  cashOptions: PdvAfterSaleWorkspace['cashOptions'];
  canApproveCredit: boolean;
}) {
  const normalizedMethod = differenceCents !== null && differenceCents > 0 ? differenceMethod : '';
  const needsOption = ['dinheiro', 'pix', 'transferencia'].includes(normalizedMethod);
  const cash = normalizedMethod === 'dinheiro' ? cashOptions.find((item) => item.sessionId === optionId) ?? null : null;
  const differenceAccountId = cash?.accountId ?? (needsOption ? optionId || null : null);
  const cashSessionId = cash?.sessionId ?? null;
  const valid = differenceCents !== null && (
    differenceCents === 0
    || Boolean(normalizedMethod && (!needsOption || optionId) && (normalizedMethod !== 'fiado' || canApproveCredit))
  );

  return {
    differenceMethod: normalizedMethod || null,
    differenceAccountId,
    cashSessionId,
    needsOption,
    valid,
  };
}

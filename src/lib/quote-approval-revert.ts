export interface QuoteApprovalRevertCandidate {
  status: string;
  converted_to_os_id?: string | null;
  financial_generated_at?: string | null;
  financial_transaction_id?: string | null;
}

export type QuoteApprovalRevertErrorCode =
  | 'charge_exists'
  | 'conflict'
  | 'financial_exists'
  | 'forbidden'
  | 'invalid_status'
  | 'not_found'
  | 'service_order_exists'
  | 'unauthorized'
  | 'unknown';

const ERROR_CODES = new Set<QuoteApprovalRevertErrorCode>([
  'charge_exists',
  'conflict',
  'financial_exists',
  'forbidden',
  'invalid_status',
  'not_found',
  'service_order_exists',
  'unauthorized',
  'unknown',
]);

/**
 * A interface antecipa as travas que já conhece. A RPC repete as mesmas
 * validações sob lock e ainda procura vínculos inversos com OS, portanto o
 * cliente nunca é a autoridade da transição.
 */
export function canRevertQuoteApproval(
  quote: QuoteApprovalRevertCandidate,
  options: { hasLiveCharge?: boolean; chargeStateLoading?: boolean } = {},
): boolean {
  return (
    quote.status === 'aprovado' &&
    !quote.converted_to_os_id &&
    !quote.financial_generated_at &&
    !quote.financial_transaction_id &&
    !options.hasLiveCharge &&
    !options.chargeStateLoading
  );
}

export class QuoteApprovalRevertError extends Error {
  readonly code: QuoteApprovalRevertErrorCode;

  constructor(code: QuoteApprovalRevertErrorCode) {
    super('quote_approval_revert_failed');
    this.name = 'QuoteApprovalRevertError';
    this.code = code;
  }
}

export function normalizeQuoteApprovalRevertErrorCode(
  value: unknown,
): QuoteApprovalRevertErrorCode {
  return typeof value === 'string' && ERROR_CODES.has(value as QuoteApprovalRevertErrorCode)
    ? (value as QuoteApprovalRevertErrorCode)
    : 'unknown';
}

export function getQuoteApprovalRevertErrorCode(error: unknown): QuoteApprovalRevertErrorCode {
  return error instanceof QuoteApprovalRevertError ? error.code : 'unknown';
}

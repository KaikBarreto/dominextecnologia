import { describe, expect, it } from 'vitest';
import {
  QuoteApprovalRevertError,
  canRevertQuoteApproval,
  getQuoteApprovalRevertErrorCode,
  normalizeQuoteApprovalRevertErrorCode,
} from './quote-approval-revert';

describe('reversão da aprovação de orçamento', () => {
  it('libera somente aprovação sem efeito operacional ou financeiro', () => {
    expect(canRevertQuoteApproval({ status: 'aprovado' })).toBe(true);
    expect(canRevertQuoteApproval({ status: 'enviado' })).toBe(false);
    expect(canRevertQuoteApproval({ status: 'aprovado', converted_to_os_id: 'os-1' })).toBe(false);
    expect(canRevertQuoteApproval({ status: 'aprovado', financial_generated_at: '2026-11-13' })).toBe(false);
    expect(canRevertQuoteApproval({ status: 'aprovado', financial_transaction_id: 'txn-1' })).toBe(false);
    expect(canRevertQuoteApproval({ status: 'aprovado' }, { hasLiveCharge: true })).toBe(false);
    expect(canRevertQuoteApproval({ status: 'aprovado' }, { chargeStateLoading: true })).toBe(false);
  });

  it('normaliza códigos do servidor sem expor detalhes internos', () => {
    expect(normalizeQuoteApprovalRevertErrorCode('charge_exists')).toBe('charge_exists');
    expect(normalizeQuoteApprovalRevertErrorCode('SQLSTATE P0001')).toBe('unknown');
    expect(getQuoteApprovalRevertErrorCode(new QuoteApprovalRevertError('financial_exists'))).toBe('financial_exists');
    expect(getQuoteApprovalRevertErrorCode(new Error('constraint quotes_status'))).toBe('unknown');
  });
});

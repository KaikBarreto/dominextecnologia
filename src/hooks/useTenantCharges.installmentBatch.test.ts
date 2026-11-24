import { describe, expect, it } from 'vitest';
import {
  CreateChargeApiError,
  parseInstallmentBatchResponse,
} from './useTenantCharges';

describe('parseInstallmentBatchResponse', () => {
  it('aceita lote processado parcial e preserva falhas para retry', () => {
    const result = parseInstallmentBatchResponse({
      ok: true,
      batch_id: 'batch-1',
      total: 2,
      created: 1,
      existing: 0,
      failed: 1,
      completed: false,
      installments: [
        {
          number: 1,
          status: 'created',
          charge: {
            id: 'charge-1',
            public_short_code: 'abc123',
            value: 50,
            due_date: '2027-01-31',
            status: 'pending',
            finance_warning: 'Confira o lançamento.',
          },
        },
        {
          number: 2,
          status: 'failed',
          error: 'Falha temporária ao gerar.',
        },
      ],
    });

    expect(result.completed).toBe(false);
    expect(result.failed).toBe(1);
    expect(result.existing).toBe(0);
    expect(result.installments[0]).toEqual(expect.objectContaining({
      number: 1,
      status: 'created',
      charge: expect.objectContaining({
        public_short_code: 'abc123',
        financeWarning: 'Confira o lançamento.',
      }),
    }));
    expect(result.installments[1]).toEqual(expect.objectContaining({
      number: 2,
      status: 'failed',
      error: 'Falha temporária ao gerar.',
    }));
  });

  it('trata ok:false como erro impeditivo com mensagem segura da edge', () => {
    expect(() => parseInstallmentBatchResponse({
      ok: false,
      error_code: 'request_conflict',
      message: 'Esta tentativa não corresponde aos dados originais.',
    })).toThrowError(CreateChargeApiError);
    expect(() => parseInstallmentBatchResponse({
      ok: false,
      error_code: 'request_conflict',
      message: 'Esta tentativa não corresponde aos dados originais.',
    })).toThrow('Esta tentativa não corresponde aos dados originais.');
  });
});

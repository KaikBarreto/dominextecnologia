import { describe, expect, it } from 'vitest';
import { getCompanyLifecycleColumn, hasPaidSubscription } from './companyLifecycle';

describe('companyLifecycle', () => {
  it('separa empresa inativa com LTV positivo como ex-cliente', () => {
    expect(getCompanyLifecycleColumn({ subscription_status: 'inactive', ltv: 149.9 })).toBe('former_customer');
  });

  it('mantem empresa inativa sem pagamento na coluna de inativos', () => {
    expect(getCompanyLifecycleColumn({ subscription_status: 'inactive', ltv: 0 })).toBe('inactive');
    expect(getCompanyLifecycleColumn({ subscription_status: 'inactive', ltv: null })).toBe('inactive');
  });

  it('nao muda o status visual de empresas ativas ou em teste', () => {
    expect(getCompanyLifecycleColumn({ subscription_status: 'active', ltv: 200 })).toBe('active');
    expect(getCompanyLifecycleColumn({ subscription_status: 'testing', ltv: 100 })).toBe('testing');
  });

  it('aceita LTV numerico serializado e rejeita valor invalido', () => {
    expect(hasPaidSubscription({ ltv: '49.90' })).toBe(true);
    expect(hasPaidSubscription({ ltv: 'invalido' })).toBe(false);
  });

  it('preserva ex-clientes legados pelo historico mesmo sem LTV', () => {
    expect(hasPaidSubscription({ ltv: 0, has_payment_history: true })).toBe(true);
    expect(getCompanyLifecycleColumn({
      subscription_status: 'inactive',
      ltv: 0,
      has_payment_history: true,
    })).toBe('former_customer');
  });
});

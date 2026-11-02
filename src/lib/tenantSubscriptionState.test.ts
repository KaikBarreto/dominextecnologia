import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  nextRecurringDueDate,
  resolveTenantSubscriptionState,
} from '../../supabase/functions/_shared/tenant-subscription-state';

describe('tenant subscription state', () => {
  it('volta para active e aponta o próximo ciclo após baixa fora do Asaas', () => {
    expect(resolveTenantSubscriptionState({
      currentStatus: 'overdue',
      currentNextDueDate: '2026-10-25',
      cycle: 'MONTHLY',
      paymentDueDate: '2026-10-25',
      today: '2026-11-02',
      charges: [
        { status: 'CONFIRMED', due_date: '2026-10-25' },
        { status: 'PENDING', due_date: '2026-11-25' },
      ],
    })).toEqual({ status: 'active', nextDueDate: '2026-11-25' });
  });

  it('mantém overdue quando ainda existe outra cobrança vencida', () => {
    expect(resolveTenantSubscriptionState({
      currentStatus: 'overdue',
      currentNextDueDate: '2026-09-25',
      cycle: 'MONTHLY',
      paymentDueDate: '2026-09-25',
      today: '2026-11-02',
      charges: [
        { status: 'CONFIRMED', due_date: '2026-09-25' },
        { status: 'OVERDUE', due_date: '2026-10-25' },
        { status: 'PENDING', due_date: '2026-11-25' },
      ],
    })).toEqual({ status: 'overdue', nextDueDate: '2026-10-25' });
  });

  it('não reativa assinatura cancelada por causa de evento atrasado', () => {
    expect(resolveTenantSubscriptionState({
      currentStatus: 'cancelled',
      currentNextDueDate: '2026-10-25',
      cycle: 'MONTHLY',
      paymentDueDate: '2026-10-25',
      today: '2026-11-02',
      charges: [{ status: 'CONFIRMED', due_date: '2026-10-25' }],
    }).status).toBe('cancelled');
  });

  it('calcula o próximo ciclo quando a cobrança futura ainda não foi materializada', () => {
    expect(resolveTenantSubscriptionState({
      currentStatus: 'overdue',
      currentNextDueDate: '2026-10-25',
      cycle: 'MONTHLY',
      paymentDueDate: '2026-10-25',
      today: '2026-11-02',
      charges: [{ status: 'RECEIVED_IN_CASH', due_date: '2026-10-25' }],
    })).toEqual({ status: 'active', nextDueDate: '2026-11-25' });
  });

  it('preserva a âncora no fim do mês e pula quantos ciclos forem necessários', () => {
    expect(nextRecurringDueDate('2026-01-31', 'MONTHLY', '2026-03-01')).toBe('2026-03-31');
    expect(nextRecurringDueDate('2026-01-31', 'MONTHLY', '2026-02-01')).toBe('2026-02-28');
    expect(nextRecurringDueDate('2026-10-20', 'WEEKLY', '2026-11-02')).toBe('2026-11-03');
  });

  it('webhook reconcilia somente depois de aplicar a baixa da cobrança', () => {
    const source = readFileSync(
      'supabase/functions/tenant-asaas-webhook/index.ts',
      'utf8',
    );
    const paymentBranch = source.indexOf('if (isInstallmentPayment)');
    const settlement = source.indexOf('"apply_tenant_charge_payment"', paymentBranch);
    const reconciliation = source.indexOf(
      'await reconcileSubscriptionAfterPayment(supabase, payment, companyId);',
      paymentBranch,
    );

    expect(paymentBranch).toBeGreaterThan(-1);
    expect(settlement).toBeGreaterThan(paymentBranch);
    expect(reconciliation).toBeGreaterThan(settlement);
    expect(source).toContain('patch.next_due_date = subscription.nextDueDate;');
  });
});

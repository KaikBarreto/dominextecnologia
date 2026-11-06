import { describe, expect, it } from 'vitest';
import {
  classifyContractNfseAutoReadiness,
  contractsWithoutCurrentOrFutureNfseInstallment,
  isCurrentOrFutureNfseInstallment,
  nfseReadinessMonthStart,
  type NfseAutoReadinessTransaction,
} from './nfse-auto-readiness';

const baseTransaction: NfseAutoReadinessTransaction = {
  contract_id: 'contract-a',
  transaction_type: 'entrada',
  amount: 250,
  due_date: '2026-11-10',
  transaction_date: '2026-11-10',
  cancelled_at: null,
  parent_transaction_id: null,
  category: 'Mensalidade',
};

describe('prontidão da NFS-e automática', () => {
  const contract = { id: 'contract-a', name: 'Contrato A' };
  it('usa o primeiro dia do mês civil informado', () => {
    expect(nfseReadinessMonthStart('2026-11-06')).toBe('2026-11-01');
  });

  it('aceita parcelas do mês atual e futuras', () => {
    expect(isCurrentOrFutureNfseInstallment(baseTransaction, '2026-11-30')).toBe(true);
    expect(isCurrentOrFutureNfseInstallment({ ...baseTransaction, due_date: '2027-01-10' }, '2026-11-06')).toBe(true);
  });

  it('usa a data da transação quando não há vencimento', () => {
    expect(isCurrentOrFutureNfseInstallment({ ...baseTransaction, due_date: null }, '2026-11-06')).toBe(true);
  });

  it('ignora parcelas antigas, canceladas, parciais, filhas, saídas e sem valor', () => {
    const invalid = [
      { ...baseTransaction, due_date: '2026-10-31' },
      { ...baseTransaction, cancelled_at: '2026-11-02T10:00:00Z' },
      { ...baseTransaction, category: 'Recebimento parcial' },
      { ...baseTransaction, parent_transaction_id: 'parent' },
      { ...baseTransaction, transaction_type: 'saida' },
      { ...baseTransaction, amount: 0 },
    ];

    expect(invalid.every((transaction) => !isCurrentOrFutureNfseInstallment(transaction, '2026-11-06'))).toBe(true);
  });

  it('lista apenas contratos ligados que ainda não têm parcela atual ou futura', () => {
    expect(
      contractsWithoutCurrentOrFutureNfseInstallment(
        [
          { id: 'contract-a', name: 'Contrato A' },
          { id: 'contract-b', name: 'Contrato B' },
        ],
        [baseTransaction],
        '2026-11-06',
      ),
    ).toEqual([{ id: 'contract-b', name: 'Contrato B' }]);
  });

  it('usa a parcela como fonte pronta quando não há assinatura Asaas', () => {
    expect(classifyContractNfseAutoReadiness(contract, [baseTransaction], [], '2026-11-06')).toMatchObject({
      state: 'ready_installment',
      source: 'contract',
      nextDate: '2026-11-10',
      amount: 250,
    });
  });

  it('reconhece a parcela vinculada como ciclo do Asaas sem pedir outra recorrência', () => {
    expect(classifyContractNfseAutoReadiness(
      contract,
      [{ ...baseTransaction, tenant_charge_id: 'charge-1' }],
      [{ id: 'sub-1', source_id: 'contract-a', status: 'active', next_due_date: '2026-12-10', value: 250 }],
      '2026-11-06',
    )).toMatchObject({ state: 'ready_installment', source: 'asaas' });
  });

  it('aguarda um ciclo futuro do Asaas sem sugerir criar parcelas', () => {
    expect(classifyContractNfseAutoReadiness(
      contract,
      [],
      [{ id: 'sub-1', source_id: 'contract-a', status: 'active', next_due_date: '2026-12-10', value: 250 }],
      '2026-11-06',
    )).toMatchObject({
      state: 'waiting_asaas_cycle',
      source: 'asaas',
      nextDate: '2026-12-10',
      amount: 250,
    });
  });

  it('mostra conflito persistido mesmo quando a próxima data do Asaas é futura', () => {
    expect(classifyContractNfseAutoReadiness(
      contract,
      [],
      [{
        id: 'sub-1',
        source_id: 'contract-a',
        status: 'active',
        next_due_date: '2026-12-10',
        value: 250,
        hasFinanceSyncError: true,
      }],
      '2026-11-06',
    )).toMatchObject({ state: 'sync_error', source: 'asaas' });
  });

  it('falha fechado quando há mais de uma assinatura viva para o mesmo contrato', () => {
    expect(classifyContractNfseAutoReadiness(
      contract,
      [],
      [
        { id: 'sub-1', source_id: 'contract-a', status: 'active', next_due_date: '2026-12-10', value: 250 },
        { id: 'sub-2', source_id: 'contract-a', status: 'paused', next_due_date: '2026-12-10', value: 250 },
      ],
      '2026-11-06',
    )).toMatchObject({ state: 'sync_error', source: 'asaas' });
  });

  it.each(['active', 'overdue', 'paused', 'pending'])(
    'marca sincronização pendente quando a assinatura %s já deveria ter parcela',
    (status) => {
      expect(classifyContractNfseAutoReadiness(
        contract,
        [],
        [{ id: 'sub-1', source_id: 'contract-a', status, next_due_date: '2026-11-06', value: 250 }],
        '2026-11-06',
      )).toMatchObject({ state: 'sync_error', source: 'asaas', subscriptionStatus: status });
    },
  );

  it('trata assinatura cancelada como fonte ausente', () => {
    expect(classifyContractNfseAutoReadiness(
      contract,
      [],
      [{ id: 'sub-1', source_id: 'contract-a', status: 'cancelled', next_due_date: '2026-12-10', value: 250 }],
      '2026-11-06',
    )).toMatchObject({ state: 'missing_source', source: null });
  });
});

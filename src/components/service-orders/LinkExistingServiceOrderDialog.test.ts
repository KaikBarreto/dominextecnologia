import { describe, expect, it } from 'vitest';
import type { ServiceOrder } from '@/types/database';
import type { ContractServiceOrder } from '@/hooks/useContracts';
import {
  availableContractPeriods,
  isServiceOrderAvailableForContractLink,
} from '@/lib/contractServiceOrderLinking';

const order = (overrides: Partial<ServiceOrder> = {}): ServiceOrder => ({
  id: 'os-1',
  order_number: 101,
  customer_id: 'customer-1',
  os_type: 'manutencao_corretiva',
  status: 'concluida',
  origin: 'manual',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('seleção de OS existente para contrato', () => {
  it('aceita OS concluída ou futura do mesmo cliente e sem outro contrato', () => {
    expect(isServiceOrderAvailableForContractLink(order(), 'customer-1', 'contract-1')).toBe(true);
    expect(isServiceOrderAvailableForContractLink(order({ status: 'agendada' }), 'customer-1', 'contract-1')).toBe(true);
  });

  it('exclui tarefa, cancelada, outro cliente, visita gerada e OS já vinculada', () => {
    expect(isServiceOrderAvailableForContractLink(order({ entry_type: 'tarefa' }), 'customer-1', 'contract-1')).toBe(false);
    expect(isServiceOrderAvailableForContractLink(order({ status: 'cancelada' }), 'customer-1', 'contract-1')).toBe(false);
    expect(isServiceOrderAvailableForContractLink(order(), 'customer-2', 'contract-1')).toBe(false);
    expect(isServiceOrderAvailableForContractLink(order({ origin: 'contract' }), 'customer-1', 'contract-1')).toBe(false);
    expect(isServiceOrderAvailableForContractLink(order({ contract_id: 'contract-2' }), 'customer-1', 'contract-1')).toBe(false);
    expect(isServiceOrderAvailableForContractLink(order({
      contract_id: 'contract-1',
      contract_reference_date: '2026-01-10',
      contract_visit_customized_at: '2026-01-02T00:00:00Z',
    }), 'customer-1', 'contract-1')).toBe(false);
  });

  it('aceita chamado do próprio contrato ainda não promovido a ocorrência', () => {
    expect(isServiceOrderAvailableForContractLink(order({
      origin: 'portal',
      contract_id: 'contract-1',
      contract_reference_date: null,
      contract_visit_customized_at: null,
    }), 'customer-1', 'contract-1')).toBe(true);
  });
});

describe('competências disponíveis', () => {
  const occurrence = (overrides: Partial<ContractServiceOrder>): ContractServiceOrder => ({
    id: 'generated',
    order_number: 1,
    status: 'agendada',
    scheduled_date: '2026-01-10',
    contract_reference_date: '2026-01-10',
    origin: 'contract',
    ...overrides,
  });

  it('mantém apenas placeholders automáticos pendentes/agendados e sem planejamento', () => {
    const result = availableContractPeriods([
      occurrence({ id: 'b', order_number: 2, scheduled_date: '2026-02-10', contract_reference_date: '2026-02-10' }),
      occurrence({ id: 'a' }),
      occurrence({ id: 'completed', status: 'concluida', contract_reference_date: '2026-03-10' }),
      occurrence({ id: 'planned', contract_reference_date: '2026-04-10', contract_visit_customized_at: '2026-01-01T00:00:00Z' }),
      occurrence({ id: 'linked', origin: 'manual', contract_reference_date: '2026-05-10', contract_visit_customized_at: '2026-01-01T00:00:00Z' }),
    ]);

    expect(result.map(([date]) => date)).toEqual(['2026-01-10', '2026-02-10']);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canManageCharge, canRefundCharge } from './tenantChargeRules';

/**
 * O risco do pedido "editar/excluir também na ficha do cliente" é abrir um
 * CAMINHO PARALELO: a ficha copia a tela e esquece a trava, e aí a cobrança que
 * a Central de Cobranças recusa excluir passa pela ficha. Estes testes travam
 * as duas pontas: a regra em si, e o fato de as duas telas usarem ESTA regra.
 */

describe('canManageCharge — editar/excluir só em cobrança que ainda não foi paga nem estornada', () => {
  it.each(['PENDING', 'PENDING_CREATION', 'AWAITING_RISK_ANALYSIS', 'AWAITING_PAYMENT', 'OVERDUE'])(
    'libera %s',
    (status) => {
      expect(canManageCharge(status)).toBe(true);
    },
  );

  it.each(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'])('bloqueia paga (%s)', (status) => {
    expect(canManageCharge(status)).toBe(false);
  });

  it.each([
    'REFUNDED',
    'CHARGEBACK',
    'REFUND_REQUESTED',
    'REFUND_IN_PROGRESS',
    'CHARGEBACK_REQUESTED',
    'CHARGEBACK_DISPUTE',
    'AWAITING_CHARGEBACK_REVERSAL',
  ])('bloqueia estornada/chargeback (%s)', (status) => {
    expect(canManageCharge(status)).toBe(false);
  });

  it('status desconhecido não libera (falha fechada)', () => {
    expect(canManageCharge('ALGO_NOVO_DO_GATEWAY')).toBe(false);
  });

  it('é insensível a caixa e espaço (o status vem do gateway)', () => {
    expect(canManageCharge('  pending  ')).toBe(true);
    expect(canManageCharge(' received ')).toBe(false);
  });
});

describe('canRefundCharge — estorno só quando o dinheiro passou pelo Asaas', () => {
  it('cobrança paga com asaas_payment_id pode estornar', () => {
    expect(canRefundCharge({ status: 'RECEIVED', asaas_payment_id: 'pay_1' })).toBe(true);
    expect(canRefundCharge({ status: 'CONFIRMED', asaas_payment_id: 'pay_1' })).toBe(true);
  });

  it('recebida EM DINHEIRO (fora do Asaas) não estorna', () => {
    expect(canRefundCharge({ status: 'RECEIVED_IN_CASH', asaas_payment_id: 'pay_1' })).toBe(false);
  });

  it('paga sem asaas_payment_id não estorna (não há o que devolver no gateway)', () => {
    expect(canRefundCharge({ status: 'RECEIVED', asaas_payment_id: null })).toBe(false);
    expect(canRefundCharge({ status: 'RECEIVED' })).toBe(false);
  });

  it('pendente, vencida ou já estornada não estorna', () => {
    expect(canRefundCharge({ status: 'PENDING', asaas_payment_id: 'pay_1' })).toBe(false);
    expect(canRefundCharge({ status: 'OVERDUE', asaas_payment_id: 'pay_1' })).toBe(false);
    expect(canRefundCharge({ status: 'REFUNDED', asaas_payment_id: 'pay_1' })).toBe(false);
  });
});

describe('as duas telas derivam DESTE módulo (sem cópia da regra)', () => {
  const read = (relativePath: string) =>
    readFileSync(resolve(process.cwd(), relativePath), 'utf-8');

  const CENTRAL = 'src/components/financial/FinanceCobrancas.tsx';
  const FICHA = 'src/pages/CustomerDetail.tsx';

  it('a Central de Cobranças importa as travas em vez de declarar as suas', () => {
    const src = read(CENTRAL);
    expect(src).toContain("from '@/lib/tenantChargeRules'");
    expect(src).not.toMatch(/function canManageCharge/);
    expect(src).not.toMatch(/RECEIVED_IN_CASH/);
  });

  it('a ficha do cliente monta as ações pelo builder compartilhado', () => {
    const src = read(FICHA);
    expect(src).toContain("from '@/lib/chargeRowActions'");
    // Nenhuma decisão própria de "pode estornar/editar/excluir" nesta tela.
    expect(src).not.toMatch(/function canManageCharge/);
    expect(src).not.toMatch(/RECEIVED_IN_CASH/);
    expect(src).not.toMatch(/isChargePaid/);
  });
});

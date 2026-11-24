import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertPdvCancellationResult,
  canCancelPdvOrder,
  mapPdvOrderCancellationError,
} from './orderCancellation';

describe('cancelamento de pedido do PDV', () => {
  it('oferece cancelamento somente para vendas finalizadas ainda ativas', () => {
    expect(canCancelPdvOrder('entregue')).toBe(true);
    expect(canCancelPdvOrder('pago')).toBe(true);
    expect(canCancelPdvOrder('rascunho')).toBe(false);
    expect(canCancelPdvOrder('aguardando_pagamento')).toBe(false);
    expect(canCancelPdvOrder('cancelado')).toBe(false);
    expect(canCancelPdvOrder('cancelado_parcial')).toBe(false);
  });

  it('só confirma sucesso quando o servidor devolve cancelamento explícito', () => {
    const result = { status: 'cancelado', cancelado: true, order_id: 'order-1' };
    expect(assertPdvCancellationResult(result)).toBe(result);
    expect(() => assertPdvCancellationResult({ status: 'entregue', cancelado: true }))
      .toThrow('não foi cancelada');
  });

  it('não expõe códigos internos e orienta quando o pedido pertence a outro caixa', () => {
    const error = mapPdvOrderCancellationError({
      code: '42501',
      details: 'code=pdv_order_cash_access_denied',
    });
    expect(error.message).toContain('outro caixa');
    expect(error.message).not.toContain('pdv_order_cash_access_denied');
  });

  it('mantém o core fechado e publica somente o entrypoint com custódia do caixa', () => {
    const migration = readFileSync('supabase/migrations/20261118143000_pdv_cancel_order_v2_secure_entrypoint.sql', 'utf8');
    expect(migration).toContain('pdv_assert_order_cash_access_v2(p_order_id, auth.uid())');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.pdv_cancel_order_v2');
    expect(migration).toContain("has_function_privilege('authenticated', 'public.pdv_cancel_order(uuid,text)', 'EXECUTE')");
  });
});

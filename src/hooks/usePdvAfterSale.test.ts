import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
import { buildPdvExchangeCoverageRpc, derivePdvAfterSaleAccess, getPdvExchangeOrderCandidates, getPdvVoucherOrderCandidates, isPdvAfterSaleFeatureEnabled, mapPdvAfterSaleError, projectPdvAfterSaleWorkspace, projectPdvResidualAfterSale, projectPdvVoucherSearch, stablePdvAfterSaleAttempt } from './usePdvAfterSale';

const workspacePayload = {
  order: { order_id: 'order-1', order_number: 1042, customer_id: 'customer-1', status: 'entregue' },
  capabilities: { view: true, issue_voucher: true, request_refund: true, confirm_refund: true, reverse_refund: true, reverse_voucher: true, create_exchange: true, apply_voucher: true, search_voucher: true, use_bank_accounts: true, approve_credit: false, direct_sale_voucher: false },
  cash_options: [{ session_id: 'session-1', terminal_id: 'terminal-1', terminal_name: 'Balcão 1', account_id: 'account-cash', label: 'Balcão 1' }],
  account_options: [{ account_id: 'account-bank', label: 'Banco Exemplo', methods: ['pix', 'transferencia'] }],
  order_candidates: [{ order_id: 'order-2', order_number: 1043, total: 150, status: 'aguardando_pagamento', created_at: '2026-11-07T12:00:00Z', can_exchange: true, can_apply_voucher: true }],
  exchange_candidates: [{ order_id: 'order-2', order_number: 1043, total: 150, status: 'aguardando_pagamento', created_at: '2026-11-07T12:00:00Z' }],
  returns: [{
    return_id: 'return-1', occurred_on: '2026-11-07', reason: 'Sobra da obra', returned_value: 100, allocated_value: 40, unallocated_amount: 20, reallocatable_amount: 60, available_amount: 60, allocatable_value: 60,
    eligible_payments: [{ payment_id: 'payment-1', method: 'pix', paid_amount: 100, refunded_amount: 0, available_amount: 100, financial_account_id: 'secret' }],
    vouchers: [{ voucher_id: 'voucher-1', public_code: 'DV-ABC123', issued_on: '2026-11-07', expires_on: null, balance: 40, status: 'active', can_reverse: true, cost_total: 999 }],
    refunds: [{ refund_id: 'refund-1', method: 'pix', amount: 20, requested_on: '2026-11-07', status: 'pending', can_confirm: true, requires_confirmation_reference: true, can_reverse: false, confirmation_reference_redacted: null }],
    exchanges: [{ exchange_id: 'exchange-1', new_order_id: 'order-3', new_order_number: 1044, voucher_amount: 20, credit_amount: 0, difference_amount: 15 }],
    cmv_total: 500,
  }],
};

describe('W5-02 pós-venda', () => {
  it('projeta somente o contrato seguro e mantém valores separados', () => {
    const result = projectPdvAfterSaleWorkspace(workspacePayload);
    expect(result.order).toEqual({ orderId: 'order-1', orderNumber: 1042, customerId: 'customer-1', status: 'entregue' });
    expect(result.returns[0]).toMatchObject({ returnedValue: 100, allocatedValue: 40, unallocatedAmount: 20, reallocatableAmount: 60, availableAmount: 60, allocatableValue: 60 });
    expect(result.returns[0].eligiblePayments[0]).not.toHaveProperty('financial_account_id');
    expect(result.returns[0].vouchers[0]).not.toHaveProperty('cost_total');
    expect(JSON.stringify(result)).not.toMatch(/cmv|cost_total|bank_balance/i);
  });

  it('falha fechado para número, capability ou status malformado', () => {
    expect(() => projectPdvAfterSaleWorkspace({ ...workspacePayload, returns: [{ ...workspacePayload.returns[0], allocatable_value: null }] })).toThrow(/contrato inválido/i);
    expect(() => projectPdvAfterSaleWorkspace({ ...workspacePayload, capabilities: { ...workspacePayload.capabilities, issue_voucher: 'yes' } })).toThrow(/contrato inválido/i);
    expect(() => projectPdvAfterSaleWorkspace({ ...workspacePayload, returns: [{ ...workspacePayload.returns[0], vouchers: [{ ...workspacePayload.returns[0].vouchers[0], status: 'unknown' }] }] })).toThrow(/contrato inválido/i);
  });

  it('falha fechado quando os aliases do saldo realocável divergem', () => {
    expect(() => projectPdvAfterSaleWorkspace({
      ...workspacePayload,
      returns: [{ ...workspacePayload.returns[0], available_amount: 59.99 }],
    })).toThrow(/contrato inválido/i);
    expect(() => projectPdvAfterSaleWorkspace({
      ...workspacePayload,
      returns: [{ ...workspacePayload.returns[0], allocated_value: 39.99 }],
    })).toThrow(/contrato inválido/i);
  });

  it('mantém a tentativa no retry idêntico e renova quando o payload muda', () => {
    const first = stablePdvAfterSaleAttempt(null, 'payload-a', () => 'attempt-1');
    expect(stablePdvAfterSaleAttempt(first, 'payload-a', () => 'unused')).toBe(first);
    expect(stablePdvAfterSaleAttempt(first, 'payload-b', () => 'attempt-2')).toEqual({ signature: 'payload-b', id: 'attempt-2' });
  });

  it('fecha feature e cada ação sem permissão explícita', () => {
    expect(isPdvAfterSaleFeatureEnabled({ enabled: false, company_allowlist: [] }, 'company-1')).toBe(false);
    expect(isPdvAfterSaleFeatureEnabled({ enabled: false, company_allowlist: ['company-1'] }, 'company-1')).toBe(false);
    expect(isPdvAfterSaleFeatureEnabled({ company_id: 'company-1', module_available: true, after_sale: true }, 'company-1')).toBe(true);
    expect(derivePdvAfterSaleAccess({ featureEnabled: false, privileged: true, hasPermissionRecord: true, permissions: ['*'] }).canView).toBe(false);
    const limited = derivePdvAfterSaleAccess({ featureEnabled: true, privileged: false, hasPermissionRecord: true, permissions: ['fn:view_pdv_after_sale', 'fn:issue_pdv_voucher'] });
    expect(limited).toMatchObject({ canView: true, canIssueVoucher: true, canRequestRefund: false, canCreateExchange: false });
  });

  it('separa pedido comum de troca pela matriz do servidor', () => {
    const cashierWorkspace = projectPdvAfterSaleWorkspace({
      ...workspacePayload,
      capabilities: { ...workspacePayload.capabilities, create_exchange: false, apply_voucher: true },
      order_candidates: [{ ...workspacePayload.order_candidates[0], can_exchange: false, can_apply_voucher: true }],
      exchange_candidates: [],
    });
    expect(getPdvVoucherOrderCandidates(cashierWorkspace)).toHaveLength(1);
    expect(getPdvExchangeOrderCandidates(cashierWorkspace)).toHaveLength(0);

    const exchangeWorkspace = projectPdvAfterSaleWorkspace(workspacePayload);
    expect(getPdvVoucherOrderCandidates(exchangeWorkspace)).toHaveLength(1);
    expect(getPdvExchangeOrderCandidates(exchangeWorkspace)).toHaveLength(1);
  });

  it('falha fechado quando a matriz de candidatos não traz booleanos explícitos', () => {
    expect(() => projectPdvAfterSaleWorkspace({
      ...workspacePayload,
      order_candidates: [{ ...workspacePayload.order_candidates[0], can_apply_voucher: 'true' }],
    })).toThrow(/contrato inválido/i);
  });

  it('projeta busca de voucher sem aceitar saldo coercível', () => {
    expect(projectPdvVoucherSearch({ items: [{ voucher_id: 'v1', public_code: 'DV-1', customer_id: 'c1', customer_name: 'Cliente', balance: 25, expires_on: null, status: 'active' }], total: 1, limit: 20, offset: 0 }).items[0].balance).toBe(25);
    expect(() => projectPdvVoucherSearch({ items: [{ voucher_id: 'v1', public_code: 'DV-1', customer_id: 'c1', customer_name: 'Cliente', balance: '', expires_on: null, status: 'active' }], total: 1, limit: 20, offset: 0 })).toThrow(/contrato inválido/i);
  });

  it('mapeia erros de domínio sem expor códigos internos', () => {
    expect(mapPdvAfterSaleError({ code: '23514', details: 'code=pdv_refund_cash_insufficient' }).message).toMatch(/gaveta não possui dinheiro/i);
    expect(mapPdvAfterSaleError({ code: '42501', details: 'code=pdv_after_sale_permission_denied' }).message).toBe('Seu perfil não permite realizar esta ação.');
    expect(mapPdvAfterSaleError({ code: '22023', details: 'code=unknown_internal_code' }).message).not.toContain('unknown_internal_code');
  });

  it.each(['code=pdv_voucher_customer_inactive', 'CODE=PDV_VOUCHER_CUSTOMER_INACTIVE'])('orienta a revisar o cliente inativo sem expor o detalhe interno (%s)', details => {
    expect(mapPdvAfterSaleError({ code: '23514', details, message: 'public.pdv_guard_voucher_active_customer_v2' }).message)
      .toBe('O cliente deste voucher está inativo. Revise o cadastro antes de continuar.');
  });
});

const residualPayload = () => ({ cancellation_id: 'cancel-1', order_id: 'order-1', source_kind: 'order_residual_cancellation_v3', occurred_on: '2026-11-15', reason: 'Desistência', residual_amount: 65, unallocated_amount: 0, financial_status: 'allocated', dispositions: [{ disposition_kind: 'receivable_reduction', amount: 50 }, { disposition_kind: 'customer_credit', amount: 15 }], vouchers: [], refunds: [] });
describe('projeção separada dos itens não retirados', () => {
  it('preserva compatibilidade optional/null sem transformar cancelamento em devolução', () => {
    expect(projectPdvAfterSaleWorkspace(workspacePayload).residualCancellation).toBeNull();
    expect(projectPdvResidualAfterSale(null, 'order-1')).toBeNull();
    const result = projectPdvAfterSaleWorkspace({ ...workspacePayload, returns: [], residual_cancellation: residualPayload() });
    expect(result.returns).toEqual([]);
    expect(result.residualCancellation).toMatchObject({ reductionAmount: 50, creditedAmount: 15 });
  });
  it('não inventa elegibilidade/status/valor emitido no reader antigo', () => {
    const result = projectPdvResidualAfterSale({ ...residualPayload(), vouchers: [{ voucher_id: 'v1', public_code: 'DV-123', balance: 10, expires_on: null }], refunds: [{ refund_id: 'r1', amount: 5, method: 'pix', status: 'pending' }] }, 'order-1');
    expect(result?.vouchers[0]).toMatchObject({ status: null, issuedAmount: null, canReverse: false, eligibilityKnown: false });
    expect(result?.refunds[0]).toMatchObject({ canConfirm: false, canReverse: false, eligibilityKnown: false });
  });
  it.each(['pending', 'settled', 'reversed'])('preserva estado real %s e elegibilidade publicada', status => {
    const refund = { refund_id: 'r1', amount: 15, method: 'pix', status, requested_on: '2026-11-15', can_confirm: status === 'pending', can_reverse: status === 'settled', requires_confirmation_reference: true };
    expect(projectPdvResidualAfterSale({ ...residualPayload(), refunds: [refund] }, 'order-1')?.refunds[0]).toMatchObject({ status, canConfirm: status === 'pending', canReverse: status === 'settled', eligibilityKnown: true });
  });
  it('preserva pendência depois de estorno sem confundir com conclusão financeira', () => {
    expect(projectPdvResidualAfterSale({ ...residualPayload(), financial_status: 'pending_disposition', unallocated_amount: 15 }, 'order-1')).toMatchObject({ financialStatus: 'pending_disposition', unallocatedAmount: 15 });
  });
  it('nega origem cruzada, valores/flags/status inválidos', () => {
    for (const patch of [{ order_id: 'other' }, { source_kind: 'return' }, { residual_amount: 65.001 }, { unallocated_amount: 1 }, { vouchers: [{ voucher_id: 'v', public_code: 'DV-1', balance: 15, expires_on: null, issued_amount: 15, status: 'active', can_reverse: 'yes' }] }]) expect(() => projectPdvResidualAfterSale({ ...residualPayload(), ...patch }, 'order-1')).toThrow();
  });
});

describe('privacidade do histórico residual sem view', () => {
  it('mascara todos os campos financeiros com null e arrays vazios, sem zero fictício', () => {
    const result = projectPdvResidualAfterSale({ ...residualPayload(), access_masked: true,
      residual_amount: null, unallocated_amount: null, financial_plan: null, financial_status: null,
      dispositions: [], vouchers: [], refunds: [] }, 'order-1');
    expect(result).toMatchObject({ cancellationId: 'cancel-1', accessMasked: true, residualAmount: null,
      unallocatedAmount: null, reductionAmount: null, creditedAmount: null, financialStatus: null, vouchers: [], refunds: [] });
  });
  it('não reprojeta campos financeiros adicionais de DTO mascarado e rejeita flag ambígua', () => {
    const masked = projectPdvResidualAfterSale({ ...residualPayload(), access_masked: true,
      vouchers: [{ public_code: 'SEGREDO', balance: 15 }], financial_plan: { payment: 'SEGREDO' } }, 'order-1');
    expect(JSON.stringify(masked)).not.toContain('SEGREDO');
    expect(() => projectPdvResidualAfterSale({ ...residualPayload(), access_masked: 'true' }, 'order-1')).toThrow();
  });
});


describe('troca com revisão do cupom', () => {
  const input = { orderId: 'original', returnId: 'return', newOrderId: 'new', voucherId: 'voucher', voucherAmount: '8.00', creditAmount: '0.00', differenceMethod: null, differenceAccountId: null, cashSessionId: null, attemptId: 'same-attempt' };
  it('nega snapshot antigo sem contexto explícito antes de enviar uma nova troca', () => {
    expect(() => buildPdvExchangeCoverageRpc(input)).toThrow('confirme o caixa de destino');
    expect(() => buildPdvExchangeCoverageRpc({ ...input, couponRevision: 0 })).toThrow('confirme o caixa de destino');
  });
  it.each([0, 2])('envia o CAS da revisão %s para o writer versionado sem trocar a identidade da tentativa', couponRevision => {
    const operation = buildPdvExchangeCoverageRpc({ ...input, couponRevision, targetCashSessionId: 'session-1' });
    expect(operation.name).toBe('pdv_cover_exchange_order_coupon_v2');
    expect(operation.args).toMatchObject({ p_expected_coupon_revision: couponRevision, p_idempotency_key: 'same-attempt', p_voucher_amount: '8.00' });
  });
  it.each([null, '0', -1, 0.5, Infinity, NaN])('recusa revisão malformada %s na leitura, sem promover o número para zero', coupon_revision => {
    expect(() => projectPdvAfterSaleWorkspace({ ...workspacePayload, exchange_candidates: [{ ...workspacePayload.exchange_candidates[0], coupon_revision }] })).toThrow('conferir o desconto');
  });
  it('projeta sessão de destino como snapshot distinto da diferença', () => {
    const projected = projectPdvAfterSaleWorkspace({ ...workspacePayload, exchange_candidates: [{ ...workspacePayload.exchange_candidates[0], coupon_revision: 0,
      target_terminal_id: 'terminal-A', target_cash_session_id: 'session-A', target_cash_account_id: 'cash-A', target_cash_label: 'Caixa A' }] });
    expect(projected.exchangeCandidates[0]).toMatchObject({ targetTerminalId: 'terminal-A', targetCashSessionId: 'session-A', targetCashAccountId: 'cash-A', targetCashLabel: 'Caixa A' });
    expect(() => projectPdvAfterSaleWorkspace({ ...workspacePayload, exchange_candidates: [{ ...workspacePayload.exchange_candidates[0], target_cash_session_id: 'session-A' }] })).toThrow('conferir o caixa de destino');
  });
  it('projeta a mesma revisão finita nos candidatos de troca e de voucher', () => {
    const projected = projectPdvAfterSaleWorkspace({ ...workspacePayload,
      exchange_candidates: [{ ...workspacePayload.exchange_candidates[0], coupon_revision: 2 }],
      order_candidates: [{ ...workspacePayload.order_candidates[0], coupon_revision: 2, can_apply_voucher: false }],
    });
    expect(projected.exchangeCandidates[0].couponRevision).toBe(2);
    expect(projected.orderCandidates[0]).toMatchObject({ couponRevision: 2, canApplyVoucher: false });
  });
  it.each(['pdv_coupon_conflict', 'pdv_coupon_ineligible', 'pdv_coupon_order_total_zero', 'pdv_coupon_atomic_coverage_required', 'pdv_coupon_invalid'])('traduz %s sem detalhes internos', code => {
    const message = mapPdvAfterSaleError({ code: '22023', details: `code=${code}`, message: 'private_sql_table' }).message;
    expect(message).not.toMatch(/pdv_|private_sql|SQLSTATE/);
    if (code === 'pdv_coupon_order_total_zero') expect(message).toBe('O desconto precisa deixar um valor a receber. Escolha outro cupom ou remova o cupom para continuar.');
    if (code === 'pdv_coupon_atomic_coverage_required') expect(message).toContain('finalizar o pagamento no caixa');
  });
});


it('orienta a conferir o estoque quando a disponibilidade da troca muda', () => {
  expect(mapPdvAfterSaleError({ code: '23514', details: 'code=pdv_exchange_stock_insufficient', message: 'private_stock_table' }).message)
    .toBe('O estoque disponível mudou. Confira os materiais do novo pedido antes de concluir a troca.');
});

import { describe, expect, it } from 'vitest';
import { derivePdvAfterSaleAccess, getPdvExchangeOrderCandidates, getPdvVoucherOrderCandidates, isPdvAfterSaleFeatureEnabled, mapPdvAfterSaleError, projectPdvAfterSaleWorkspace, projectPdvVoucherSearch, stablePdvAfterSaleAttempt } from './usePdvAfterSale';

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
    expect(isPdvAfterSaleFeatureEnabled({ enabled: false, company_allowlist: ['company-1'] }, 'company-1')).toBe(true);
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
});

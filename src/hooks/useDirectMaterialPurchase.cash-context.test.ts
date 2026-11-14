import { describe, expect, it } from 'vitest';
import source from './useDirectMaterialPurchase.ts?raw';
import { getDirectMaterialPurchaseErrorMessage } from './useDirectMaterialPurchase';
import { pdvAuthorizedQueryScope } from './pdvReportCache';

describe('cache autorizado do contexto de compra no caixa', () => {
  it('não reaproveita contexto confirmado depois de trocar usuário ou permissão', () => {
    const first = pdvAuthorizedQueryScope({
      companyId: 'company-a', userId: 'operator-a', permissions: ['screen:pdv'], hasPermissionRecord: true,
    });
    const second = pdvAuthorizedQueryScope({
      companyId: 'company-a', userId: 'operator-b', permissions: ['screen:pdv'], hasPermissionRecord: true,
    });
    const revoked = pdvAuthorizedQueryScope({
      companyId: 'company-a', userId: 'operator-a', permissions: [], hasPermissionRecord: true,
    });
    expect(first).not.toEqual(second);
    expect(first).not.toEqual(revoked);
    expect(source).toContain("queryKey: ['pdv-cash-purchase-context', ...scope.key");
    expect(source).toContain('enabled: scope.ready && context != null');
    expect(source).toContain('gcTime: 0');
  });

  it('traduz os erros do contrato sem expor códigos internos', () => {
    const insufficient = getDirectMaterialPurchaseErrorMessage({
      code: '23514',
      message: 'Contexto inválido',
      details: 'PDV_CASH_CUSTODY_INSUFFICIENT',
    });
    expect(insufficient).toBe('O caixa não possui dinheiro suficiente para esta compra.');
    expect(insufficient).not.toContain('PDV_');

    const mismatch = getDirectMaterialPurchaseErrorMessage({
      code: '42501',
      message: 'Forbidden',
      details: 'PDV_CASH_PURCHASE_CONTEXT_MISMATCH',
    });
    expect(mismatch).toBe('Esta compra pertence a outro caixa ou local de estoque.');
  });
});

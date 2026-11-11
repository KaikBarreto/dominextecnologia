import { readFileSync } from 'node:fs';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  invalidatePdvReportCaches,
  INVENTORY_ABC_REPORT_QUERY_KEY,
  MATERIAL_PURCHASE_REPORT_QUERY_KEY,
  pdvAuthorizedQueryScope,
  PDV_REPORTS_QUERY_ROOT,
} from './pdvReportCache';

describe('invalidação canônica dos relatórios PDV', () => {
  it('separa cache por empresa, usuário, papéis e revisão das permissões', () => {
    const base = pdvAuthorizedQueryScope({
      companyId: 'empresa-a', userId: 'usuario-a', roles: ['comercial'],
      permissions: ['screen:pdv', 'fn:return_pdv_order'], hasPermissionRecord: true,
    });
    expect(base).toEqual([
      'scope', 'empresa-a', 'usuario-a', 'explicit',
      'fn:return_pdv_order|screen:pdv', 'comercial',
    ]);
    expect(pdvAuthorizedQueryScope({
      companyId: 'empresa-a', userId: 'usuario-b', roles: ['comercial'],
      permissions: ['screen:pdv', 'fn:return_pdv_order'], hasPermissionRecord: true,
    })).not.toEqual(base);
    expect(pdvAuthorizedQueryScope({
      companyId: 'empresa-a', userId: 'usuario-a', roles: ['comercial'],
      permissions: ['screen:pdv'], hasPermissionRecord: true,
    })).not.toEqual(base);
  });

  it('mantém as três raízes comerciais em um módulo sem dependência de hooks', async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    await invalidatePdvReportCaches(client);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: PDV_REPORTS_QUERY_ROOT });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: MATERIAL_PURCHASE_REPORT_QUERY_KEY });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: INVENTORY_ABC_REPORT_QUERY_KEY });
  });

  it('liga todas as mutations financeiras da venda e dos caixas ao helper compartilhado', () => {
    const sale = readFileSync('src/hooks/usePdvSale.ts', 'utf8');
    const legacyCash = readFileSync('src/hooks/usePdvCashRegister.ts', 'utf8');
    const cashV2 = readFileSync('src/hooks/usePdvCashSessionsV2.ts', 'utf8');

    // createOrder ainda é só rascunho; settle e replace são os dois writers
    // que materializam fatos comerciais.
    expect(sale.match(/onSuccess: invalidateAfterSale/g)).toHaveLength(2);
    // abertura, fechamento, movimento, reversão e cancelamento.
    expect(legacyCash.match(/onSuccess: invalidateCash/g)).toHaveLength(4);
    expect(legacyCash).toMatch(/const cancelOrder[\s\S]*?invalidateCash\(\)/);
    // abertura, suprimento/sangria e fechamento v2.
    expect(cashV2.match(/onSuccess: invalidate,/g)).toHaveLength(3);
  });
});

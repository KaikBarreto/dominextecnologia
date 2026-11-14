import { describe, expect, it } from 'vitest';
import source from './PdvPurchase.tsx?raw';

describe('compra iniciada no Caixa', () => {
  it('falha fechado para contexto incompleto, encerrado ou alterado', () => {
    expect(source).toContain("parsedCashContext.kind === 'invalid'");
    expect(source).toContain('cashContextQuery.isLoading');
    expect(source).toContain('cashContextQuery.isError || !confirmedCashContext');
    expect(source).toContain('const refreshed = await cashContextQuery.refetch()');
    expect(source).toContain('Este caixa foi fechado ou não está mais disponível.');
  });

  it('prende estoque, conta em dinheiro e rascunho ao contexto confirmado', () => {
    expect(source).toContain('stockId: confirmedCashContext?.stockId');
    expect(source).toContain('accountId: confirmedCashContext?.cashAccountId');
    expect(source).toContain('cashContext: confirmedCashContext');
    expect(source).toContain('disabled={busy || cashMode}');
    expect(source).toContain('draft.stockId !== confirmedCashContext.stockId');
    expect(source).toContain('draft.accountId !== confirmedCashContext.cashAccountId');
  });

  it('envia somente o contexto revalidado e preserva o fluxo avulso', () => {
    expect(source).toContain("parsedCashContext.kind !== 'absent'");
    expect(source).toContain('cashContext: submittedCashContext');
    expect(source).toContain('sessionId: refreshed.data.sessionId');
    expect(source).toContain('terminalId: refreshed.data.terminalId');
    expect(source).toContain('stockId: refreshed.data.stockId');
  });
});

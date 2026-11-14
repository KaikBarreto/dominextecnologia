import { describe, expect, it } from 'vitest';
import { renderPdvCashClosingReportHtml } from './pdvCashClosingReport';

const report = {
  sessionId: 'session-1', terminalName: '<Caixa 1>', operatorName: 'Maria', closedByName: 'Gestor',
  openedAt: '2026-11-07T08:00:00Z', closedAt: '2026-11-07T18:00:00Z', cashAccountName: 'Cofre',
  openingAmount: 100, expectedAmount: 150, countedAmount: 148, difference: -2,
  cashReceipts: 70, cashPayments: 10, supplies: 5, withdrawals: 15, refunds: 0, finalPosition: 0,
  notes: '<script>alert(1)</script>',
  entries: [{ id: 'e1', kind: 'opening', amount: 100, createdAt: '2026-11-07T08:00:00Z', description: null, notes: null, paymentMethod: null }],
};

describe('relatório de fechamento de caixa', () => {
  it('mostra valores e escapa conteúdo vindo do cadastro ou observação', () => {
    const html = renderPdvCashClosingReportHtml(report);
    expect(html).toContain('Relatório de fechamento de caixa');
    expect(html).toContain('&lt;Caixa 1&gt;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('R$');
  });
});

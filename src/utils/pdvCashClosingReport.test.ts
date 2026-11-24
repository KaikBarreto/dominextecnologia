import { describe, expect, it } from 'vitest';
import { renderPdvCashClosingReportHtml } from './pdvCashClosingReport';

const report = {
  sessionId: 'session-1', terminalName: '<Caixa 1>', operatorName: 'Maria', closedByName: 'Gestor',
  openedAt: '2026-11-07T08:00:00Z', closedAt: '2026-11-07T18:00:00Z', cashAccountName: 'Cofre',
  openingAmount: 100, expectedAmount: 150, countedAmount: 148, difference: -2,
  cashReceipts: 70, cashPayments: 10, supplies: 5, withdrawals: 15, refunds: 0, finalPosition: 0,
  notes: '<script>alert(1)</script>',
  entries: [{ id: 'e1', kind: 'opening', amount: 100, createdAt: '2026-11-07T08:00:00Z', description: null, notes: null, paymentMethod: null }],
  sales: {
    count: 3, total: 662.1,
    byMethod: [{ method: 'pix', count: 2, amount: 562.1 }, { method: 'dinheiro', count: 1, amount: 100 }],
    orders: [
      { number: 4, createdAt: '2026-11-07T11:22:06Z', status: 'entregue', total: 100, methods: ['dinheiro'] },
      { number: 5, createdAt: '2026-11-07T11:30:00Z', status: 'entregue', total: 200, methods: ['pix'] },
      { number: 6, createdAt: '2026-11-07T11:40:00Z', status: 'cancelado_parcial', total: 362.1, methods: ['credito', 'pix'] },
    ],
  },
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

  it('mostra todas as vendas do caixa, inclusive as que não passam pela gaveta', () => {
    const html = renderPdvCashClosingReportHtml(report);
    expect(html).toContain('Vendas deste caixa');
    expect(html).toContain('3 vendas, total de R$');
    expect(html).toMatch(/Pix \(2 vendas\)<\/span><strong>R\$\s?562,10/);
    expect(html).toMatch(/Dinheiro \(1 venda\)<\/span><strong>R\$\s?100,00/);
    expect(html).toContain('Nº 5');
    expect(html).toContain('Cartão de crédito + Pix');
    expect(html).toContain('(cancelada em parte)');
    expect(html).toContain('Movimentações da gaveta');
  });

  it('avisa quando o caixa não teve venda', () => {
    const html = renderPdvCashClosingReportHtml({ ...report, sales: { count: 0, total: 0, byMethod: [], orders: [] } });
    expect(html).toContain('Nenhuma venda neste caixa.');
    expect(html).toContain('0 vendas, total de R$');
  });
});

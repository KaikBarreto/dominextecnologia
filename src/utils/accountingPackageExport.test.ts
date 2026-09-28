import { describe, expect, it } from 'vitest';
import { buildAccountingPackageSheets, safeSpreadsheetText } from './accountingPackageExport';

const transaction = {
  id: 'txn-1',
  periodCriterion: 'Competência e baixa',
  type: 'Receita',
  description: '=IMPORTXML("url")',
  counterparty: 'Cliente DEMO',
  counterpartyDocument: '00.000.000/0001-00',
  category: 'Serviços',
  parentCategory: 'Receitas',
  dreGroup: 'Receita operacional',
  dfcGroup: 'Operacional',
  costCenter: 'Operação',
  account: 'Banco',
  competenceDate: '01/09/2026',
  dueDate: '10/09/2026',
  paidDate: '10/09/2026',
  amount: 1_000,
  amountReceived: 1_000,
  paymentMethod: 'PIX',
  status: 'Pago',
  installment: '1/1',
  serviceOrderId: '',
  contractId: '',
  receiptUrl: '',
  notes: '',
  parentTransactionId: '',
  createdAt: '01/09/2026 10:00',
};

describe('pacote para contabilidade', () => {
  it('gera todas as planilhas e reconcilia os resumos principais', () => {
    const sheets = buildAccountingPackageSheets({
      companyName: 'Dominex DEMO',
      companyDocument: '00.000.000/0001-00',
      periodLabel: '01/09/2026 a 30/09/2026',
      generatedAt: '30/09/2026 18:00',
      currency: 'BRL',
      dreCash: { grossRevenue: 1_000, expenses: 200, taxes: 100, netRevenue: 900, grossProfit: 800, result: 800, margin: 80 },
      dreAccrual: { grossRevenue: 1_200, expenses: 300, taxes: 100, netRevenue: 1_100, grossProfit: 900, result: 900, margin: 75 },
      dfc: { openingBalance: 500, operational: 800, investment: -100, financing: 0, netChange: 700, closingBalance: 1_200 },
      patrimony: { cashBalance: 100, bankBalance: 1_100, receivables: 400, payables: 300, cardDebt: 50, stockValue: 200, assets: 1_800, liabilities: 300, result: 1_500 },
      transactions: [transaction],
      pending: [],
      accounts: [],
      bills: [],
      categories: [],
      costCenters: [],
    });

    expect(sheets.map((sheet) => sheet.name)).toEqual([
      'Resumo', 'Lançamentos', 'Pendências atuais', 'Contas', 'Faturas de cartão', 'Categorias', 'Centros de custo',
    ]);
    expect(sheets[0].rows).toContainEqual(['Saldo final', 1_200]);
    expect(sheets[0].rows).toContainEqual(['Patrimônio operacional atual', 1_500]);
    expect(sheets[1].rows[1][3]).toBe("'=IMPORTXML(\"url\")");
  });

  it('neutraliza conteúdo que poderia virar fórmula no Excel', () => {
    expect(safeSpreadsheetText('+SUM(A1:A2)')).toBe("'+SUM(A1:A2)");
    expect(safeSpreadsheetText('Texto comum')).toBe('Texto comum');
  });
});

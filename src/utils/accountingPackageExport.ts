import type { OperationalPatrimony } from '@/lib/operational-patrimony';

export interface AccountingPackageDreTotals {
  grossRevenue: number;
  expenses: number;
  taxes: number;
  netRevenue: number;
  grossProfit: number;
  result: number;
  margin: number;
}

export interface AccountingPackageTransactionRow {
  id: string;
  periodCriterion: string;
  type: string;
  description: string;
  counterparty: string;
  counterpartyDocument: string;
  category: string;
  parentCategory: string;
  dreGroup: string;
  dfcGroup: string;
  costCenter: string;
  account: string;
  competenceDate: string;
  dueDate: string;
  paidDate: string;
  amount: number;
  amountReceived: number;
  paymentMethod: string;
  status: string;
  installment: string;
  serviceOrderId: string;
  contractId: string;
  receiptUrl: string;
  notes: string;
  parentTransactionId: string;
  createdAt: string;
}

export interface AccountingPackageAccountRow {
  name: string;
  type: string;
  institution: string;
  initialBalance: number;
  currentBalance: number | null;
  creditLimit: number | null;
  active: string;
}

export interface AccountingPackageBillRow {
  account: string;
  referenceMonth: string;
  closingDate: string;
  dueDate: string;
  status: string;
  total: number;
  paid: number;
  outstanding: number;
}

export interface AccountingPackageCategoryRow {
  name: string;
  parent: string;
  type: string;
  dreGroup: string;
  dfcGroup: string;
  active: string;
}

export interface AccountingPackageCostCenterRow {
  name: string;
  description: string;
  active: string;
}

export interface AccountingPackageData {
  companyName: string;
  companyDocument: string;
  periodLabel: string;
  generatedAt: string;
  currency: string;
  dreCash: AccountingPackageDreTotals;
  dreAccrual: AccountingPackageDreTotals;
  dfc: {
    openingBalance: number;
    operational: number;
    investment: number;
    financing: number;
    netChange: number;
    closingBalance: number;
  };
  patrimony: OperationalPatrimony;
  transactions: AccountingPackageTransactionRow[];
  pending: AccountingPackageTransactionRow[];
  accounts: AccountingPackageAccountRow[];
  bills: AccountingPackageBillRow[];
  categories: AccountingPackageCategoryRow[];
  costCenters: AccountingPackageCostCenterRow[];
}

export interface AccountingPackageSheet {
  name: string;
  rows: Array<Array<string | number>>;
  widths: number[];
}

/** Evita que texto digitado pelo usuário seja interpretado como fórmula. */
export function safeSpreadsheetText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function transactionRows(rows: AccountingPackageTransactionRow[]): Array<Array<string | number>> {
  return rows.map((row) => [
    safeSpreadsheetText(row.id),
    row.periodCriterion,
    row.type,
    safeSpreadsheetText(row.description),
    safeSpreadsheetText(row.counterparty),
    safeSpreadsheetText(row.counterpartyDocument),
    safeSpreadsheetText(row.category),
    safeSpreadsheetText(row.parentCategory),
    row.dreGroup,
    row.dfcGroup,
    safeSpreadsheetText(row.costCenter),
    safeSpreadsheetText(row.account),
    row.competenceDate,
    row.dueDate,
    row.paidDate,
    row.amount,
    row.amountReceived,
    row.paymentMethod,
    row.status,
    row.installment,
    row.serviceOrderId,
    row.contractId,
    safeSpreadsheetText(row.receiptUrl),
    safeSpreadsheetText(row.notes),
    row.parentTransactionId,
    row.createdAt,
  ]);
}

const TRANSACTION_HEADERS = [
  'ID', 'Critério no período', 'Tipo', 'Descrição', 'Cliente/Fornecedor', 'CPF/CNPJ',
  'Categoria', 'Categoria mãe', 'Grupo DRE', 'Grupo DFC', 'Centro de custo', 'Conta',
  'Competência', 'Vencimento', 'Baixa', 'Valor', 'Valor recebido', 'Forma de pagamento',
  'Situação', 'Parcela', 'OS', 'Contrato', 'Comprovante', 'Observações',
  'Lançamento pai', 'Criado em',
];

export function buildAccountingPackageSheets(data: AccountingPackageData): AccountingPackageSheet[] {
  const summary: Array<Array<string | number>> = [
    ['Pacote para Contabilidade'],
    ['Empresa', safeSpreadsheetText(data.companyName)],
    ['CNPJ/CPF', safeSpreadsheetText(data.companyDocument)],
    ['Período', data.periodLabel],
    ['Gerado em', data.generatedAt],
    ['Moeda', data.currency],
    [],
    ['DRE', 'Regime de Caixa', 'Regime de Competência'],
    ['Receita bruta', data.dreCash.grossRevenue, data.dreAccrual.grossRevenue],
    ['Despesas', -Math.abs(data.dreCash.expenses), -Math.abs(data.dreAccrual.expenses)],
    ['Impostos', -Math.abs(data.dreCash.taxes), -Math.abs(data.dreAccrual.taxes)],
    ['Receita líquida', data.dreCash.netRevenue, data.dreAccrual.netRevenue],
    ['Lucro bruto', data.dreCash.grossProfit, data.dreAccrual.grossProfit],
    ['Resultado', data.dreCash.result, data.dreAccrual.result],
    ['Margem bruta', data.dreCash.margin / 100, data.dreAccrual.margin / 100],
    [],
    ['DFC — somente realizado', 'Valor'],
    ['Saldo inicial', data.dfc.openingBalance],
    ['Atividades operacionais', data.dfc.operational],
    ['Atividades de investimento', data.dfc.investment],
    ['Atividades de financiamento', data.dfc.financing],
    ['Variação líquida', data.dfc.netChange],
    ['Saldo final', data.dfc.closingBalance],
    [],
    ['Patrimônio Operacional Atual — retrato gerencial', 'Valor'],
    ['Caixa', data.patrimony.cashBalance],
    ['Bancos', data.patrimony.bankBalance],
    ['Contas a receber', data.patrimony.receivables],
    ['Estoque a preço de venda', data.patrimony.stockValue],
    ['Contas a pagar', -Math.abs(data.patrimony.payables)],
    ['Dívida de cartão já incluída em contas a pagar', -Math.abs(data.patrimony.cardDebt)],
    ['Ativos operacionais', data.patrimony.assets],
    ['Passivos operacionais', -Math.abs(data.patrimony.liabilities)],
    ['Patrimônio operacional atual', data.patrimony.result],
    [],
    ['Observação', 'Este pacote é gerencial e não substitui escrituração, conciliação bancária nem documentos fiscais oficiais.'],
  ];

  return [
    { name: 'Resumo', rows: summary, widths: [48, 24, 24] },
    {
      name: 'Lançamentos',
      rows: [TRANSACTION_HEADERS, ...transactionRows(data.transactions)],
      widths: [38, 22, 11, 42, 28, 20, 24, 24, 18, 18, 24, 24, 14, 14, 14, 16, 16, 20, 16, 12, 38, 38, 42, 42, 38, 22],
    },
    {
      name: 'Pendências atuais',
      rows: [TRANSACTION_HEADERS, ...transactionRows(data.pending)],
      widths: [38, 22, 11, 42, 28, 20, 24, 24, 18, 18, 24, 24, 14, 14, 14, 16, 16, 20, 16, 12, 38, 38, 42, 42, 38, 22],
    },
    {
      name: 'Contas',
      rows: [
        ['Conta', 'Tipo', 'Instituição', 'Saldo inicial', 'Saldo atual', 'Limite', 'Situação'],
        ...data.accounts.map((row) => [
          safeSpreadsheetText(row.name), row.type, safeSpreadsheetText(row.institution),
          row.initialBalance, row.currentBalance ?? '', row.creditLimit ?? '', row.active,
        ]),
      ],
      widths: [30, 16, 26, 18, 18, 18, 14],
    },
    {
      name: 'Faturas de cartão',
      rows: [
        ['Cartão', 'Referência', 'Fechamento', 'Vencimento', 'Situação', 'Total', 'Pago', 'Em aberto'],
        ...data.bills.map((row) => [
          safeSpreadsheetText(row.account), row.referenceMonth, row.closingDate, row.dueDate,
          row.status, row.total, row.paid, row.outstanding,
        ]),
      ],
      widths: [30, 14, 14, 14, 16, 16, 16, 16],
    },
    {
      name: 'Categorias',
      rows: [
        ['Categoria', 'Categoria mãe', 'Tipo', 'Grupo DRE', 'Grupo DFC', 'Situação'],
        ...data.categories.map((row) => [
          safeSpreadsheetText(row.name), safeSpreadsheetText(row.parent), row.type,
          row.dreGroup, row.dfcGroup, row.active,
        ]),
      ],
      widths: [30, 30, 14, 22, 22, 14],
    },
    {
      name: 'Centros de custo',
      rows: [
        ['Centro de custo', 'Descrição', 'Situação'],
        ...data.costCenters.map((row) => [
          safeSpreadsheetText(row.name), safeSpreadsheetText(row.description), row.active,
        ]),
      ],
      widths: [32, 48, 14],
    },
  ];
}

function safeFilename(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'pacote-contabilidade';
}

export async function exportAccountingPackage(data: AccountingPackageData): Promise<void> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();

  for (const sheet of buildAccountingPackageSheets(data)) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
    worksheet['!cols'] = sheet.widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }

  XLSX.writeFile(workbook, `${safeFilename(`pacote-contabilidade-${data.companyName}-${data.periodLabel}`)}.xlsx`);
}

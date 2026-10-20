import { describe, expect, it } from 'vitest';
import {
  buildPdvLedger,
  computeCashDifference,
  computeExpectedCash,
  computeSessionResult,
  filterPdvLedger,
  ledgerMatchesMethodGroup,
  methodGroupOf,
  paginate,
  planLedgerReversal,
  round2,
  willPostCashBreak,
  type PdvLedgerEntry,
} from './cash';

const LABELS = {
  sale: 'Venda no balcão',
  bleed: 'Sangria',
  supply: 'Suprimento',
  bleedTo: 'Sangria para {account}',
  supplyFrom: 'Suprimento de {account}',
};

describe('round2', () => {
  it('arredonda meio pra longe do zero, igual ao round(numeric, 2) do Postgres', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(2.675)).toBe(2.68);
  });

  it('não deixa ruído binário vazar pro valor', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(19.99 * 3)).toBe(59.97);
  });

  it('devolve 0 para valor não finito', () => {
    expect(round2(NaN)).toBe(0);
    expect(round2(Infinity)).toBe(0);
  });
});

describe('computeExpectedCash', () => {
  it('soma abertura, vendas em dinheiro e suprimentos e subtrai sangrias', () => {
    expect(
      computeExpectedCash({ openingAmount: 200, cashSales: 450.5, supplies: 100, bleeds: 300 }),
    ).toBe(450.5);
  });

  it('caixa sem movimento algum espera exatamente a abertura', () => {
    expect(computeExpectedCash({ openingAmount: 150, cashSales: 0, supplies: 0, bleeds: 0 })).toBe(150);
  });

  it('NÃO desconta troco: o amount do pagamento já é líquido', () => {
    // Cliente pagou R$ 100 numa venda de R$ 87,50 e levou R$ 12,50 de troco.
    // Em pdv_order_payments isso é amount=87,50 + change_amount=12,50, e a
    // gaveta ficou com 87,50. Descontar o troco aqui contaria duas vezes.
    expect(computeExpectedCash({ openingAmount: 0, cashSales: 87.5, supplies: 0, bleeds: 0 })).toBe(87.5);
  });

  it('sangria maior que a entrada deixa o esperado negativo (não zera à força)', () => {
    // Esperado negativo é sintoma de dado faltando. O motor não maquia: quem
    // decide o que fazer com isso é `willPostCashBreak`.
    expect(computeExpectedCash({ openingAmount: 100, cashSales: 0, supplies: 0, bleeds: 250 })).toBe(-150);
  });

  it('arredonda o resultado em 2 casas, não acumula centavo de float', () => {
    expect(
      computeExpectedCash({ openingAmount: 0.1, cashSales: 0.2, supplies: 0, bleeds: 0 }),
    ).toBe(0.3);
  });

  it('trata campo ausente como zero em vez de NaN', () => {
    expect(computeExpectedCash({ openingAmount: 50 } as never)).toBe(50);
  });
});

describe('computeCashDifference', () => {
  it('contado acima do esperado é SOBRA (positivo)', () => {
    expect(computeCashDifference(510, 500)).toBe(10);
  });

  it('contado abaixo do esperado é FALTA (negativo)', () => {
    expect(computeCashDifference(480.5, 500)).toBe(-19.5);
  });

  it('conferência exata dá zero', () => {
    expect(computeCashDifference(500, 500)).toBe(0);
  });
});

describe('willPostCashBreak', () => {
  it('diferença zero nunca lança quebra de caixa', () => {
    expect(willPostCashBreak({ difference: 0, expectedAmount: 500, hasCashAccount: true })).toBe(false);
  });

  it('lança quebra quando há diferença e a conta do cofre está configurada', () => {
    expect(willPostCashBreak({ difference: -20, expectedAmount: 500, hasCashAccount: true })).toBe(true);
  });

  it('NÃO lança ajuste sobre esperado negativo (seria ficção contábil)', () => {
    expect(willPostCashBreak({ difference: 150, expectedAmount: -150, hasCashAccount: true })).toBe(false);
  });

  it('NÃO lança ajuste sem conta de cofre configurada', () => {
    expect(willPostCashBreak({ difference: -20, expectedAmount: 500, hasCashAccount: false })).toBe(false);
  });
});

describe('computeSessionResult', () => {
  it('calcula lucro REAL com o custo snapshot do item, não projeção', () => {
    const result = computeSessionResult({
      orders: [{ total: 300 }, { total: 200 }],
      items: [
        { quantity: 2, unitCost: 50 }, // 100
        { quantity: 4, unitCost: 25 }, // 100
      ],
      revenues: [],
      expenses: [],
    });
    expect(result.sold).toBe(500);
    expect(result.cmv).toBe(200);
    expect(result.grossMargin).toBe(300);
    expect(result.profit).toBe(300);
    expect(result.marginPct).toBe(60);
  });

  it('receita avulsa soma e despesa avulsa subtrai do lucro', () => {
    const result = computeSessionResult({
      orders: [{ total: 1000 }],
      items: [{ quantity: 1, unitCost: 600 }],
      revenues: [{ amount: 150 }],
      expenses: [{ amount: 90 }, { amount: 10 }],
    });
    expect(result.grossMargin).toBe(400);
    expect(result.revenues).toBe(150);
    expect(result.expenses).toBe(100);
    expect(result.profit).toBe(450);
  });

  it('caixa sem venda nenhuma tem margem nula e lucro igual a receitas menos despesas', () => {
    const result = computeSessionResult({
      orders: [],
      items: [],
      revenues: [{ amount: 80 }],
      expenses: [{ amount: 30 }],
    });
    expect(result.sold).toBe(0);
    expect(result.marginPct).toBeNull();
    expect(result.profit).toBe(50);
  });

  it('lucro pode ser NEGATIVO quando a despesa come a margem', () => {
    const result = computeSessionResult({
      orders: [{ total: 100 }],
      items: [{ quantity: 1, unitCost: 80 }],
      revenues: [],
      expenses: [{ amount: 60 }],
    });
    expect(result.profit).toBe(-40);
  });

  it('conta item de PRODUTO sem custo cadastrado, pra tela avisar que o lucro está inflado', () => {
    const result = computeSessionResult({
      orders: [{ total: 100 }],
      items: [
        { quantity: 1, unitCost: 0 },
        { quantity: 3, unitCost: 10 },
      ],
      revenues: [],
      expenses: [],
    });
    expect(result.itemsWithoutCost).toBe(1);
    expect(result.cmv).toBe(30);
  });

  it('item de SERVIÇO avulso não conta como item sem custo', () => {
    const result = computeSessionResult({
      orders: [{ total: 120 }],
      items: [{ quantity: 1, unitCost: 0, isService: true }],
      revenues: [],
      expenses: [],
    });
    expect(result.itemsWithoutCost).toBe(0);
    expect(result.grossMargin).toBe(120);
  });

  it('não devolve NaN quando o custo vem nulo do banco', () => {
    const result = computeSessionResult({
      orders: [{ total: 50 }],
      items: [{ quantity: 2, unitCost: null as never }],
      revenues: [],
      expenses: [],
    });
    expect(result.cmv).toBe(0);
    expect(result.profit).toBe(50);
  });

  it('arredonda em 2 casas em vez de arrastar centavo de float', () => {
    const result = computeSessionResult({
      orders: [{ total: 19.99 }, { total: 19.99 }, { total: 19.99 }],
      items: [{ quantity: 3, unitCost: 6.66 }],
      revenues: [],
      expenses: [],
    });
    expect(result.sold).toBe(59.97);
    expect(result.cmv).toBe(19.98);
    expect(result.grossMargin).toBe(39.99);
  });
});

describe('methodGroupOf', () => {
  it('reconhece dinheiro', () => {
    expect(methodGroupOf('dinheiro')).toBe('dinheiro');
  });

  it('agrupa pix e transferência na mesma aba', () => {
    expect(methodGroupOf('pix')).toBe('pix_transferencia');
    expect(methodGroupOf('transferencia')).toBe('pix_transferencia');
  });

  it('normaliza o vocabulário do PDV (debito/credito) pro canônico do Financeiro', () => {
    expect(methodGroupOf('debito')).toBe('outros');
    expect(methodGroupOf('cartao_credito')).toBe('outros');
  });

  it('forma desconhecida ou vazia cai em outros', () => {
    expect(methodGroupOf(null)).toBe('outros');
    expect(methodGroupOf('fiado')).toBe('outros');
  });
});

describe('buildPdvLedger', () => {
  const built = buildPdvLedger({
    orders: [
      {
        id: 'o1',
        number: 142,
        total: 250,
        customerName: 'Ana Souza',
        occurredAt: '2026-10-18T13:00:00.000Z',
        methods: ['dinheiro', 'pix'],
      },
    ],
    transactions: [
      {
        id: 't1',
        description: 'Água e café do balcão',
        amount: 38.9,
        transactionType: 'saida',
        paymentMethod: 'dinheiro',
        customerName: null,
        occurredAt: '2026-10-18T14:00:00.000Z',
      },
      {
        id: 't2',
        description: 'Reembolso de frete',
        amount: 60,
        transactionType: 'entrada',
        paymentMethod: 'pix',
        customerName: 'Beto Lima',
        occurredAt: '2026-10-18T15:00:00.000Z',
      },
    ],
    movements: [
      {
        id: 'm1',
        kind: 'sangria',
        amount: 500,
        reason: 'Depósito no banco',
        toAccountName: 'Itaú',
        occurredAt: '2026-10-18T16:00:00.000Z',
      },
      {
        id: 'm2',
        kind: 'suprimento',
        amount: 100,
        reason: null,
        toAccountName: null,
        occurredAt: '2026-10-18T12:00:00.000Z',
      },
    ],
    labels: LABELS,
  });

  it('mistura venda, receita, despesa, sangria e suprimento numa lista só', () => {
    expect(built.map((e) => e.kind)).toEqual(['sangria', 'receita', 'despesa', 'venda', 'suprimento']);
  });

  it('ordena do mais recente pro mais antigo', () => {
    expect(built[0].id).toBe('m1');
    expect(built[built.length - 1].id).toBe('m2');
  });

  it('venda carrega o número do pedido e todas as formas de pagamento', () => {
    const sale = built.find((e) => e.kind === 'venda');
    expect(sale.reference).toBe('#142');
    expect(sale.methods).toEqual(['dinheiro', 'pix']);
    expect(sale.customerName).toBe('Ana Souza');
  });

  it('preserva compra direta como tipo próprio, sem confundir com despesa avulsa', () => {
    const [purchase] = buildPdvLedger({
      orders: [],
      transactions: [{
        id: 'purchase-1',
        description: 'Compra de materiais',
        amount: 90,
        transactionType: 'saida',
        kind: 'compra',
        paymentMethod: 'pix',
        customerName: null,
        occurredAt: '2026-10-18T14:00:00.000Z',
      }],
      movements: [],
      labels: LABELS,
    });

    expect(purchase.kind).toBe('compra');
    expect(purchase.signedAmount).toBe(-90);
  });

  it('preserva todo o contexto necessário para uma edição segura', () => {
    const [sale] = buildPdvLedger({
      orders: [{
        id: 'editável',
        number: 143,
        total: 85,
        customerName: 'Cliente',
        occurredAt: '2026-10-18T13:00:00.000Z',
        methods: ['pix'],
        items: [{
          inventoryId: 'inventory-1',
          description: 'Produto',
          quantity: 2,
          unitPrice: 50,
          unitCost: 20,
          discountAmount: 10,
          total: 90,
        }],
        orderCustomerId: 'customer-1',
        orderStockId: 'stock-1',
        orderNotes: 'Entregar à tarde',
        orderDiscountAmount: 5,
        orderTransactionDate: '2026-10-17',
        replacesOrderReference: '#99',
      }],
      transactions: [],
      movements: [],
      labels: LABELS,
    });

    expect(sale.detail).toMatchObject({
      orderCustomerId: 'customer-1',
      orderStockId: 'stock-1',
      orderNotes: 'Entregar à tarde',
      orderDiscountAmount: 5,
      orderTransactionDate: '2026-10-17',
      replacesOrderReference: '#99',
      items: [{ discountAmount: 10 }],
    });
  });

  it('despesa fica com sinal negativo e receita com sinal positivo', () => {
    expect(built.find((e) => e.id === 't1').signedAmount).toBe(-38.9);
    expect(built.find((e) => e.id === 't2').signedAmount).toBe(60);
  });

  it('sangria com conta de destino mostra a conta, e o motivo entra no rótulo', () => {
    expect(built.find((e) => e.id === 'm1').label).toBe('Sangria para Itaú: Depósito no banco');
  });

  it('suprimento dentro do próprio cofre não inventa nome de conta', () => {
    expect(built.find((e) => e.id === 'm2').label).toBe('Suprimento');
  });

  it('movimento DESFEITO não entra na lista (o filtro é de exibição, não da consulta)', () => {
    const withCancelled = buildPdvLedger({
      orders: [],
      transactions: [],
      movements: [
        {
          id: 'viva',
          kind: 'sangria',
          amount: 50,
          reason: null,
          toAccountName: null,
          occurredAt: '2026-10-18T16:00:00.000Z',
        },
        {
          id: 'desfeita',
          kind: 'sangria',
          amount: 500,
          reason: 'Valor digitado errado',
          toAccountName: 'Itaú',
          occurredAt: '2026-10-18T15:00:00.000Z',
          cancelledAt: '2026-10-18T15:30:00.000Z',
        },
      ],
      labels: LABELS,
    });
    expect(withCancelled.map((e) => e.id)).toEqual(['viva']);
  });

  it('movimento com conta informada marca que o dinheiro trocou de conta (vem do id, não do nome)', () => {
    const [comConta, semConta] = buildPdvLedger({
      orders: [],
      transactions: [],
      movements: [
        {
          id: 'com',
          kind: 'sangria',
          amount: 300,
          reason: null,
          // Conta apagada depois: o NOME não resolve, mas o par de lançamentos
          // existe e precisa aparecer na confirmação.
          toAccountName: null,
          hasAccount: true,
          occurredAt: '2026-10-18T16:00:00.000Z',
        },
        {
          id: 'sem',
          kind: 'suprimento',
          amount: 100,
          reason: null,
          toAccountName: null,
          hasAccount: false,
          occurredAt: '2026-10-18T15:00:00.000Z',
        },
      ],
      labels: LABELS,
    });
    expect(comConta.detail.movedBetweenAccounts).toBe(true);
    expect(semConta.detail.movedBetweenAccounts).toBe(false);
  });

  it('chave é única mesmo quando o UUID se repete entre tabelas', () => {
    const colliding = buildPdvLedger({
      orders: [{ id: 'x', number: 1, total: 10, customerName: null, occurredAt: '2026-10-18T10:00:00.000Z', methods: [] }],
      transactions: [
        { id: 'x', description: 'Qualquer', amount: 10, transactionType: 'saida', paymentMethod: null, customerName: null, occurredAt: '2026-10-18T10:00:00.000Z' },
      ],
      movements: [],
      labels: LABELS,
    });
    expect(new Set(colliding.map((e) => e.key)).size).toBe(2);
  });
});

describe('ledgerMatchesMethodGroup', () => {
  const mixed: PdvLedgerEntry = {
    key: 'venda:o1',
    id: 'o1',
    kind: 'venda',
    reference: '#1',
    label: 'Venda',
    customerName: null,
    amount: 100,
    signedAmount: 100,
    methods: ['dinheiro', 'pix'],
    occurredAt: '2026-10-18T10:00:00.000Z',
    detail: {},
  };

  it('venda com pagamento misto aparece nas DUAS abas', () => {
    expect(ledgerMatchesMethodGroup(mixed, 'dinheiro')).toBe(true);
    expect(ledgerMatchesMethodGroup(mixed, 'pix_transferencia')).toBe(true);
  });

  it('aba Todas sempre casa, inclusive linha sem forma de pagamento', () => {
    expect(ledgerMatchesMethodGroup({ ...mixed, methods: [] }, 'todas')).toBe(true);
  });

  it('linha sem forma de pagamento não aparece nas abas específicas', () => {
    expect(ledgerMatchesMethodGroup({ ...mixed, methods: [] }, 'dinheiro')).toBe(false);
  });
});

describe('filterPdvLedger', () => {
  const entries = buildPdvLedger({
    orders: [
      { id: 'o1', number: 7, total: 90, customerName: 'José Antônio', occurredAt: '2026-10-18T10:00:00.000Z', methods: ['dinheiro'], payments: [{ method: 'dinheiro', amount: 90, changeAmount: 0, accountName: 'Cofre' }] },
    ],
    transactions: [
      { id: 't1', description: 'Manutenção do ar', amount: 40, transactionType: 'saida', paymentMethod: 'pix', customerName: null, occurredAt: '2026-10-18T11:00:00.000Z', accountName: 'Banco principal' },
    ],
    movements: [],
    labels: LABELS,
  });

  it('filtra por tipo', () => {
    expect(filterPdvLedger(entries, { kind: 'despesa' }).map((e) => e.id)).toEqual(['t1']);
  });

  it('filtra por aba de forma de pagamento', () => {
    expect(filterPdvLedger(entries, { methodGroup: 'dinheiro' }).map((e) => e.id)).toEqual(['o1']);
  });

  it('busca tolera acento e ordem de palavras (régua única)', () => {
    expect(filterPdvLedger(entries, { search: 'jose' }).map((e) => e.id)).toEqual(['o1']);
    expect(filterPdvLedger(entries, { search: 'ar manutencao' }).map((e) => e.id)).toEqual(['t1']);
  });

  it('busca pelo número do pedido', () => {
    expect(filterPdvLedger(entries, { search: '7' }).map((e) => e.id)).toEqual(['o1']);
  });

  it('filtra pela conta envolvida, inclusive em pagamentos da venda', () => {
    expect(filterPdvLedger(entries, { account: 'Cofre' }).map((e) => e.id)).toEqual(['o1']);
    expect(filterPdvLedger(entries, { account: 'Banco principal' }).map((e) => e.id)).toEqual(['t1']);
  });

  it('filtra por faixa de valor inclusiva', () => {
    expect(filterPdvLedger(entries, { minAmount: 50 }).map((e) => e.id)).toEqual(['o1']);
    expect(filterPdvLedger(entries, { maxAmount: 50 }).map((e) => e.id)).toEqual(['t1']);
  });

  it('filtro vazio devolve tudo', () => {
    expect(filterPdvLedger(entries, {}).length).toBe(2);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it('corta a página pedida', () => {
    const page = paginate(items, 2, 10);
    expect(page.items).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(page.totalPages).toBe(3);
    expect(page.total).toBe(25);
  });

  it('página fora da faixa volta pra última válida (não deixa a lista vazia)', () => {
    expect(paginate(items, 99, 10).page).toBe(3);
    expect(paginate(items, 0, 10).page).toBe(1);
  });

  it('lista vazia tem 1 página', () => {
    const page = paginate([], 1, 10);
    expect(page.totalPages).toBe(1);
    expect(page.items).toEqual([]);
  });
});

// ── Expansível: o detalhe que cada tipo carrega ──────────────────────────────

describe('buildPdvLedger: detalhe do expansível', () => {
  const built = buildPdvLedger({
    orders: [
      {
        id: 'o1',
        number: 9,
        total: 150,
        customerName: 'Ana',
        occurredAt: '2026-10-18T10:00:00.000Z',
        methods: ['dinheiro', 'pix'],
        items: [{ description: 'Filtro', quantity: 2, unitPrice: 50, total: 100 }],
        payments: [
          { method: 'dinheiro', amount: 50, changeAmount: 10, accountName: 'Cofre' },
          { method: 'pix', amount: 100, changeAmount: 0, accountName: 'Itaú' },
        ],
      },
    ],
    transactions: [
      {
        id: 't1',
        description: 'Café do balcão',
        amount: 20,
        transactionType: 'saida',
        paymentMethod: 'dinheiro',
        customerName: null,
        occurredAt: '2026-10-18T11:00:00.000Z',
        category: 'Consumo interno',
        accountName: 'Cofre',
        notes: 'Padaria da esquina',
        attachmentCount: 2,
        onCofreAccount: true,
      },
    ],
    movements: [
      {
        id: 'm1',
        kind: 'sangria',
        amount: 300,
        reason: null,
        toAccountName: 'Itaú',
        occurredAt: '2026-10-18T12:00:00.000Z',
      },
      {
        id: 'm2',
        kind: 'suprimento',
        amount: 80,
        reason: null,
        toAccountName: 'Itaú',
        occurredAt: '2026-10-18T09:00:00.000Z',
      },
    ],
    labels: LABELS,
    cofreAccountName: 'Cofre',
  });

  const byId = (id: string) => built.find((e) => e.id === id);

  it('venda leva os itens e os pagamentos (com conta e troco)', () => {
    const sale = byId('o1');
    expect(sale.detail.items).toEqual([
      { description: 'Filtro', quantity: 2, unitPrice: 50, total: 100 },
    ]);
    expect(sale.detail.payments.map((p) => p.method)).toEqual(['dinheiro', 'pix']);
    expect(sale.detail.payments[0].changeAmount).toBe(10);
    expect(sale.detail.payments[1].accountName).toBe('Itaú');
  });

  it('receita/despesa leva categoria, conta, observação e anexos', () => {
    const txn = byId('t1');
    expect(txn.detail.category).toBe('Consumo interno');
    expect(txn.detail.accountName).toBe('Cofre');
    expect(txn.detail.notes).toBe('Padaria da esquina');
    expect(txn.detail.attachmentCount).toBe(2);
    expect(txn.detail.onCofreAccount).toBe(true);
  });

  it('sangria sai da gaveta e entra na conta; suprimento faz o contrário', () => {
    expect(byId('m1').detail).toMatchObject({ fromAccountName: 'Cofre', toAccountName: 'Itaú' });
    expect(byId('m2').detail).toMatchObject({ fromAccountName: 'Itaú', toAccountName: 'Cofre' });
  });

  it('sem conta do outro lado, a ponta de fora fica vazia (nada de conta inventada)', () => {
    const [solo] = buildPdvLedger({
      orders: [],
      transactions: [],
      movements: [
        { id: 'm3', kind: 'sangria', amount: 10, reason: null, toAccountName: null, occurredAt: '2026-10-18T09:00:00.000Z' },
      ],
      labels: LABELS,
      cofreAccountName: 'Cofre',
    });
    expect(solo.detail.fromAccountName).toBe('Cofre');
    expect(solo.detail.toAccountName).toBeNull();
  });
});

// ── Reversão: "revertendo todos os efeitos como se nunca tivesse existido" ───

describe('planLedgerReversal', () => {
  const FULL = { canManageFinance: true, canDeleteFinance: true, canEditPdvSales: true };

  function entry(over: Partial<PdvLedgerEntry>): PdvLedgerEntry {
    return {
      key: 'k',
      id: 'id',
      kind: 'venda',
      reference: '#1',
      label: 'Venda',
      customerName: null,
      amount: 100,
      signedAmount: 100,
      methods: [],
      occurredAt: '2026-10-18T10:00:00.000Z',
      detail: {},
      ...over,
    };
  }

  it('venda vai pela RPC de cancelamento: estoque volta e financeiro é cancelado', () => {
    const plan = planLedgerReversal(entry({ kind: 'venda', methods: ['pix'] }), FULL);
    expect(plan.path).toBe('cancel_order');
    expect(plan.canDelete).toBe(true);
    expect(plan.effects).toEqual(['stock', 'finance_cancelled']);
  });

  it('venda no fiado também ajusta o ledger do cliente', () => {
    const plan = planLedgerReversal(entry({ kind: 'venda', methods: ['fiado'] }), FULL);
    expect(plan.effects).toContain('credit_ledger');
  });

  it('venda em dinheiro avisa que o esperado da gaveta cai', () => {
    const plan = planLedgerReversal(entry({ kind: 'venda', methods: ['dinheiro'] }), FULL);
    expect(plan.effects).toContain('drawer');
  });

  it('venda pode iniciar edição pelo fluxo atômico com permissão fina', () => {
    const plan = planLedgerReversal(entry({ kind: 'venda' }), FULL);
    expect(plan.canEdit).toBe(true);
    expect(plan.editBlock).toBeNull();
  });

  it('venda paga exige permissão fina para iniciar edição', () => {
    const plan = planLedgerReversal(entry({ kind: 'venda' }), {
      canManageFinance: true,
      canDeleteFinance: true,
      canEditPdvSales: false,
    });
    expect(plan.canEdit).toBe(false);
    expect(plan.editBlock).toBe('no_permission');
  });

  it('receita/despesa vai pelo caminho de exclusão do Financeiro (saldo é derivado)', () => {
    const plan = planLedgerReversal(entry({ kind: 'despesa' }), FULL);
    expect(plan.path).toBe('delete_transaction');
    expect(plan.effects).toEqual(['finance_deleted']);
    expect(plan.canEdit).toBe(true);
  });

  it('lançamento na conta do cofre avisa que o espelho na gaveta NÃO some junto', () => {
    const plan = planLedgerReversal(
      entry({ kind: 'receita', detail: { onCofreAccount: true } }),
      FULL,
    );
    expect(plan.effects).toContain('drawer_mirror_stays');
  });

  it('sem permissão de exclusão no Financeiro, a linha não pode ser apagada', () => {
    const plan = planLedgerReversal(entry({ kind: 'despesa' }), {
      canManageFinance: true,
      canDeleteFinance: false,
    });
    expect(plan.canDelete).toBe(false);
    expect(plan.deleteBlock).toBe('no_permission');
  });

  // REGRA QUE MUDOU: até a migration 20261018235000 sangria e suprimento não
  // tinham caminho de reversão e a ação ficava desabilitada
  // (`movement_needs_rpc`). Agora existe `pdv_revert_cash_movement`, que marca
  // `cancelled_at` no movimento e cancela as DUAS pernas do par numa transação.
  it('sangria e suprimento vão pela RPC de reversão, que não apaga nada', () => {
    for (const kind of ['sangria', 'suprimento'] as const) {
      const plan = planLedgerReversal(entry({ kind }), FULL);
      expect(plan.path).toBe('revert_movement');
      expect(plan.canDelete).toBe(true);
      expect(plan.deleteBlock).toBeNull();
      expect(plan.effects).toContain('movement_cancelled');
    }
  });

  it('desfazer sangria SOBE o esperado da gaveta; desfazer suprimento DESCE', () => {
    expect(planLedgerReversal(entry({ kind: 'sangria' }), FULL).effects).toContain('drawer_restore');
    expect(planLedgerReversal(entry({ kind: 'suprimento' }), FULL).effects).toContain('drawer_reduce');
  });

  it('movimento COM conta avisa que as duas pernas da transferência são canceladas', () => {
    const comConta = planLedgerReversal(
      entry({ kind: 'sangria', detail: { movedBetweenAccounts: true } }),
      FULL,
    );
    const semConta = planLedgerReversal(
      entry({ kind: 'sangria', detail: { movedBetweenAccounts: false } }),
      FULL,
    );
    expect(comConta.effects).toContain('movement_finance_pair');
    // Sem conta o dinheiro nunca saiu do cofre: não existe lançamento a tocar.
    expect(semConta.effects).not.toContain('movement_finance_pair');
  });

  it('sangria e suprimento não se EDITAM: desfaz e lança de novo', () => {
    const plan = planLedgerReversal(entry({ kind: 'suprimento' }), FULL);
    expect(plan.canEdit).toBe(false);
    expect(plan.editBlock).toBe('movement_edit_undo_and_redo');
  });

  it('desfazer movimento é ação de operador: não pede permissão do Financeiro', () => {
    const plan = planLedgerReversal(entry({ kind: 'sangria' }), {
      canManageFinance: false,
      canDeleteFinance: false,
    });
    expect(plan.canDelete).toBe(true);
  });
});

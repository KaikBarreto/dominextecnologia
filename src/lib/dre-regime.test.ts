import { describe, it, expect } from 'vitest';
import {
  getDreEffectiveDate,
  isInDreRange,
  getDreAmount,
  isPartialReceiptChild,
  isPayrollAdvance,
  isFutureCashDate,
  isPaidDateAllowedInTz,
  classifyDreCategory,
  parseDreDate,
  type DreTransactionLike,
} from './dre-regime';
import { buildCostCenterBreakdown } from './cost-center-breakdown';

const txn = (over: Partial<DreTransactionLike> = {}): DreTransactionLike => ({
  transaction_date: '2026-01-10',
  paid_date: null,
  amount: 1000,
  ...over,
});

describe('getDreEffectiveDate', () => {
  it('caixa usa paid_date', () => {
    expect(getDreEffectiveDate(txn({ paid_date: '2026-03-05' }), 'caixa')).toBe('2026-03-05');
  });

  it('competência usa transaction_date mesmo com paid_date preenchido', () => {
    expect(getDreEffectiveDate(txn({ paid_date: '2026-03-05' }), 'competencia')).toBe('2026-01-10');
  });

  it('caixa cai pra transaction_date quando paid_date é nulo', () => {
    expect(getDreEffectiveDate(txn({ paid_date: null }), 'caixa')).toBe('2026-01-10');
  });

  it('caixa cai pra transaction_date quando paid_date é string vazia', () => {
    expect(getDreEffectiveDate(txn({ paid_date: '' }), 'caixa')).toBe('2026-01-10');
  });

  it('devolve null quando não há data nenhuma', () => {
    expect(getDreEffectiveDate({ transaction_date: null, paid_date: null }, 'caixa')).toBeNull();
    expect(getDreEffectiveDate({ transaction_date: null, paid_date: null }, 'competencia')).toBeNull();
  });

  it('competência ignora paid_date e devolve null sem transaction_date', () => {
    expect(getDreEffectiveDate({ transaction_date: null, paid_date: '2026-03-05' }, 'competencia')).toBeNull();
  });
});

describe('isInDreRange', () => {
  const from = new Date(2026, 1, 1, 0, 0, 0); // 01/02/2026 00:00 local
  const to = new Date(2026, 1, 28, 23, 59, 59); // 28/02/2026 23:59 local

  it('range vazio passa tudo', () => {
    expect(isInDreRange('2020-01-01', {})).toBe(true);
    expect(isInDreRange('2020-01-01', undefined)).toBe(true);
  });

  it('data dentro do range passa', () => {
    expect(isInDreRange('2026-02-15', { from, to })).toBe(true);
  });

  it('data antes do range não passa', () => {
    expect(isInDreRange('2026-01-31', { from, to })).toBe(false);
  });

  it('data depois do range não passa', () => {
    expect(isInDreRange('2026-03-01', { from, to })).toBe(false);
  });

  it('bordas do range são inclusivas (primeiro e último dia)', () => {
    expect(isInDreRange('2026-02-01', { from, to })).toBe(true);
    expect(isInDreRange('2026-02-28', { from, to })).toBe(true);
  });

  it('só `from` funciona como "a partir de"', () => {
    expect(isInDreRange('2026-01-31', { from })).toBe(false);
    expect(isInDreRange('2026-12-31', { from })).toBe(true);
  });

  it('só `to` funciona como "até"', () => {
    expect(isInDreRange('2020-01-01', { to })).toBe(true);
    expect(isInDreRange('2026-03-01', { to })).toBe(false);
  });

  it('data nula fora de range vazio não passa', () => {
    expect(isInDreRange(null, { from, to })).toBe(false);
  });

  it('data inválida não passa', () => {
    expect(isInDreRange('não-é-data', { from, to })).toBe(false);
  });

  it('YYYY-MM-DD é ancorado ao meio-dia local (não vira o dia por fuso)', () => {
    expect(parseDreDate('2026-02-01').getDate()).toBe(1);
    expect(parseDreDate('2026-02-01').getHours()).toBe(12);
  });
});

describe('getDreAmount', () => {
  it('linha comum devolve o amount cheio nos dois regimes', () => {
    const t = txn({ amount: 1000 });
    expect(getDreAmount(t, 'caixa', false)).toBe(1000);
    expect(getDreAmount(t, 'competencia', false)).toBe(1000);
  });

  it('amount_received = 0 não muda nada', () => {
    const t = txn({ amount: 1000, amount_received: 0 });
    expect(getDreAmount(t, 'caixa', true)).toBe(1000);
  });

  it('competência ignora amount_received (a mãe é o fato gerador cheio)', () => {
    const t = txn({ amount: 1000, amount_received: 300 });
    expect(getDreAmount(t, 'competencia', true)).toBe(1000);
  });

  it('caixa desconta o que já veio por filha de recebimento parcial', () => {
    const t = txn({ amount: 1000, amount_received: 300 });
    expect(getDreAmount(t, 'caixa', true)).toBe(700);
  });

  it('caixa zera a mãe quando as filhas cobrem o total (senão dobraria)', () => {
    const t = txn({ amount: 1000, amount_received: 1000 });
    expect(getDreAmount(t, 'caixa', true)).toBe(0);
  });

  it('caixa nunca devolve negativo em recebimento a maior', () => {
    const t = txn({ amount: 1000, amount_received: 1200 });
    expect(getDreAmount(t, 'caixa', true)).toBe(0);
  });

  it('aceita numeric vindo como string do Postgres', () => {
    const t = txn({ amount: '1000.00', amount_received: '250.50' });
    expect(getDreAmount(t, 'caixa', true)).toBe(749.5);
  });

  // --- Folha: `amount` é caixa, `accrual_amount` é competência ---

  it('competência lê accrual_amount da folha paga (o bruto do ciclo)', () => {
    const folha = txn({ amount: 2200, accrual_amount: 3000, payroll_kind: 'salary' });
    expect(getDreAmount(folha, 'competencia', false)).toBe(3000);
  });

  it('caixa ignora accrual_amount (o que saiu da conta foi o líquido)', () => {
    const folha = txn({ amount: 2200, accrual_amount: 3000, payroll_kind: 'salary' });
    expect(getDreAmount(folha, 'caixa', false)).toBe(2200);
  });

  it('folha pendente (sem accrual_amount) vale o amount nos dois regimes', () => {
    const folha = txn({ amount: 3000, payroll_kind: 'salary' });
    expect(getDreAmount(folha, 'competencia', false)).toBe(3000);
    expect(getDreAmount(folha, 'caixa', false)).toBe(3000);
  });

  it('accrual_amount nulo ou zero cai de volta no amount', () => {
    expect(getDreAmount(txn({ amount: 2200, accrual_amount: null }), 'competencia', false)).toBe(2200);
    expect(getDreAmount(txn({ amount: 2200, accrual_amount: 0 }), 'competencia', false)).toBe(2200);
  });

  it('aceita accrual_amount numeric como string do Postgres', () => {
    expect(getDreAmount(txn({ amount: '2200.00', accrual_amount: '3000.00' }), 'competencia', false)).toBe(3000);
  });

  it('accrual_amount não contamina linha comum de despesa', () => {
    const t = txn({ amount: 500 });
    expect(getDreAmount(t, 'competencia', false)).toBe(500);
    expect(getDreAmount(t, 'caixa', false)).toBe(500);
  });

  /**
   * Achado real (Aldebaran, R$3.133,00) — provado com dado de produção, não
   * fixture: a RPC `apply_tenant_charge_payment` (baixa de cobrança via Asaas)
   * grava `is_paid=true`, `paid_date` certo E `amount_received = amount` na
   * quitação total, mas nunca cria a filha "Recebimento parcial". Sem a prova
   * de que existe filha de verdade, o desconto zerava a mãe e ela sumia do
   * Caixa — mesmo com `paid_date` preenchido corretamente.
   */
  it('sem filha REAL, amount_received não desconta nada — mesmo igual ao amount (achado Aldebaran)', () => {
    const t = txn({ amount: 3133, amount_received: 3133, transaction_type: 'entrada' });
    expect(getDreAmount(t, 'caixa', false)).toBe(3133);
  });

  it('com filha REAL provada, o mesmo dado (amount_received = amount) zera a mãe — comportamento de recebimento parcial preservado', () => {
    const t = txn({ amount: 3133, amount_received: 3133, transaction_type: 'entrada' });
    expect(getDreAmount(t, 'caixa', true)).toBe(0);
  });
});

describe('isPayrollAdvance', () => {
  it('reconhece o vale (payroll_kind + saída)', () => {
    expect(isPayrollAdvance({ payroll_kind: 'vale', transaction_type: 'saida' })).toBe(true);
  });

  it('folha não é vale', () => {
    expect(isPayrollAdvance({ payroll_kind: 'salary', transaction_type: 'saida' })).toBe(false);
  });

  it('linha sem payroll_kind não é vale', () => {
    expect(isPayrollAdvance({ transaction_type: 'saida' })).toBe(false);
    expect(isPayrollAdvance({ payroll_kind: null, transaction_type: 'saida' })).toBe(false);
  });

  it('entrada nunca é vale (adiantamento é sempre saída de caixa)', () => {
    expect(isPayrollAdvance({ payroll_kind: 'vale', transaction_type: 'entrada' })).toBe(false);
  });
});

/**
 * Cenário fechado do achado 7 — vale + folha contando em dobro.
 * Salário 3.000, vale de 800 em outubro, folha paga em novembro.
 * Reproduz o MESMO par de regras que a FinanceDRE aplica: exclui o vale em
 * Competência (`isPayrollAdvance`) e valora cada linha com `getDreAmount`.
 */
describe('vale + folha: custo total do ciclo fecha em 3.000 nos dois regimes', () => {
  const vale: DreTransactionLike = {
    transaction_date: '2026-10-14', paid_date: '2026-10-14',
    amount: 800, transaction_type: 'saida', payroll_kind: 'vale',
  };

  const somar = (linhas: DreTransactionLike[], regime: 'caixa' | 'competencia') =>
    linhas
      .filter((t) => !(regime === 'competencia' && isPayrollAdvance(t)))
      .reduce((acc, t) => acc + getDreAmount(t, regime, false), 0);

  it('antes do pagamento: competência conta só a folha bruta pendente', () => {
    const folhaPendente: DreTransactionLike = {
      transaction_date: '2026-11-05', paid_date: null,
      amount: 3000, transaction_type: 'saida', payroll_kind: 'salary',
    };
    expect(somar([vale, folhaPendente], 'competencia')).toBe(3000);
  });

  it('depois do pagamento: competência segue 3.000 (não encolhe pro líquido)', () => {
    const folhaPaga: DreTransactionLike = {
      transaction_date: '2026-11-05', paid_date: '2026-11-05',
      amount: 2200, accrual_amount: 3000, transaction_type: 'saida', payroll_kind: 'salary',
    };
    expect(somar([vale, folhaPaga], 'competencia')).toBe(3000);
  });

  it('caixa: 800 em outubro + 2.200 em novembro = 3.000', () => {
    const folhaPaga: DreTransactionLike = {
      transaction_date: '2026-11-05', paid_date: '2026-11-05',
      amount: 2200, accrual_amount: 3000, transaction_type: 'saida', payroll_kind: 'salary',
    };
    expect(somar([vale, folhaPaga], 'caixa')).toBe(3000);
  });

  it('sem vale nenhum (100% do uso atual) nada muda', () => {
    const folhaPaga: DreTransactionLike = {
      transaction_date: '2026-11-05', paid_date: '2026-11-05',
      amount: 3000, accrual_amount: 3000, transaction_type: 'saida', payroll_kind: 'salary',
    };
    expect(somar([folhaPaga], 'competencia')).toBe(3000);
    expect(somar([folhaPaga], 'caixa')).toBe(3000);
  });
});

describe('isPartialReceiptChild', () => {
  it('reconhece a filha pelo predicado triplo do gatilho', () => {
    expect(isPartialReceiptChild({
      parent_transaction_id: 'mae',
      category: 'Recebimento parcial',
      transaction_type: 'entrada',
    })).toBe(true);
  });

  it('mãe com a mesma categoria não conta (não tem parent)', () => {
    expect(isPartialReceiptChild({
      parent_transaction_id: null,
      category: 'Recebimento parcial',
      transaction_type: 'entrada',
    })).toBe(false);
  });

  it('filha de tarifa não conta', () => {
    expect(isPartialReceiptChild({
      parent_transaction_id: 'mae',
      category: 'Tarifas e Taxas',
      transaction_type: 'saida',
    })).toBe(false);
  });

  it('saída com a categoria de parcial não conta', () => {
    expect(isPartialReceiptChild({
      parent_transaction_id: 'mae',
      category: 'Recebimento parcial',
      transaction_type: 'saida',
    })).toBe(false);
  });
});

/**
 * Casos reais reportados pelo sócio do CEO (print), com o cliente pagante em
 * produção. Os três exercitam exatamente a combinação `getDreEffectiveDate` +
 * `isInDreRange` (+ `isFutureCashDate` no achado 3) que a tela usa pra decidir
 * em que mês/regime uma linha aparece.
 */
describe('achados do sócio — regime de caixa em produção', () => {
  const range = (y: number, m: number) => ({
    from: new Date(y, m, 1, 0, 0, 0),
    to: new Date(y, m + 1, 0, 23, 59, 59),
  });

  it('achado 1 — datas: transaction_date e paid_date no mesmo mês passam nos DOIS regimes', () => {
    // As DATAS por si só nunca foram o problema: "não só gerou a cobrança mas
    // também recebeu no mesmo mês" — transaction_date (fato) e paid_date
    // (dinheiro) caem os dois em setembro, e os dois regimes concordam.
    const t: DreTransactionLike = {
      transaction_date: '2026-09-05',
      paid_date: '2026-09-16',
      amount: 1000,
      transaction_type: 'entrada',
    };
    const setembro = range(2026, 8);

    expect(isInDreRange(getDreEffectiveDate(t, 'competencia'), setembro)).toBe(true);
    expect(isInDreRange(getDreEffectiveDate(t, 'caixa'), setembro)).toBe(true);
  });

  it('achado 1 — causa REAL: cobrança paga (amount_received = amount, ZERO filha) sumia do Caixa mesmo com datas certas', () => {
    // Provado com dado de produção (Aldebaran, R$3.133,00): transaction_date =
    // paid_date = mesmo dia, is_paid = true — as datas nunca estiveram erradas.
    // A RPC `apply_tenant_charge_payment` (baixa de cobrança via Asaas, fora
    // deste módulo) grava `amount_received = amount` na quitação total sem
    // nunca criar a filha "Recebimento parcial". `getDreAmount` sem prova de
    // filha real (`hasPartialReceiptChild = false`, o caso desta cobrança) NÃO
    // desconta mais — a mãe mantém o valor cheio e continua aparecendo no
    // Caixa. Ver também `getDreAmount` > "achado Aldebaran".
    const t: DreTransactionLike = {
      transaction_date: '2026-09-15',
      paid_date: '2026-09-15',
      amount: 3133,
      amount_received: 3133,
      transaction_type: 'entrada',
    };
    const setembro = range(2026, 8);
    const hasPartialReceiptChild = false; // fato provado: esta cobrança nunca teve filha

    expect(isInDreRange(getDreEffectiveDate(t, 'caixa'), setembro)).toBe(true);
    expect(getDreAmount(t, 'caixa', hasPartialReceiptChild)).toBe(3133); // antes da correção: 0 (a linha sumia)
  });

  it('achado 2 — CONFIRMADO como comportamento esperado, não bug: fato em agosto, dinheiro em setembro, cada regime no SEU mês', () => {
    // O CEO descreveu a especificação, não uma falha: "era pra entrar em
    // agosto no regime de competência PORÉM este mês no regime de caixa".
    // Despesa de R$5.000: "Data" 16/08, "Já foi pago" ligado, "Data do
    // pagamento" 16/09. Competência é o mês do FATO; Caixa é o mês do DINHEIRO.
    const t: DreTransactionLike = {
      transaction_date: '2026-08-16',
      paid_date: '2026-09-16',
      amount: 5000,
      transaction_type: 'saida',
    };
    const agosto = range(2026, 7);
    const setembro = range(2026, 8);

    // Competência: agosto sim, setembro não.
    expect(isInDreRange(getDreEffectiveDate(t, 'competencia'), agosto)).toBe(true);
    expect(isInDreRange(getDreEffectiveDate(t, 'competencia'), setembro)).toBe(false);

    // Caixa: setembro sim, agosto não. Este é o teste que denuncia os dois
    // regimes lendo o MESMO campo: se caixa também desse `true` em agosto (ou
    // `false` em setembro), competência e caixa estariam colapsados na mesma data.
    expect(isInDreRange(getDreEffectiveDate(t, 'caixa'), setembro)).toBe(true);
    expect(isInDreRange(getDreEffectiveDate(t, 'caixa'), agosto)).toBe(false);
  });

  it('achado 3: pagamento marcado para o futuro NÃO conta como caixa antes do dia chegar', () => {
    // Filtro 30/09 a 30/10 (futuro), Regime de Caixa, pagamento marcado pra
    // 16/10 — "hoje" no relato é 16/09. Dinheiro que ainda não se moveu não é
    // caixa de outubro só porque JÁ existe uma data gravada.
    const t: DreTransactionLike = {
      transaction_date: '2026-10-16',
      paid_date: '2026-10-16',
      amount: 10000,
      transaction_type: 'saida',
    };
    const today = '2026-09-16';
    const futuro = { from: new Date(2026, 8, 30), to: new Date(2026, 9, 30, 23, 59, 59) };

    // Sem o fail-safe, a data cai dentro do range e o regime de Caixa contaria
    // um pagamento que ainda não aconteceu.
    expect(isInDreRange(getDreEffectiveDate(t, 'caixa'), futuro)).toBe(true);
    expect(isFutureCashDate(getDreEffectiveDate(t, 'caixa'), 'caixa', today)).toBe(true);
  });
});

describe('isFutureCashDate', () => {
  it('caixa com data depois de hoje é futuro', () => {
    expect(isFutureCashDate('2026-10-16', 'caixa', '2026-09-16')).toBe(true);
  });

  it('caixa com data de hoje não é futuro (já pode ter acontecido no dia)', () => {
    expect(isFutureCashDate('2026-09-16', 'caixa', '2026-09-16')).toBe(false);
  });

  it('caixa com data no passado não é futuro', () => {
    expect(isFutureCashDate('2026-08-16', 'caixa', '2026-09-16')).toBe(false);
  });

  it('competência nunca é barrada por isso — fato futuro é legítimo (conta agendada)', () => {
    expect(isFutureCashDate('2026-12-25', 'competencia', '2026-09-16')).toBe(false);
  });

  it('sem data efetiva não é futuro (outro filtro cuida da ausência de data)', () => {
    expect(isFutureCashDate(null, 'caixa', '2026-09-16')).toBe(false);
  });
});

describe('classifyDreCategory', () => {
  it('dre_group cadastrado manda, mesmo que o nome não bata com o regex', () => {
    expect(classifyDreCategory('Aluguel de Galpão', 'impostos')).toBe('impostos');
    expect(classifyDreCategory('Qualquer Coisa', 'cmv')).toBe('cmv');
  });

  it('sem dre_group cadastrado, cai no regex por nome (categoria legada)', () => {
    expect(classifyDreCategory('ICMS a recolher', null)).toBe('impostos');
    expect(classifyDreCategory('Compra de material', undefined)).toBe('cmv');
  });

  it('sem match nenhum, cai em OPEX (o balde padrão)', () => {
    expect(classifyDreCategory('Folha de Pagamento', null)).toBe('opex');
    expect(classifyDreCategory(null, null)).toBe('opex');
  });
});

/**
 * Item novo do sócio: expandir uma categoria do DRE mostra a quebra por
 * centro de custo DAQUELA categoria (3º nível). A trava pedida: a soma dos
 * centros (+ balde "sem centro") tem que fechar EXATAMENTE com o total da
 * categoria — mesma reclamação estrutural do bloco "Por centro de custo" do
 * rodapé (`cost-center-breakdown.test.ts`), agora janela por categoria.
 *
 * Este teste reproduz o pipeline real do `FinanceDRE.tsx`: classifica cada
 * transação em um grupo (`classifyDreCategory`), agrupa por
 * `${grupo}:${categoria}` — a MESMA chave usada pra somar o total da
 * categoria — e roda `buildCostCenterBreakdown` só no balde da categoria
 * aberta. Não é uma segunda conta: é o motor puro real, com fixture real.
 */
describe('3º nível da DRE — quebra por centro de custo de UMA categoria fecha com o total', () => {
  interface Txn {
    category: string;
    transaction_type: 'entrada' | 'saida';
    amount: number;
    cost_center_id: string | null;
  }

  const txns: Txn[] = [
    // OPEX / Folha de Pagamento — 2 centros de custo + 1 sem centro.
    { category: 'Folha de Pagamento', transaction_type: 'saida', amount: 12000, cost_center_id: 'obra-a' },
    { category: 'Folha de Pagamento', transaction_type: 'saida', amount: 8500, cost_center_id: 'obra-b' },
    { category: 'Folha de Pagamento', transaction_type: 'saida', amount: 1500, cost_center_id: null },
    // OPEX / Manutenção da Palio Prata — um centro só (não deve ganhar seta na tela).
    { category: 'Manutenção da Palio Prata', transaction_type: 'saida', amount: 550, cost_center_id: 'frota' },
    // CMV — pra provar que categorias de grupos diferentes não vazam uma na outra.
    { category: 'Compra de material', transaction_type: 'saida', amount: 3000.33, cost_center_id: 'obra-a' },
    // Receita — do lado de entrada, mesmo teste.
    { category: 'Vendas de Serviços', transaction_type: 'entrada', amount: 20000, cost_center_id: 'obra-a' },
    { category: 'Vendas de Serviços', transaction_type: 'entrada', amount: 5000.5, cost_center_id: null },
  ];

  const dreGroupOf = new Map<string, string>(); // nenhuma categoria cadastrada com dre_group → tudo cai no fallback por regex

  function groupAndTotal() {
    const groupKeyOf = (t: Txn) =>
      t.transaction_type === 'entrada'
        ? `receita:${t.category}`
        : `${classifyDreCategory(t.category, dreGroupOf.get(t.category))}:${t.category}`;

    const totalByKey = new Map<string, number>();
    const txnsByKey = new Map<string, Txn[]>();
    for (const t of txns) {
      const key = groupKeyOf(t);
      totalByKey.set(key, (totalByKey.get(key) ?? 0) + t.amount);
      const arr = txnsByKey.get(key);
      if (arr) arr.push(t);
      else txnsByKey.set(key, [t]);
    }
    return { totalByKey, txnsByKey };
  }

  it('Folha de Pagamento (OPEX, 3 centros incluindo "sem centro") fecha ao centavo', () => {
    const { totalByKey, txnsByKey } = groupAndTotal();
    const key = 'opex:Folha de Pagamento';
    const categoryTotal = totalByKey.get(key)!;
    const breakdown = buildCostCenterBreakdown(txnsByKey.get(key));

    expect(categoryTotal).toBe(22000); // 12000 + 8500 + 1500 — o valor do print do sócio
    expect(breakdown.totals.expense).toBeCloseTo(categoryTotal, 2);
    expect(breakdown.rows.length).toBe(3); // obra-a, obra-b, sem centro
    expect(breakdown.rows.some((r) => r.id === null)).toBe(true); // "Sem centro de custo" aparece
  });

  it('Manutenção da Palio Prata (1 centro só) não ganha seta — abrir mostraria a mesma linha', () => {
    const { txnsByKey } = groupAndTotal();
    const breakdown = buildCostCenterBreakdown(txnsByKey.get('opex:Manutenção da Palio Prata'));
    expect(breakdown.rows.length).toBe(1);
  });

  it('CMV não herda as transações do OPEX (grupos não vazam um no outro)', () => {
    const { txnsByKey } = groupAndTotal();
    expect(txnsByKey.get('cmv:Compra de material')).toHaveLength(1);
    expect(txnsByKey.get('opex:Compra de material')).toBeUndefined();
  });

  it('receita: soma dos centros de Vendas de Serviços fecha com o total (com "sem centro")', () => {
    const { totalByKey, txnsByKey } = groupAndTotal();
    const key = 'receita:Vendas de Serviços';
    const breakdown = buildCostCenterBreakdown(txnsByKey.get(key));
    expect(breakdown.totals.revenue).toBeCloseTo(totalByKey.get(key)!, 2);
  });
});

// ── isPaidDateAllowedInTz ────────────────────────────────────────────────────
// Restaurados em 2026-09-17: a bateria original vivia em `today-brazil.test.ts`
// e foi perdida no merge que aposentou aquele módulo em favor da versão ciente
// de fuso. A função sobreviveu à refatoração; os testes não. Sem eles, o bug
// de "marcar pagamento com data futura" (que o sócio do CEO reportou com print,
// e que fazia o Regime de Caixa contar dinheiro de um mês que não aconteceu)
// pode voltar sem ninguém perceber.
describe('isPaidDateAllowedInTz', () => {
  const SP = 'America/Sao_Paulo';
  // Data fixa bem no passado: não depende de quando a suíte roda.
  const ONTEM = '2020-01-01';

  it('data vazia passa: o campo é opcional', () => {
    expect(isPaidDateAllowedInTz(null, SP)).toBe(true);
    expect(isPaidDateAllowedInTz(undefined, SP)).toBe(true);
    expect(isPaidDateAllowedInTz('', SP)).toBe(true);
  });

  it('data no passado passa', () => {
    expect(isPaidDateAllowedInTz(ONTEM, SP)).toBe(true);
  });

  it('data no futuro é barrada', () => {
    expect(isPaidDateAllowedInTz('2099-12-31', SP)).toBe(false);
  });

  it('data futura JÁ GRAVADA passa: não prende o usuário num erro que ele não criou', () => {
    expect(isPaidDateAllowedInTz('2099-12-31', SP, '2099-12-31')).toBe(true);
  });

  it('trocar uma data futura por OUTRA data futura continua barrado', () => {
    expect(isPaidDateAllowedInTz('2099-12-30', SP, '2099-12-31')).toBe(false);
  });

  it('corrigir o legado para uma data do passado sempre passa', () => {
    expect(isPaidDateAllowedInTz(ONTEM, SP, '2099-12-31')).toBe(true);
  });

  it('fuso vazio ou inválido não lança: cai no padrão sem quebrar a tela', () => {
    expect(isPaidDateAllowedInTz(ONTEM, null)).toBe(true);
    expect(isPaidDateAllowedInTz(ONTEM, 'Fuso/Inexistente')).toBe(true);
    expect(isPaidDateAllowedInTz('2099-12-31', 'Fuso/Inexistente')).toBe(false);
  });
});

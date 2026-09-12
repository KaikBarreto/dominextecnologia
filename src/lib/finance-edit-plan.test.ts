/**
 * Teste de REGRESSÃO de um bug que apagava dinheiro em produção.
 *
 * Cenário do bug (verificado linha a linha antes do conserto):
 *   Venda de R$ 1.000,00 em 10x. Cada parcela tem `amount = 100` e
 *   `installment_total = 10`. O usuário abre a parcela 3/10, corrige a FORMA DE
 *   PAGAMENTO (ação legítima) e salva.
 *
 *   O que acontecia:
 *     1. o formulário semeava `installment_count` com `installment_total` (10);
 *     2. o motor de parcelamento recebia `amount = 100` (a FATIA) com count 10
 *        e criava 10 parcelas de R$ 10,00;
 *     3. o delete varria o grupo inteiro por `installment_group_id`.
 *   Resultado: a venda de R$ 1.000 virava R$ 100. 90% do dinheiro sumia, sem
 *   erro, sem alerta, e o aviso da tela falava em remover "a transação
 *   original", no singular, enquanto 10 linhas iam embora.
 *
 * Os testes abaixo provam as duas pontas: que o caminho antigo destruía o
 * valor (`simulateLegacySave`, mantido de propósito como prova) e que o plano
 * atual segura os R$ 1.000.
 */
import { describe, it, expect } from 'vitest';
import {
  planTransactionEdit,
  carryOverTransactionLinks,
  belongsToInstallmentGroup,
  belongsToLinkedPair,
} from './finance-edit-plan';
import { buildInstallmentPlan, buildRepetitionPlan } from './finance-installments';

interface Row {
  id: string;
  amount: number;
  transaction_date: string;
  payment_method?: string | null;
  installment_group_id?: string | null;
  installment_number?: number;
  installment_total?: number;
  customer_id?: string | null;
  service_order_id?: string | null;
  contract_id?: string | null;
  transfer_pair_id?: string | null;
  parent_transaction_id?: string | null;
}

/** Venda de R$ 1.000,00 em 10x, do jeito que o banco guarda. */
function vendaEmDezVezes(): Row[] {
  return buildInstallmentPlan('2026-01-10', 1000, 10).map((p) => ({
    id: `parcela-${p.number}`,
    amount: p.amount,
    transaction_date: p.date,
    payment_method: 'boleto',
    installment_group_id: 'grupo-1',
    installment_number: p.number,
    installment_total: 10,
    customer_id: 'cliente-1',
    service_order_id: 'os-1',
    contract_id: null,
  }));
}

const somaDo = (rows: Row[]) => Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;

/**
 * O caminho ANTIGO, reconstruído: recriava usando `installment_total` como
 * contagem e o `amount` da parcela como total, e apagava o grupo inteiro.
 * Fica no arquivo como prova de que o teste pega a regressão de volta.
 */
function simulateLegacySave(group: Row[], editedIndex: number): Row[] {
  const original = group[editedIndex];
  // `.delete().eq('installment_group_id', ...)` → o grupo some por inteiro.
  return buildInstallmentPlan(
    original.transaction_date,
    original.amount,
    original.installment_total ?? 1,
  ).map((p) => ({ ...original, id: `nova-${p.number}`, amount: p.amount, transaction_date: p.date }));
}

/** O caminho ATUAL: o que `Finance.tsx` faz depois de consultar o plano. */
function simulateSave(
  group: Row[],
  editedIndex: number,
  intent: { payment_method?: string | null; installment_count?: number | null },
): Row[] {
  const original = group[editedIndex];
  const plan = planTransactionEdit({ original, intent });

  if (plan.action === 'update') {
    return group.map((r, i) =>
      i === editedIndex ? { ...r, payment_method: intent.payment_method ?? r.payment_method } : r,
    );
  }

  // `replace` apaga NO MÁXIMO a própria linha (invariante do plano).
  expect(plan.rowsToDelete).toBe(1);
  const irmasIntactas = group.filter((_, i) => i !== editedIndex);
  const criadas = buildInstallmentPlan(
    original.transaction_date,
    original.amount,
    plan.installmentCount,
  ).map((p) => ({ ...original, id: `nova-${p.number}`, amount: p.amount, transaction_date: p.date }));
  return [...irmasIntactas, ...criadas];
}

describe('venda de R$ 1.000,00 em 10x — corrigir a forma de pagamento da parcela 3', () => {
  it('o caminho ANTIGO derretia a venda de R$ 1.000,00 para R$ 100,00', () => {
    const grupo = vendaEmDezVezes();
    expect(somaDo(grupo)).toBe(1000);

    const depois = simulateLegacySave(grupo, 2);
    expect(depois).toHaveLength(10);
    expect(depois.every((r) => r.amount === 10)).toBe(true);
    expect(somaDo(depois)).toBe(100); // 90% do dinheiro evaporado
  });

  it('o plano atual NÃO recria: edição de parcela é UPDATE naquela linha', () => {
    const grupo = vendaEmDezVezes();
    const plan = planTransactionEdit({
      original: grupo[2],
      intent: { payment_method: 'pix', installment_count: 10 },
    });

    expect(plan.action).toBe('update');
    expect(plan.reason).toBe('locked_installment_row');
    expect(plan.installmentCount).toBe(1);
    expect(plan.rowsToDelete).toBe(0);
    expect(plan.belongsToInstallmentGroup).toBe(true);
  });

  it('os R$ 1.000,00 continuam de pé e as 10 parcelas continuam existindo', () => {
    const grupo = vendaEmDezVezes();
    const depois = simulateSave(grupo, 2, { payment_method: 'pix', installment_count: 10 });

    expect(somaDo(depois)).toBe(1000);
    expect(depois).toHaveLength(10);
    expect(depois.every((r) => r.amount === 100)).toBe(true);
  });

  it('só a parcela editada muda: as outras nove ficam intactas', () => {
    const grupo = vendaEmDezVezes();
    const depois = simulateSave(grupo, 2, { payment_method: 'pix', installment_count: 10 });

    expect(depois[2].payment_method).toBe('pix');
    expect(depois.filter((r) => r.payment_method === 'boleto')).toHaveLength(9);
    expect(depois.map((r) => r.id)).toEqual(grupo.map((r) => r.id));
  });

  it('nem mesmo pedindo 6x a partir de uma parcela o grupo é refeito', () => {
    const grupo = vendaEmDezVezes();
    const plan = planTransactionEdit({
      original: grupo[2],
      intent: { payment_method: 'boleto', installment_count: 6 },
    });

    expect(plan.action).toBe('update');
    expect(plan.installmentCount).toBe(1);
    expect(somaDo(simulateSave(grupo, 2, { payment_method: 'boleto', installment_count: 6 }))).toBe(1000);
  });
});

describe('48 mensalidades de contrato (repetição, não parcelamento)', () => {
  it('editar a mensalidade 2/48 não fatia os R$ 180,00 em R$ 3,75', () => {
    const mensalidades: Row[] = buildRepetitionPlan({
      firstDate: '2026-01-05',
      amount: 180,
      count: 48,
      intervalMonths: 1,
    }).map((p) => ({
      id: `mens-${p.number}`,
      amount: p.amount,
      transaction_date: p.date,
      payment_method: 'boleto',
      installment_group_id: 'contrato-1',
      installment_number: p.number,
      installment_total: 48,
      contract_id: 'contrato-1',
    }));

    expect(somaDo(mensalidades)).toBe(8640);

    const depois = simulateSave(mensalidades, 1, { payment_method: 'pix', installment_count: 48 });
    expect(somaDo(depois)).toBe(8640);
    expect(depois).toHaveLength(48);
    expect(depois.every((r) => r.amount === 180)).toBe(true);
  });
});

describe('lançamento avulso (sem irmãs) continua podendo ser refeito', () => {
  const avulso: Row = {
    id: 'avulso-1',
    amount: 1000,
    transaction_date: '2026-01-10',
    payment_method: 'pix',
    installment_total: 1,
  };

  it('à vista virando 10x: recria, dividindo o TOTAL (que aqui é total mesmo)', () => {
    const plan = planTransactionEdit({
      original: avulso,
      intent: { payment_method: 'pix', installment_count: 10 },
    });

    expect(plan.action).toBe('replace');
    expect(plan.reason).toBe('became_installments');
    expect(plan.installmentCount).toBe(10);
    expect(plan.rowsToDelete).toBe(1);

    const depois = simulateSave([avulso], 0, { payment_method: 'pix', installment_count: 10 });
    expect(depois).toHaveLength(10);
    expect(somaDo(depois)).toBe(1000);
  });

  it('trocar a forma de pagamento recria UMA linha só, com o valor inteiro', () => {
    const plan = planTransactionEdit({
      original: avulso,
      intent: { payment_method: 'cartao_credito', installment_count: 1 },
    });

    expect(plan.action).toBe('replace');
    expect(plan.reason).toBe('payment_method');
    expect(plan.installmentCount).toBe(1);
    expect(plan.rowsToDelete).toBe(1);

    const depois = simulateSave([avulso], 0, { payment_method: 'cartao_credito', installment_count: 1 });
    expect(depois).toHaveLength(1);
    expect(somaDo(depois)).toBe(1000);
  });

  it('sem mudança estrutural o caminho é UPDATE e nada é apagado', () => {
    const plan = planTransactionEdit({
      original: avulso,
      intent: { payment_method: 'pix', installment_count: 1 },
    });

    expect(plan.action).toBe('update');
    expect(plan.reason).toBe('none');
    expect(plan.rowsToDelete).toBe(0);
  });
});

describe('guardas de detecção', () => {
  it('reconhece grupo pelo installment_group_id mesmo sem installment_total', () => {
    expect(belongsToInstallmentGroup({ installment_group_id: 'g1' })).toBe(true);
    expect(belongsToInstallmentGroup({ installment_total: 10 })).toBe(true);
    expect(belongsToInstallmentGroup({ installment_total: 1 })).toBe(false);
    expect(belongsToInstallmentGroup({})).toBe(false);
  });

  it('perna de transferência e linha filha nunca são recriadas', () => {
    expect(belongsToLinkedPair({ transfer_pair_id: 'par-1' })).toBe(true);
    expect(belongsToLinkedPair({ parent_transaction_id: 'mae-1' })).toBe(true);

    const perna = planTransactionEdit({
      original: { amount: 500, payment_method: 'pix', transfer_pair_id: 'par-1' },
      intent: { payment_method: 'transferencia', installment_count: 1 },
    });
    expect(perna.action).toBe('update');
    expect(perna.reason).toBe('locked_linked_row');
    expect(perna.rowsToDelete).toBe(0);
  });

  it('contagem de parcelas inválida nunca vira parcelamento', () => {
    const avulso = { amount: 100, payment_method: 'pix' };
    for (const bad of [0, -3, NaN, null, undefined]) {
      const plan = planTransactionEdit({
        original: avulso,
        intent: { payment_method: 'pix', installment_count: bad as any },
      });
      expect(plan.installmentCount).toBe(1);
      expect(plan.action).toBe('update');
    }
  });
});

describe('vínculos do lançamento recriado', () => {
  it('reinjeta cliente, OS e contrato que o formulário não conhece', () => {
    const original = {
      customer_id: 'cliente-9',
      service_order_id: 'os-9',
      contract_id: 'contrato-9',
      employee_id: 'func-9',
      payroll_period: '2026-01',
      payroll_kind: 'salary',
    };
    const formData = { description: 'Serviço', amount: 500 };

    const payload = carryOverTransactionLinks(formData, original);

    expect(payload).toMatchObject({
      description: 'Serviço',
      amount: 500,
      customer_id: 'cliente-9',
      service_order_id: 'os-9',
      contract_id: 'contrato-9',
      employee_id: 'func-9',
      payroll_period: '2026-01',
      payroll_kind: 'salary',
    });
  });

  it('o que o formulário mandou tem prioridade e original vazio não cria a chave', () => {
    const payload = carryOverTransactionLinks(
      { customer_id: 'cliente-novo', service_order_id: '' },
      { customer_id: 'cliente-antigo', service_order_id: null, contract_id: null },
    );

    expect(payload.customer_id).toBe('cliente-novo');
    expect(payload.service_order_id).toBe('');
    expect('contract_id' in payload).toBe(false);
  });

  it('sem original não inventa vínculo', () => {
    expect(carryOverTransactionLinks({ amount: 10 }, null)).toEqual({ amount: 10 });
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A MESMA VENDA, EDITADA PELA FICHA DO CLIENTE
 *
 * O formulário é o mesmo (`TransactionFormDialog`), mas a aba Financeiro da
 * ficha do cliente tinha a SUA cópia da decisão de salvar. Quando o bug foi
 * corrigido no Financeiro geral, essa cópia ficou pra trás — e ficou PIOR:
 * com o formulário passando a semear `installment_count = 1`, trocar a forma
 * de pagamento da parcela 3/10 por lá criava UMA linha de R$ 100 e apagava as
 * DEZ de R$ 100 (`.delete().eq('installment_group_id', ...)`).
 * Mesmo estrago do bug original: R$ 1.000 viravam R$ 100.
 *
 * Agora as duas telas passam por `useTransactionEditSubmit`, que consulta este
 * motor. Os testes abaixo travam as duas pontas.
 */

/** O caminho ANTIGO da ficha do cliente, reconstruído linha a linha. */
function simulateLegacyCustomerDetailSave(
  group: Row[],
  editedIndex: number,
  intent: { payment_method?: string | null; installment_count?: number | null },
  fichaCustomerId: string,
): Row[] {
  const original = group[editedIndex];
  const wasOnePayment = !original.installment_total || original.installment_total <= 1;
  const willBeMultiple = (intent.installment_count ?? 1) > 1;
  const paymentMethodChanged = original.payment_method !== intent.payment_method;
  const needsReplace = (wasOnePayment && willBeMultiple) || paymentMethodChanged;
  if (!needsReplace) return group;

  const criadas = buildInstallmentPlan(
    original.transaction_date,
    original.amount,
    intent.installment_count ?? 1,
  ).map((p) => ({
    ...original,
    id: `nova-${p.number}`,
    amount: p.amount,
    transaction_date: p.date,
    payment_method: intent.payment_method ?? null,
    customer_id: original.customer_id ?? fichaCustomerId,
    installment_group_id: null,
    installment_total: intent.installment_count ?? 1,
  }));

  // `.delete().eq('installment_group_id', ...)` — o grupo inteiro ia junto.
  const sobreviventes = original.installment_group_id
    ? group.filter((r) => r.installment_group_id !== original.installment_group_id)
    : group.filter((r) => r.id !== original.id);
  return [...sobreviventes, ...criadas];
}

/** O caminho ATUAL da ficha do cliente: o que `useTransactionEditSubmit` faz. */
function simulateCustomerDetailSave(
  group: Row[],
  editedIndex: number,
  intent: { payment_method?: string | null; installment_count?: number | null },
  fichaCustomerId: string,
): Row[] {
  const original = group[editedIndex];
  const plan = planTransactionEdit({ original, intent });

  if (plan.action === 'update') {
    return group.map((r, i) =>
      i === editedIndex ? { ...r, payment_method: intent.payment_method ?? r.payment_method } : r,
    );
  }

  // `replace` apaga NO MÁXIMO a própria linha: a porta de exclusão do hook
  // recebe um id e nada mais.
  expect(plan.rowsToDelete).toBe(1);
  const payload = carryOverTransactionLinks(
    {
      ...intent,
      amount: original.amount,
      transaction_date: original.transaction_date,
    } as Record<string, any>,
    original as Record<string, any>,
    { fallbackCustomerId: fichaCustomerId },
  );
  const irmasIntactas = group.filter((_, i) => i !== editedIndex);
  const criadas = buildInstallmentPlan(
    original.transaction_date,
    original.amount,
    plan.installmentCount,
  ).map((p) => ({
    ...(payload as Row),
    id: `nova-${p.number}`,
    amount: p.amount,
    transaction_date: p.date,
    installment_total: plan.installmentCount,
  }));
  return [...irmasIntactas, ...criadas];
}

describe('a MESMA venda de R$ 1.000,00 em 10x, editada pela ficha do cliente', () => {
  it('o caminho ANTIGO da ficha apagava as 10 parcelas e deixava UMA de R$ 100,00', () => {
    const grupo = vendaEmDezVezes();
    expect(somaDo(grupo)).toBe(1000);

    // Formulário já corrigido (semeia 1), cópia da ficha ainda não: o usuário
    // só trocou boleto por pix na parcela 3.
    const depois = simulateLegacyCustomerDetailSave(
      grupo,
      2,
      { payment_method: 'pix', installment_count: 1 },
      'cliente-1',
    );

    expect(depois).toHaveLength(1);
    expect(somaDo(depois)).toBe(100); // 90% do dinheiro evaporado, de novo
  });

  it('pela ficha do cliente, os R$ 1.000,00 continuam de pé e as 10 parcelas seguem lá', () => {
    const grupo = vendaEmDezVezes();
    const depois = simulateCustomerDetailSave(
      grupo,
      2,
      { payment_method: 'pix', installment_count: 1 },
      'cliente-1',
    );

    expect(somaDo(depois)).toBe(1000);
    expect(depois).toHaveLength(10);
    expect(depois.every((r) => r.amount === 100)).toBe(true);
    // Nenhuma irmã foi apagada: os ids são exatamente os mesmos.
    expect(depois.map((r) => r.id)).toEqual(grupo.map((r) => r.id));
    expect(depois[2].payment_method).toBe('pix');
  });

  it('o vínculo com o cliente sobrevive à edição feita dentro da ficha dele', () => {
    const grupo = vendaEmDezVezes();
    const depois = simulateCustomerDetailSave(
      grupo,
      2,
      { payment_method: 'pix', installment_count: 1 },
      'cliente-1',
    );

    expect(depois.every((r) => r.customer_id === 'cliente-1')).toBe(true);
    expect(depois[2].customer_id).toBe('cliente-1');
    // E o lançamento continua aparecendo na ficha (é o filtro da tela).
    expect(depois.filter((r) => r.customer_id === 'cliente-1')).toHaveLength(10);
  });

  it('lançamento avulso SEM cliente, recriado dentro da ficha, adota aquele cliente', () => {
    const avulso: Row[] = [
      {
        id: 'avulso-1',
        amount: 250,
        transaction_date: '2026-02-10',
        payment_method: 'dinheiro',
        installment_group_id: null,
        installment_total: 1,
        customer_id: null,
        service_order_id: 'os-7',
        contract_id: null,
      },
    ];

    const depois = simulateCustomerDetailSave(
      avulso,
      0,
      { payment_method: 'pix', installment_count: 1 },
      'cliente-da-ficha',
    );

    expect(depois).toHaveLength(1);
    expect(somaDo(depois)).toBe(250);
    expect(depois[0].customer_id).toBe('cliente-da-ficha');
    // O vínculo com a OS veio junto, como nos demais recriados.
    expect(depois[0].service_order_id).toBe('os-7');
  });

  it('o cliente da ficha nunca sobrescreve o cliente que o lançamento já tinha', () => {
    const payload = carryOverTransactionLinks(
      { description: 'Serviço' } as Record<string, any>,
      { customer_id: 'cliente-dono' },
      { fallbackCustomerId: 'cliente-da-ficha' },
    );
    expect(payload.customer_id).toBe('cliente-dono');

    const doFormulario = carryOverTransactionLinks(
      { customer_id: 'cliente-escolhido-no-form' },
      { customer_id: 'cliente-dono' },
      { fallbackCustomerId: 'cliente-da-ficha' },
    );
    expect(doFormulario.customer_id).toBe('cliente-escolhido-no-form');
  });
});

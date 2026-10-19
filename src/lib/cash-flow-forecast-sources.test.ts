import { describe, it, expect } from 'vitest';
import {
  buildForecastEvents,
  deriveForecastOpeningBalances,
  type ForecastBill,
} from './cash-flow-forecast-sources';
import type { FinancialTransaction } from '@/types/database';

const HOJE = '2026-10-18';

function txn(over: Partial<FinancialTransaction> = {}): FinancialTransaction {
  return {
    id: over.id ?? `t${Math.random().toString(36).slice(2, 9)}`,
    company_id: 'empresa',
    transaction_type: 'saida',
    amount: 100,
    description: 'Lançamento',
    transaction_date: HOJE,
    due_date: HOJE,
    is_paid: false,
    amount_received: 0,
    ...over,
  } as FinancialTransaction;
}

function fatura(over: Partial<ForecastBill> = {}): ForecastBill {
  return {
    id: over.id ?? 'fat1',
    account_id: 'CARD',
    due_date: '2026-10-25',
    closing_date: '2026-10-15',
    status: 'closed',
    amount_paid: 0,
    total_amount: 1_500,
    ...over,
  };
}

function montar(over: Partial<Parameters<typeof buildForecastEvents>[0]> = {}) {
  return buildForecastEvents({
    openTransactions: [],
    bills: [],
    projections: [],
    today: HOJE,
    ...over,
  });
}

describe('o que NÃO entra no previsto', () => {
  it('lançamento já pago (ele está no saldo de partida)', () => {
    const { events } = montar({ openTransactions: [txn({ is_paid: true, paid_date: HOJE })] });
    expect(events).toHaveLength(0);
  });

  it('lançamento cancelado', () => {
    const { events } = montar({ openTransactions: [txn({ cancelled_at: '2026-10-01' })] });
    expect(events).toHaveLength(0);
  });

  it('compra no cartão (é competência, quem move o caixa é a fatura)', () => {
    const { events } = montar({ openTransactions: [txn({ credit_card_bill_date: '2026-10-01' })] });
    expect(events).toHaveLength(0);
  });

  it('filha de recebimento parcial (a mãe é quem carrega o que falta)', () => {
    const { events } = montar({ openTransactions: [txn({ parent_transaction_id: 'mae' })] });
    expect(events).toHaveLength(0);
  });

  it('sem vencimento NEM data de lançamento: descarta COM aviso, nunca calado', () => {
    const r = montar({
      openTransactions: [txn({ due_date: null, transaction_date: null, description: 'Aluguel' })],
    });
    expect(r.events).toHaveLength(0);
    expect(r.warnings.some((w) => w.includes('Aluguel'))).toBe(true);
  });
});

describe('contagem dupla: cartão de crédito', () => {
  it('12 parcelas + a fatura = só a fatura vira saída', () => {
    const parcelas = Array.from({ length: 12 }, (_, i) =>
      txn({ id: `p${i}`, credit_card_bill_date: '2026-10-01', amount: 200 }),
    );
    const { events } = montar({ openTransactions: parcelas, bills: [fatura({ total_amount: 2_400 })] });
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('bill:fat1');
    expect(events[0].amountCents).toBe(240_000);
  });

  it('a perna de pagamento da fatura é descartada (amount_paid já representa ela)', () => {
    const pagamento = txn({ id: 'pag', bill_id: 'fat1', amount: 500 } as Partial<FinancialTransaction>);
    const { events } = montar({
      openTransactions: [pagamento],
      bills: [fatura({ total_amount: 1_500, amount_paid: 500 })],
    });
    expect(events).toHaveLength(1);
    expect(events[0].amountCents).toBe(100_000); // 1500 - 500
  });

  it('fatura já paga não entra', () => {
    const { events } = montar({ bills: [fatura({ status: 'paid' })] });
    expect(events).toHaveLength(0);
  });

  it('fatura vazia não vira linha de R$ 0', () => {
    const { events } = montar({ bills: [fatura({ total_amount: 0, amount_paid: 0 })] });
    expect(events).toHaveLength(0);
  });

  it('fatura AINDA ABERTA é marcada como estimativa, sem inventar valor', () => {
    const { events } = montar({ bills: [fatura({ closing_date: '2026-10-30', status: 'open' })] });
    expect(events[0].isEstimate).toBe(true);
    expect(events[0].amountCents).toBe(150_000); // o que já tem, não uma média inflada
  });

  it('fatura já fechada não é estimativa', () => {
    const { events } = montar({ bills: [fatura({ closing_date: '2026-10-15' })] });
    expect(events[0].isEstimate).toBe(false);
  });

  it('a fatura vai pro balde sem conta (a pagadora só se sabe no pagamento)', () => {
    const { events } = montar({ bills: [fatura()] });
    expect(events[0].accountId).toBeNull();
  });
});

describe('contagem dupla: recebimento parcial', () => {
  it('a mãe deve só o que falta', () => {
    const { events } = montar({
      openTransactions: [txn({ transaction_type: 'entrada', amount: 1_000, amount_received: 400 })],
    });
    expect(events[0].amountCents).toBe(60_000);
  });

  it('mãe totalmente recebida mas ainda não marcada paga não vira evento de R$ 0', () => {
    const { events } = montar({
      openTransactions: [txn({ transaction_type: 'entrada', amount: 1_000, amount_received: 1_000 })],
    });
    expect(events).toHaveLength(0);
  });

  it('recebido a mais nunca vira valor negativo', () => {
    const { events } = montar({
      openTransactions: [txn({ transaction_type: 'entrada', amount: 1_000, amount_received: 1_500 })],
    });
    expect(events).toHaveLength(0);
  });

  it('regressão da RPC apply_tenant_charge_payment: quita sem criar filha', () => {
    // Ela grava is_paid, paid_date E amount_received = amount na MESMA update.
    // No DRE isso exigiu a prova `hasPartialReceiptChild`; aqui a mãe sai do
    // universo pelo is_paid antes de o espelho ser consultado.
    const { events } = montar({
      openTransactions: [
        txn({ transaction_type: 'entrada', amount: 800, amount_received: 800, is_paid: true, paid_date: HOJE }),
      ],
    });
    expect(events).toHaveLength(0);
  });
});

describe('transferência: cada perna é avaliada sozinha', () => {
  it('as DUAS pernas viram evento (quem decide o que conta é o perímetro, no kernel)', () => {
    const { events } = montar({
      openTransactions: [
        txn({ id: 'out', transfer_pair_id: 'par', account_id: 'A', transaction_type: 'saida' }),
        txn({ id: 'in', transfer_pair_id: 'par', account_id: 'B', transaction_type: 'entrada' }),
      ],
    });
    expect(events.map((e) => e.id).sort()).toEqual(['txn:in', 'txn:out']);
  });

  it('perna de transferência sem conta é descartada COM aviso (a conta é estrutural ali)', () => {
    const r = montar({
      openTransactions: [txn({ transfer_pair_id: 'par', account_id: null })],
    });
    expect(r.events).toHaveLength(0);
    expect(r.warnings.some((w) => w.includes('transferência'))).toBe(true);
  });
});

describe('obrigação comum sem conta', () => {
  it('entra no stream com conta nula, em vez de sumir', () => {
    const { events } = montar({ openTransactions: [txn({ account_id: null })] });
    expect(events).toHaveLength(1);
    expect(events[0].accountId).toBeNull();
  });
});

describe('data do evento', () => {
  it('usa o vencimento quando existe', () => {
    const { events } = montar({
      openTransactions: [txn({ due_date: '2026-11-10', transaction_date: '2026-10-01' })],
    });
    expect(events[0].dueDate).toBe('2026-11-10');
  });

  it('cai na data do lançamento quando não há vencimento', () => {
    const { events } = montar({
      openTransactions: [txn({ due_date: null, transaction_date: '2026-10-01' })],
    });
    expect(events[0].dueDate).toBe('2026-10-01');
  });

  it('aceita data com hora e normaliza para o dia', () => {
    const { events } = montar({
      openTransactions: [txn({ due_date: '2026-11-10T03:00:00Z' })],
    });
    expect(events[0].dueDate).toBe('2026-11-10');
  });
});

describe('projeções recorrentes', () => {
  it('entram como entrada estimada', () => {
    const { events } = montar({
      projections: [{ key: 'c1:2026-11-05', dueDate: '2026-11-05', amount: 1_200, label: 'PMOC', categoryName: 'Contratos' }],
    });
    expect(events[0]).toMatchObject({ id: 'proj:c1:2026-11-05', direction: 'in', amountCents: 120_000, isEstimate: true });
  });
});

describe('saldo de partida com régua própria', () => {
  const contas = [
    { id: 'A', type: 'banco', initial_balance: 1_000 },
    { id: 'CARD', type: 'cartao', initial_balance: 0 },
  ];

  it('soma só o realizado até hoje', () => {
    const { balances } = deriveForecastOpeningBalances(contas, [
      { account_id: 'A', transaction_type: 'entrada', amount: 500, is_paid: true, paid_date: '2026-10-10' },
      { account_id: 'A', transaction_type: 'saida', amount: 200, is_paid: true, paid_date: '2026-10-12' },
    ], HOJE);
    expect(balances.get('A')).toBe(1_300);
  });

  it('exclui cancelado (divergência nº 2 entre as duas réguas de hoje)', () => {
    const { balances } = deriveForecastOpeningBalances(contas, [
      { account_id: 'A', transaction_type: 'entrada', amount: 500, is_paid: true, paid_date: '2026-10-10', cancelled_at: '2026-10-11' },
    ], HOJE);
    expect(balances.get('A')).toBe(1_000);
  });

  it('exclui compra de cartão (divergência nº 1)', () => {
    const { balances } = deriveForecastOpeningBalances(contas, [
      { account_id: 'A', transaction_type: 'saida', amount: 500, is_paid: true, paid_date: '2026-10-10', credit_card_bill_date: '2026-10-01' },
    ], HOJE);
    expect(balances.get('A')).toBe(1_000);
  });

  it('exclui pagamento com data FUTURA e avisa (divergência nº 3)', () => {
    const r = deriveForecastOpeningBalances(contas, [
      { account_id: 'A', transaction_type: 'saida', amount: 500, is_paid: true, paid_date: '2026-10-25' },
    ], HOJE);
    expect(r.balances.get('A')).toBe(1_000);
    expect(r.warnings.some((w) => w.includes('data futura'))).toBe(true);
  });

  it('ignora cartão por completo', () => {
    const { balances } = deriveForecastOpeningBalances(contas, [], HOJE);
    expect(balances.has('CARD')).toBe(false);
  });

  it('devolve também conta fora do caixa (a tela mostra a poupança separada)', () => {
    const { balances } = deriveForecastOpeningBalances(
      [{ id: 'POUP', type: 'banco', initial_balance: 50_000 }], [], HOJE,
    );
    expect(balances.get('POUP')).toBe(50_000);
  });
});

/* ───────────────────────────────────────────────────────────────
 * Firewall contra unificação dos dois motores.
 *
 * `calculateDfc` (realizado) e este adapter (previsto) PRECISAM discordar.
 * Até hoje essa proteção existia só como comentário em `dre-regime.ts`
 * ("⚠️ NÃO UNIFIQUE") — comentário não quebra build. Estes testes quebram,
 * com nome explicando por quê, na cara de quem tentar juntar os dois.
 * ─────────────────────────────────────────────────────────────── */
describe('firewall: o previsto e o realizado discordam DE PROPÓSITO', () => {
  it('o realizado só vê o que foi pago; o previsto só vê o que está em aberto', () => {
    const pago = txn({ id: 'x', is_paid: true, paid_date: HOJE });
    const aberto = txn({ id: 'y', is_paid: false, due_date: HOJE });

    const { events: doPrevisto } = montar({ openTransactions: [pago, aberto] });
    const idsPrevistos = doPrevisto.map((e) => e.id);

    // O previsto ignora o pago. O DFC faria exatamente o contrário.
    expect(idsPrevistos).toEqual(['txn:y']);
  });

  it('o previsto data pelo VENCIMENTO; o realizado data pela baixa', () => {
    const { events } = montar({
      openTransactions: [txn({ due_date: '2026-12-01', transaction_date: '2026-10-01' })],
    });
    // Se alguém trocar para `paid_date`/`transaction_date`, este teste cai.
    expect(events[0].dueDate).toBe('2026-12-01');
  });

  it('o previsto NÃO descarta transferência por `transfer_pair_id` (o realizado descarta)', () => {
    const { events } = montar({
      openTransactions: [txn({ id: 'perna', transfer_pair_id: 'par', account_id: 'A' })],
    });
    // Quem decide se conta é o perímetro do caixa, no kernel — não o par.
    // Sem isso, transferir pra poupança ficaria invisível no fluxo.
    expect(events.map((e) => e.id)).toEqual(['txn:perna']);
  });

  it('o previsto usa saída POSITIVA (o realizado usa negativa)', () => {
    const { events } = montar({ openTransactions: [txn({ transaction_type: 'saida', amount: 100 })] });
    expect(events[0].amountCents).toBe(10_000);
    expect(events[0].direction).toBe('out');
  });
});

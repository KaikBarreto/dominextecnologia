import { describe, it, expect } from 'vitest';
import { walkAccountBalance, type BalanceWalkTxn } from '../finance-balance';

// Duas contas caixa/banco + um cartão. O cartão NUNCA pode entrar no saldo.
const BANCO = 'acc-banco';
const CAIXA = 'acc-caixa';
const CARTAO = 'acc-cartao';
const CASH_BANK = new Set([BANCO, CAIXA]);

function t(over: Partial<BalanceWalkTxn> & { id: string }): BalanceWalkTxn {
  return {
    transaction_type: 'saida',
    amount: 0,
    transaction_date: '2026-07-01',
    is_paid: true,
    account_id: BANCO,
    credit_card_bill_date: null,
    created_at: `${over.transaction_date ?? '2026-07-01'}T12:00:00Z`,
    ...over,
  };
}

/**
 * Referência independente: reconstrói o saldo PRA FRENTE a partir do saldo de
 * abertura e devolve o saldo após cada linha. Se a caminhada retroativa do
 * módulo bate com isto, a aritmética está certa nos dois sentidos.
 */
function forwardBalances(txns: BalanceWalkTxn[], opening: number) {
  const chrono = [...txns].sort((a, b) => {
    const d = String(a.transaction_date).localeCompare(String(b.transaction_date));
    return d !== 0 ? d : String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
  });
  let running = opening;
  const out = new Map<string, number>();
  for (const x of chrono) {
    running += x.transaction_type === 'entrada' ? Number(x.amount) : -Number(x.amount);
    out.set(x.id, running);
  }
  return { balances: out, closing: running };
}

describe('walkAccountBalance', () => {
  describe('saldo após cada movimentação', () => {
    it('a movimentação mais recente exibe exatamente o saldo atual da conta', () => {
      const txns = [
        t({ id: 'a', transaction_date: '2026-07-01', transaction_type: 'entrada', amount: 100 }),
        t({ id: 'b', transaction_date: '2026-07-02', transaction_type: 'saida', amount: 30 }),
      ];
      const { balanceById } = walkAccountBalance(txns, 70, BANCO, CASH_BANK);
      expect(balanceById.get('b')).toBe(70);
      expect(balanceById.get('a')).toBe(100);
    });

    it('bate linha a linha com a reconstrução PRA FRENTE a partir do saldo de abertura', () => {
      const opening = 754.99;
      const txns = [
        t({ id: '1', transaction_date: '2026-07-20', transaction_type: 'saida', amount: 255.55 }),
        t({ id: '2', transaction_date: '2026-07-21', transaction_type: 'entrada', amount: 800 }),
        t({ id: '3', transaction_date: '2026-07-21', transaction_type: 'saida', amount: 214.1, created_at: '2026-07-21T13:00:00Z' }),
        t({ id: '4', transaction_date: '2026-07-22', transaction_type: 'saida', amount: 1274.78 }),
        t({ id: '5', transaction_date: '2026-07-24', transaction_type: 'entrada', amount: 1383.8 }),
      ];
      const fwd = forwardBalances(txns, opening);
      const { balanceById } = walkAccountBalance(txns, fwd.closing, BANCO, CASH_BANK);

      for (const x of txns) {
        expect(balanceById.get(x.id)).toBeCloseTo(fwd.balances.get(x.id)!, 8);
      }
    });

    it('aceita saldo negativo sem inverter o sinal', () => {
      const txns = [
        t({ id: 'a', transaction_date: '2026-07-01', transaction_type: 'entrada', amount: 100 }),
        t({ id: 'b', transaction_date: '2026-07-02', transaction_type: 'saida', amount: 500 }),
      ];
      const { balanceById } = walkAccountBalance(txns, -400, BANCO, CASH_BANK);
      expect(balanceById.get('b')).toBe(-400);
      expect(balanceById.get('a')).toBe(100);
    });

    it('trata amount vindo como string (numeric do Postgres) sem concatenar', () => {
      const txns = [
        t({ id: 'a', transaction_date: '2026-07-01', transaction_type: 'entrada', amount: '100.50' }),
        t({ id: 'b', transaction_date: '2026-07-02', transaction_type: 'saida', amount: '0.50' }),
      ];
      const { balanceById } = walkAccountBalance(txns, 100, BANCO, CASH_BANK);
      expect(balanceById.get('a')).toBe(100.5);
    });
  });

  describe('corte estrutural do universo', () => {
    it('ignora lançamento não pago', () => {
      const txns = [
        t({ id: 'pago', transaction_date: '2026-07-01', transaction_type: 'entrada', amount: 100 }),
        t({ id: 'pendente', transaction_date: '2026-07-02', transaction_type: 'saida', amount: 999, is_paid: false }),
      ];
      const { balanceById } = walkAccountBalance(txns, 100, BANCO, CASH_BANK);
      expect(balanceById.has('pendente')).toBe(false);
      expect(balanceById.get('pago')).toBe(100);
    });

    it('ignora compra de cartão (credit_card_bill_date preenchido)', () => {
      const txns = [
        t({ id: 'caixa', transaction_date: '2026-07-01', transaction_type: 'entrada', amount: 100 }),
        t({ id: 'compra-cartao', transaction_date: '2026-07-02', transaction_type: 'saida', amount: 300, account_id: CARTAO, credit_card_bill_date: '2026-08-10' }),
      ];
      const { balanceById } = walkAccountBalance(txns, 100, undefined, CASH_BANK);
      expect(balanceById.has('compra-cartao')).toBe(false);
      expect(balanceById.get('caixa')).toBe(100);
    });

    it('ignora lançamento sem conta vinculada (não mexe em saldo nenhum)', () => {
      const txns = [
        t({ id: 'com-conta', transaction_date: '2026-07-01', transaction_type: 'entrada', amount: 100 }),
        t({ id: 'sem-conta', transaction_date: '2026-07-02', transaction_type: 'saida', amount: 50, account_id: null }),
      ];
      const { balanceById } = walkAccountBalance(txns, 100, undefined, CASH_BANK);
      expect(balanceById.has('sem-conta')).toBe(false);
    });

    it('ignora conta de cartão mesmo sem credit_card_bill_date (não está no Set de caixa/banco)', () => {
      const txns = [t({ id: 'x', account_id: CARTAO, transaction_type: 'saida', amount: 100 })];
      const { balanceById } = walkAccountBalance(txns, 0, undefined, CASH_BANK);
      expect(balanceById.size).toBe(0);
    });

    it('extrato de UMA conta não enxerga movimentação de outra conta', () => {
      const txns = [
        t({ id: 'banco', account_id: BANCO, transaction_date: '2026-07-01', transaction_type: 'entrada', amount: 100 }),
        t({ id: 'caixa', account_id: CAIXA, transaction_date: '2026-07-02', transaction_type: 'entrada', amount: 500 }),
      ];
      const { balanceById } = walkAccountBalance(txns, 100, BANCO, CASH_BANK);
      expect(balanceById.has('caixa')).toBe(false);
      expect(balanceById.get('banco')).toBe(100);
    });
  });

  describe('consolidado da Visão Geral', () => {
    it('soma as duas contas na mesma linha do tempo', () => {
      const txns = [
        t({ id: 'a', account_id: BANCO, transaction_date: '2026-07-01', transaction_type: 'entrada', amount: 100 }),
        t({ id: 'b', account_id: CAIXA, transaction_date: '2026-07-02', transaction_type: 'entrada', amount: 50 }),
      ];
      // Saldo consolidado atual = 150.
      const { balanceById } = walkAccountBalance(txns, 150, undefined, CASH_BANK);
      expect(balanceById.get('b')).toBe(150);
      expect(balanceById.get('a')).toBe(100);
    });

    it('transferência entre contas volta pro mesmo total (par se anula)', () => {
      const txns = [
        t({ id: 'saida-a', account_id: BANCO, transaction_date: '2026-07-01', transaction_type: 'saida', amount: 200, created_at: '2026-07-01T10:00:00Z' }),
        t({ id: 'entrada-b', account_id: CAIXA, transaction_date: '2026-07-01', transaction_type: 'entrada', amount: 200, created_at: '2026-07-01T10:00:01Z' }),
      ];
      const { balanceById, dayClosingBalance } = walkAccountBalance(txns, 1000, undefined, CASH_BANK);
      // A perna mais recente exibe o total; a anterior, o total sem a entrada.
      expect(balanceById.get('entrada-b')).toBe(1000);
      expect(balanceById.get('saida-a')).toBe(800);
      // Fecho do dia = total consolidado, transferência não muda o caixa total.
      expect(dayClosingBalance.get('2026-07-01')).toBe(1000);
    });
  });

  describe('saldo de fechamento do dia', () => {
    it('é o saldo após o ÚLTIMO movimento do dia, não o primeiro', () => {
      const txns = [
        t({ id: 'd1', transaction_date: '2026-07-28', transaction_type: 'entrada', amount: 220, created_at: '2026-07-28T09:00:00Z' }),
        t({ id: 'd2', transaction_date: '2026-07-28', transaction_type: 'saida', amount: 72.7, created_at: '2026-07-28T17:00:00Z' }),
        t({ id: 'd3', transaction_date: '2026-07-29', transaction_type: 'entrada', amount: 225, created_at: '2026-07-29T09:00:00Z' }),
      ];
      const fwd = forwardBalances(txns, 0);
      const { dayClosingBalance } = walkAccountBalance(txns, fwd.closing, BANCO, CASH_BANK);

      expect(dayClosingBalance.get('2026-07-28')).toBeCloseTo(fwd.balances.get('d2')!, 8);
      expect(dayClosingBalance.get('2026-07-29')).toBeCloseTo(fwd.balances.get('d3')!, 8);
    });

    it('o fechamento do último dia é o saldo atual da conta', () => {
      const txns = [
        t({ id: 'a', transaction_date: '2026-07-01', transaction_type: 'entrada', amount: 100 }),
        t({ id: 'b', transaction_date: '2026-09-01', transaction_type: 'saida', amount: 40 }),
      ];
      const { dayClosingBalance } = walkAccountBalance(txns, 60, BANCO, CASH_BANK);
      expect(dayClosingBalance.get('2026-09-01')).toBe(60);
      expect(dayClosingBalance.get('2026-07-01')).toBe(100);
    });

    it('um dia só com compra de cartão não ganha fechamento (não é dia de caixa)', () => {
      const txns = [
        t({ id: 'caixa', transaction_date: '2026-07-01', transaction_type: 'entrada', amount: 100 }),
        t({ id: 'cartao', transaction_date: '2026-07-05', account_id: CARTAO, transaction_type: 'saida', amount: 300, credit_card_bill_date: '2026-08-10' }),
      ];
      const { dayClosingBalance } = walkAccountBalance(txns, 100, undefined, CASH_BANK);
      expect(dayClosingBalance.has('2026-07-05')).toBe(false);
      expect(dayClosingBalance.get('2026-07-01')).toBe(100);
    });
  });

  describe('determinismo com created_at idêntico', () => {
    // Caso real: o par CMV materiais + mão de obra gerado ao fechar um
    // orçamento grava `created_at` igual até o microssegundo. Sem desempate por
    // `id`, o saldo intermediário mudava conforme a ordem que o banco devolvia.
    const mesmoInstante = '2026-08-11T00:19:23.322422Z';
    const par: BalanceWalkTxn[] = [
      t({ id: 'aaa', transaction_date: '2026-08-11', transaction_type: 'saida', amount: 145.4, created_at: mesmoInstante }),
      t({ id: 'bbb', transaction_date: '2026-08-11', transaction_type: 'saida', amount: 323.8, created_at: mesmoInstante }),
    ];

    it('a ordem do array de entrada NÃO muda nenhum saldo', () => {
      const a = walkAccountBalance(par, 0, BANCO, CASH_BANK);
      const b = walkAccountBalance([...par].reverse(), 0, BANCO, CASH_BANK);
      expect(a.balanceById.get('aaa')).toBe(b.balanceById.get('aaa'));
      expect(a.balanceById.get('bbb')).toBe(b.balanceById.get('bbb'));
      expect(a.dayClosingBalance.get('2026-08-11')).toBe(b.dayClosingBalance.get('2026-08-11'));
    });

    it('o fechamento do dia continua sendo o saldo âncora, independente do desempate', () => {
      const { dayClosingBalance } = walkAccountBalance(par, 0, BANCO, CASH_BANK);
      expect(dayClosingBalance.get('2026-08-11')).toBe(0);
    });
  });

  it('lista vazia devolve mapas vazios (não estoura, não inventa saldo)', () => {
    const { balanceById, dayClosingBalance } = walkAccountBalance([], 500, BANCO, CASH_BANK);
    expect(balanceById.size).toBe(0);
    expect(dayClosingBalance.size).toBe(0);
  });
});

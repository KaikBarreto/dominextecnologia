// ─────────────────────────────────────────────────────────────────────────────
// Guarda da ORDEM do "Zerar Sistema" quando o PDV entra na conta.
//
// POR QUE ESTE TESTE EXISTE: o step do PDV tem que rodar ANTES do financeiro,
// do estoque, do catálogo de materiais e dos clientes. Não é gosto de leitura,
// é consequência das FKs reais (conferidas em produção em 18/10/2026):
//
//   pdv_order_payments.financial_transaction_id     → ON DELETE SET NULL
//   pdv_cash_movements.financial_transaction_id     → ON DELETE SET NULL
//   customer_credit_ledger.financial_transaction_id → ON DELETE SET NULL
//   pdv_order_items.inventory_id                    → ON DELETE SET NULL
//   pdv_orders.stock_id / pdv_orders.customer_id    → ON DELETE SET NULL
//
// Se qualquer um daqueles steps rodar primeiro, o SET NULL REESCREVE o
// livro-razão do PDV em vez de apagá-lo: a venda paga sobrevive sem saber de
// qual lançamento, de qual produto e de qual cliente ela era. O usuário mandou
// zerar, a tela disse que zerou, e ficou um pedido pago órfão no banco.
//
// Mover a linha do 'pdv' no RESET_PIPELINE pra "ficar junto do financeiro"
// parece arrumação e é regressão. Este teste existe pra barrar isso.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { RESET_PIPELINE, type ResetStep } from '@/hooks/useResetSystem';

const posicao = (step: ResetStep) => RESET_PIPELINE.findIndex((p) => p.step === step);

describe('RESET_PIPELINE — step do PDV', () => {
  it('existe exatamente um step pdv, amarrado à flag delete_pdv', () => {
    const doPdv = RESET_PIPELINE.filter((p) => p.step === 'pdv');
    expect(doPdv).toHaveLength(1);
    expect(doPdv[0].flag).toBe('delete_pdv');
  });

  it('roda antes do financeiro, do estoque, dos materiais e dos clientes', () => {
    const pdv = posicao('pdv');
    expect(pdv).toBeGreaterThanOrEqual(0);

    for (const depois of ['financial_movements', 'stock', 'materials', 'customers'] as const) {
      const outro = posicao(depois);
      expect(outro).toBeGreaterThanOrEqual(0);
      expect(pdv).toBeLessThan(outro);
    }
  });

  it('todo step do pipeline aponta pra uma flag distinta', () => {
    const flags = RESET_PIPELINE.map((p) => p.flag);
    expect(new Set(flags).size).toBe(flags.length);

    const steps = RESET_PIPELINE.map((p) => p.step);
    expect(new Set(steps).size).toBe(steps.length);
  });
});

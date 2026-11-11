import { describe, expect, it } from 'vitest';
import { getPdvCashQueueCopy } from './pdvCashQueueCopy';

describe('copy da fila do caixa por modo de entrega', () => {
  it('deixa claro que o caixa entrega no fluxo de duas etapas', () => {
    const copy = getPdvCashQueueCopy(true);

    expect(copy.action).toBe('Receber e entregar');
    expect(copy.description).toContain('Todos os itens serão entregues agora');
    expect(copy.successTitle).toBe('Pedido recebido e entregue');
  });

  it('mantém a expedição no fluxo de três etapas', () => {
    const copy = getPdvCashQueueCopy(false);

    expect(copy.action).toBe('Receber e liberar');
    expect(copy.description).toContain('depois, na expedição');
    expect(copy.successTitle).toBe('Pedido liberado para retirada');
  });
});

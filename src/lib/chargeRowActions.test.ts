import { describe, it, expect, vi } from 'vitest';
import { buildChargeRowActions, type ChargeRowActionKey } from './chargeRowActions';

const labels = {
  copyLink: 'Copiar link',
  whatsapp: 'Enviar por WhatsApp',
  openCheckout: 'Abrir checkout',
  edit: 'Editar',
  delete: 'Excluir',
  refund: 'Estornar',
};

const handlers = () => ({
  onCopyLink: vi.fn(),
  onWhatsapp: vi.fn(),
  onOpenCheckout: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onRefund: vi.fn(),
});

const keysFor = (status: string, asaas_payment_id: string | null = 'pay_1'): ChargeRowActionKey[] =>
  buildChargeRowActions({ status, asaas_payment_id }, labels, handlers()).map((a) => a.key);

/**
 * A ficha do cliente monta este mesmo array nas TRÊS superfícies (tabela da aba
 * Financeiro, tabela da aba Cobranças e cards do mobile). Testar a função é
 * testar as três — é o que impede a ficha de virar um caminho que fura a trava
 * da Central de Cobranças.
 */
describe('buildChargeRowActions — travas da cobrança na ficha do cliente', () => {
  it('cobrança a receber oferece editar e excluir, e não oferece estorno', () => {
    expect(keysFor('PENDING')).toEqual(['copy', 'whatsapp', 'checkout', 'edit', 'delete']);
  });

  it('cobrança vencida também pode ser editada e excluída', () => {
    expect(keysFor('OVERDUE')).toEqual(['copy', 'whatsapp', 'checkout', 'edit', 'delete']);
  });

  it('cobrança PAGA não oferece editar nem excluir, só estorno', () => {
    expect(keysFor('RECEIVED')).toEqual(['copy', 'whatsapp', 'checkout', 'refund']);
    expect(keysFor('CONFIRMED')).toEqual(['copy', 'whatsapp', 'checkout', 'refund']);
  });

  it('paga em DINHEIRO não oferece editar, excluir nem estornar', () => {
    expect(keysFor('RECEIVED_IN_CASH')).toEqual(['copy', 'whatsapp', 'checkout']);
  });

  it('paga sem id no gateway não oferece estorno', () => {
    expect(keysFor('RECEIVED', null)).toEqual(['copy', 'whatsapp', 'checkout']);
  });

  it('cobrança ESTORNADA não oferece nenhuma ação destrutiva', () => {
    expect(keysFor('REFUNDED')).toEqual(['copy', 'whatsapp', 'checkout']);
    expect(keysFor('CHARGEBACK')).toEqual(['copy', 'whatsapp', 'checkout']);
  });

  it('status desconhecido do gateway falha fechado (só as ações de leitura)', () => {
    expect(keysFor('ALGO_NOVO')).toEqual(['copy', 'whatsapp', 'checkout']);
  });

  it('excluir usa o token destrutivo e editar o token de edição', () => {
    const actions = buildChargeRowActions({ status: 'PENDING' }, labels, handlers());
    expect(actions.find((a) => a.key === 'edit')?.variant).toBe('edit');
    expect(actions.find((a) => a.key === 'delete')?.variant).toBe('delete');
    expect(actions.find((a) => a.key === 'refund')).toBeUndefined();
  });

  it('cada ação dispara o handler correspondente', () => {
    const h = handlers();
    const actions = buildChargeRowActions({ status: 'PENDING' }, labels, h);
    actions.find((a) => a.key === 'edit')!.onClick();
    actions.find((a) => a.key === 'delete')!.onClick();
    expect(h.onEdit).toHaveBeenCalledTimes(1);
    expect(h.onDelete).toHaveBeenCalledTimes(1);
    expect(h.onRefund).not.toHaveBeenCalled();
  });
});

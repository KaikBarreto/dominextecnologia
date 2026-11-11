import { describe, expect, it } from 'vitest';
import { generatePdvDeliveryReceiptPdf, planPdvDeliveryReceiptBlocks } from './deliveryReceiptPdf';
import type { PdvDeliveryReceipt } from '@/hooks/usePdvDispatch';

function longReceipt(itemCount = 80): PdvDeliveryReceipt {
  return {
    kind: 'withdrawal_non_fiscal',
    deliveryId: 'delivery-fixture',
    withdrawnAt: '2026-11-07T10:00:00.000Z',
    order: { id: 'order-fixture', number: 104, status: 'retirada_parcial' },
    customerName: 'Cliente Exemplo',
    stockName: 'Depósito principal',
    items: Array.from({ length: itemCount }, (_, index) => ({
      description: `Item ${index + 1} com descrição longa para validar quebra de linha antes da borda da página`,
      unit: 'un',
      quantity: index + 1,
      remainingQuantity: itemCount - index,
    })),
    notice: 'Comprovante não fiscal de retirada. Reimprimir não altera estoque ou pagamento.',
  };
}

describe('comprovante de retirada paginado', () => {
  it('move o bloco completo antes de escrever e mantém todas as descrições dentro das páginas', () => {
    const receipt = longReceipt();
    const plan = planPdvDeliveryReceiptBlocks(receipt.items, 73, (text) => {
      const midpoint = Math.ceil(text.length / 2);
      return [text.slice(0, midpoint), text.slice(midpoint)];
    });

    expect(plan.blocks).toHaveLength(receipt.items.length);
    expect(plan.page).toBeGreaterThan(1);
    expect(plan.blocks.map((block) => block.description)).toEqual(
      receipt.items.map((item) => `${item.description} — ${item.quantity} ${item.unit} (restante: ${item.remainingQuantity} ${item.unit})`),
    );
    for (const block of plan.blocks) {
      expect(block.y).toBeGreaterThanOrEqual(18);
      expect(block.y + block.height).toBeLessThanOrEqual(275);
    }
  });

  it('gera um PDF multipágina válido para uma lista longa', async () => {
    const blob = generatePdvDeliveryReceiptPdf(longReceipt());
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(1_000);
    const source = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob, 'ISO-8859-1');
    });
    expect(source.match(/\/Type \/Page\b/g)?.length ?? 0).toBeGreaterThan(1);
  });
});

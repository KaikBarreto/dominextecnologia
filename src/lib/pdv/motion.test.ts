import { describe, expect, it } from 'vitest';
import { PDV_CART_ITEM_MOTION, PDV_HISTORY_ROW_MOTION } from './motion';

describe('régua de movimento do PDV', () => {
  it('mantém deslocamentos perceptíveis sem deixar a operação lenta', () => {
    expect(PDV_CART_ITEM_MOTION.layoutDuration).toBeGreaterThanOrEqual(0.36);
    expect(PDV_CART_ITEM_MOTION.exitDuration).toBeGreaterThanOrEqual(0.3);
    expect(PDV_HISTORY_ROW_MOTION.layoutDuration).toBeGreaterThanOrEqual(0.36);

    expect(PDV_CART_ITEM_MOTION.layoutDuration).toBeLessThanOrEqual(0.45);
    expect(PDV_HISTORY_ROW_MOTION.layoutDuration).toBeLessThanOrEqual(0.45);
  });

  it('mantém o destaque visual depois que o movimento termina', () => {
    expect(PDV_CART_ITEM_MOTION.highlightDuration).toBeGreaterThan(
      PDV_CART_ITEM_MOTION.layoutDuration,
    );
    expect(PDV_HISTORY_ROW_MOTION.highlightDuration).toBeGreaterThan(
      PDV_HISTORY_ROW_MOTION.layoutDuration,
    );
  });
});

import { describe, expect, it } from 'vitest';
import { PDV_SALES_FLOW_STAGE_META } from './pdvSalesFlowStage';

function luminance(rgb: number[]) {
  return rgb.map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

describe('legibilidade dos cabeçalhos canônicos do PDV', () => {
  it.each(Object.entries(PDV_SALES_FLOW_STAGE_META))('%s mantém texto branco legível também sobre o contador branco a 20%%', (_, stage) => {
    const rgb = [1, 3, 5].map(index => Number.parseInt(stage.color.slice(index, index + 2), 16));
    const counterBackground = rgb.map(channel => channel * 0.8 + 255 * 0.2);
    expect(1.05 / (luminance(rgb) + 0.05)).toBeGreaterThanOrEqual(4.5);
    expect(1.05 / (luminance(counterBackground) + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});

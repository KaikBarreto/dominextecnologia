import { describe, expect, it } from 'vitest';
import { encodeCode128B } from '@/lib/pdv/inventoryLabelPdf';

describe('encodeCode128B', () => {
  it('gera barras com quiet zone e checksum deterministico', () => {
    const first = encodeCode128B('DX-ABC123');
    const second = encodeCode128B('DX-ABC123');
    expect(first).toEqual(second);
    expect(first[0]).toBe(10);
    expect(first.at(-1)).toBe(10);
    expect(first.every((width) => width > 0)).toBe(true);
    expect(first.length).toBeGreaterThan(60);
  });

  it('recusa vazio e caracteres fora do conjunto B', () => {
    expect(() => encodeCode128B('')).toThrow(/Code 128/);
    expect(() => encodeCode128B('ação')).toThrow(/Code 128/);
  });
});

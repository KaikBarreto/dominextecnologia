import { describe, expect, it } from 'vitest';
import source from './PdvPaymentDialog.tsx?raw';

describe('PdvPaymentDialog no celular', () => {
  it('abre no topo sem focar automaticamente o campo de valor', () => {
    expect(source).toContain("import { useIsCompact } from '@/hooks/use-mobile'");
    expect(source).toContain('const isCompact = useIsCompact()');
    expect(source.match(/autoFocus=\{!isCompact && sortedRows\[0\]\?\.id === row\.id\}/g)).toHaveLength(2);
  });

  it('preserva os controles de data e moeda do app em vez de depender do idioma do dispositivo', () => {
    expect(source).toContain('<DatePicker');
    expect(source).toContain('<PdvMoneyInput');
    expect(source).toContain('<SelectTrigger');
    expect(source).not.toContain('type="date"');
    expect(source).not.toContain('type="number"');
    expect(source).not.toContain('sm:truncate');
  });
});

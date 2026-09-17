import { describe, it, expect } from 'vitest';
import { centsFromPastedAmount } from './money-paste-mask';

describe('centsFromPastedAmount', () => {
  it('"4.550" (milhar, sem centavos) vira 455000 centavos (R$ 4.550,00), não 45500 (R$ 455,00... nem 45,50)', () => {
    expect(centsFromPastedAmount('4.550')).toBe(455000);
  });

  it('"R$ 4.550" com o prefixo de moeda também funciona', () => {
    expect(centsFromPastedAmount('R$ 4.550')).toBe(455000);
  });

  it('"4550" (dígitos puros, sem separador) é interpretado como reais inteiros: 455000 centavos', () => {
    expect(centsFromPastedAmount('4550')).toBe(455000);
  });

  it('"4.55" (2 casas) é decimal: 4,55 reais = 455 centavos', () => {
    expect(centsFromPastedAmount('4.55')).toBe(455);
  });

  it('"1.234.567,89" (BR completo) vira 123456789 centavos', () => {
    expect(centsFromPastedAmount('1.234.567,89')).toBe(123456789);
  });

  it('"1,234,567.89" (internacional) vira 123456789 centavos', () => {
    expect(centsFromPastedAmount('1,234,567.89')).toBe(123456789);
  });

  it('"4,55" (vírgula decimal BR) vira 455 centavos', () => {
    expect(centsFromPastedAmount('4,55')).toBe(455);
  });

  it('"1.5" (1 casa) é decimal: 150 centavos', () => {
    expect(centsFromPastedAmount('1.5')).toBe(150);
  });

  it('texto sem nenhum dígito devolve null', () => {
    expect(centsFromPastedAmount('abc')).toBeNull();
    expect(centsFromPastedAmount('')).toBeNull();
  });

  it('"0" vira 0 centavos, não null', () => {
    expect(centsFromPastedAmount('0')).toBe(0);
  });
});

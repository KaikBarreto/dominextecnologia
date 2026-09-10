import { describe, it, expect } from 'vitest';
import { phoneMask, mobileMask } from '@/utils/masks';

describe('phoneMask', () => {
  it('formata progressivamente sem hífen até 6 dígitos', () => {
    expect(phoneMask('1')).toBe('(1');
    expect(phoneMask('11')).toBe('(11');
    expect(phoneMask('113')).toBe('(11) 3');
    expect(phoneMask('1133')).toBe('(11) 33');
    expect(phoneMask('11333')).toBe('(11) 333');
    expect(phoneMask('113333')).toBe('(11) 3333');
  });

  it('8 dígitos (DDD + 6): agrupamento 4+2', () => {
    expect(phoneMask('11333344')).toBe('(11) 3333-44');
  });

  it('9 dígitos (DDD + 7): agrupamento 4+3', () => {
    expect(phoneMask('113333444')).toBe('(11) 3333-444');
  });

  it('10 dígitos (fixo completo): agrupamento 4+4', () => {
    expect(phoneMask('1133334444')).toBe('(11) 3333-4444');
  });

  it('11 dígitos (celular completo): agrupamento 5+4', () => {
    expect(phoneMask('11933334444')).toBe('(11) 93333-4444');
  });

  it('cola um celular de 11 dígitos sem descartar o último dígito', () => {
    // Caso real reportado: colar "21966682012" não pode virar "(21) 9666-8201".
    expect(phoneMask('21966682012')).toBe('(21) 96668-2012');
  });

  it('capa em 11 dígitos mesmo se vier mais dígitos coladas', () => {
    expect(phoneMask('219666820129999')).toBe('(21) 96668-2012');
  });

  it('ignora caracteres não numéricos ao colar formatado', () => {
    expect(phoneMask('(21) 96668-2012')).toBe('(21) 96668-2012');
  });
});

describe('mobileMask (regressão, sem mudança de comportamento)', () => {
  it('formata celular de 11 dígitos com agrupamento 5+4', () => {
    expect(mobileMask('21966682012')).toBe('(21) 96668-2012');
  });
});

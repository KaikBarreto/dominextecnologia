import { describe, expect, it } from 'vitest';
import {
  formatCustomerDocument,
  formatCustomerPhone,
  formatCustomerZipCode,
  getCustomerOriginLabel,
} from './customerDisplay';

describe('customerDisplay', () => {
  it('exibe CPF e CNPJ iguais quando chegam mascarados ou somente com dígitos', () => {
    expect(formatCustomerDocument('12345678909')).toBe('123.456.789-09');
    expect(formatCustomerDocument('123.456.789-09')).toBe('123.456.789-09');
    expect(formatCustomerDocument('12345678000190')).toBe('12.345.678/0001-90');
    expect(formatCustomerDocument('12.345.678/0001-90')).toBe('12.345.678/0001-90');
  });

  it('exibe telefone igual quando chega mascarado, sem máscara ou com DDI 55', () => {
    expect(formatCustomerPhone('1133334444')).toBe('(11) 3333-4444');
    expect(formatCustomerPhone('(11) 3333-4444')).toBe('(11) 3333-4444');
    expect(formatCustomerPhone('11933334444')).toBe('(11) 93333-4444');
    expect(formatCustomerPhone('5511933334444')).toBe('(11) 93333-4444');
  });

  it('não confunde telefone nacional com DDD 55 com o DDI do Brasil', () => {
    expect(formatCustomerPhone('5533334444')).toBe('(55) 3333-4444');
    expect(formatCustomerPhone('55933334444')).toBe('(55) 93333-4444');
  });

  it('exibe CEP igual quando chega mascarado ou somente com dígitos', () => {
    expect(formatCustomerZipCode('01310100')).toBe('01310-100');
    expect(formatCustomerZipCode('01310-100')).toBe('01310-100');
  });

  it('preserva dado legado incompleto em vez de apagá-lo da interface', () => {
    expect(formatCustomerDocument('Documento legado')).toBe('Documento legado');
    expect(formatCustomerPhone('3333-4444')).toBe('3333-4444');
    expect(formatCustomerZipCode('01310')).toBe('01310');
  });

  it('traduz somente a origem interna do formulário público', () => {
    expect(getCustomerOriginLabel('public_form', 'Formulário de captação')).toBe('Formulário de captação');
    expect(getCustomerOriginLabel('Indicação', 'Formulário de captação')).toBe('Indicação');
  });
});

import { describe, expect, it } from 'vitest';
import { formatCustomerAddress } from './customerAddress';

describe('formatCustomerAddress', () => {
  it('preserva todos os campos do endereço do cliente no contexto PMOC', () => {
    expect(formatCustomerAddress({
      address: 'Rua das Flores',
      address_number: '123',
      neighborhood: 'Centro',
      complement: 'Sala 4',
      city: 'São Paulo',
      state: 'SP',
      zip_code: '01000-000',
    })).toBe('Rua das Flores, 123, Centro, Sala 4, São Paulo/SP, CEP 01000-000');
  });

  it('remove espaços e não cria separadores para campos ausentes', () => {
    expect(formatCustomerAddress({
      address: '  Avenida Brasil  ',
      city: ' Rio de Janeiro ',
      state: ' RJ ',
    })).toBe('Avenida Brasil, Rio de Janeiro/RJ');
  });

  it('retorna vazio quando não há endereço cadastrado', () => {
    expect(formatCustomerAddress(null)).toBe('');
    expect(formatCustomerAddress({})).toBe('');
  });
});

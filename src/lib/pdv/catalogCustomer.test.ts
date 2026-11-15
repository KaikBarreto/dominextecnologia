import { describe, expect, it } from 'vitest';
import { projectPdvCatalogCustomer, toPdvCustomerRecord } from './catalogCustomer';

describe('identificação do cliente no catálogo PDV', () => {
  it('leva documento, telefone e endereço completos à projeção visual sem dados financeiros ou notas', () => {
    const projected = projectPdvCatalogCustomer({
      id: 'customer-fictional', name: 'Empresa exemplo', customer_type: 'pj',
      document: '00.000.000/0000-00', phone: '(11) 0000-0000', celular: '(11) 90000-0000',
      email: 'cliente@example.invalid', address: 'Rua Exemplo', address_number: '12',
      neighborhood: 'Centro Exemplo', city: 'Cidade Exemplo', state: 'SP',
      company_name: 'Empresa Exemplo Ltda', nome_fantasia: 'Loja Exemplo',
      credit_limit: 900, balance: 200, notes: 'Nota privada', inscricao_estadual: '000',
    });
    expect(projected).not.toBeNull();
    const visual = toPdvCustomerRecord(projected!);
    expect(visual).toMatchObject({ customer_type: 'pj', document: '00.000.000/0000-00', phone: '(11) 0000-0000', celular: '(11) 90000-0000', address: 'Rua Exemplo', address_number: '12', neighborhood: 'Centro Exemplo', city: 'Cidade Exemplo', state: 'SP', company_name: 'Empresa Exemplo Ltda', nome_fantasia: 'Loja Exemplo' });
    for (const field of ['credit_limit', 'balance', 'notes', 'inscricao_estadual']) expect(visual).not.toHaveProperty(field);
  });

  it('mantém documentos ausentes como ausentes, rejeita formas inválidas e não inventa contatos', () => {
    expect(projectPdvCatalogCustomer(null)).toBeNull();
    expect(projectPdvCatalogCustomer({ id: 'invalid' })).toBeNull();
    expect(projectPdvCatalogCustomer({ id: 'one', name: 'Cliente exemplo', phone: 123, document: null })).toEqual({ id: 'one', name: 'Cliente exemplo' });
  });
});

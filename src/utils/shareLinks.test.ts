import { describe, expect, it } from 'vitest';
import {
  buildServiceOrderShareLink,
  buildWhatsAppLink,
  normalizeWhatsAppPhone,
} from './shareLinks';

describe('buildServiceOrderShareLink', () => {
  it('mantém o link canônico estável quando não há chave de preview', () => {
    expect(buildServiceOrderShareLink({
      shortCode: 'abc234def567',
      customerName: 'Cliente Exemplo',
      serviceName: 'Manutenção',
      osId: 'fallback-id',
    })).toBe(
      'https://www.dominex.app/os-tecnico/cliente-exemplo-manutencao-abc234def567?modo=cliente',
    );
  });

  it('adiciona uma chave que força nova leitura do preview sem trocar a OS', () => {
    expect(buildServiceOrderShareLink({
      shortCode: 'abc234def567',
      customerName: 'Cliente Exemplo',
      serviceName: 'Manutenção',
      previewKey: 'nova arte 2',
    })).toBe(
      'https://www.dominex.app/os-tecnico/cliente-exemplo-manutencao-abc234def567?modo=cliente&preview=nova+arte+2',
    );
  });
});

describe('normalizeWhatsAppPhone', () => {
  it.each([
    ['BR', '(21) 99999-0000', '5521999990000'],
    ['PT', '912 345 678', '351912345678'],
    ['DE', '030 12345', '493012345'],
    ['IT', '06 6982', '39066982'],
    ['UY', '1234 5678', '59812345678'],
  ])('normaliza telefone nacional de %s com a mesma regra regional do worker', (country, phone, expected) => {
    expect(normalizeWhatsAppPhone(phone, country)).toBe(expected);
  });

  it('preserva DDI explícito e rejeita número ou país desconhecido', () => {
    expect(normalizeWhatsAppPhone('+351 912 345 678', 'BR')).toBe('351912345678');
    expect(normalizeWhatsAppPhone('00351 912 345 678', 'BR')).toBe('351912345678');
    expect(normalizeWhatsAppPhone('1234', 'BR')).toBeNull();
    expect(normalizeWhatsAppPhone('912345678', 'ZZ')).toBeNull();
  });

  it('monta wa.me internacional sem prefixar 55 e preserva a mensagem', () => {
    expect(buildWhatsAppLink('+351 912 345 678', 'Olá', 'PT')).toBe(
      'https://wa.me/351912345678?text=Ol%C3%A1',
    );
    expect(buildWhatsAppLink('912345678', undefined, 'PT')).toBe(
      'https://wa.me/351912345678',
    );
  });
});

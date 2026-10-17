import { describe, expect, it } from 'vitest';
import { buildServiceOrderShareLink } from './shareLinks';

describe('buildServiceOrderShareLink', () => {
  it('mantém o link canônico estável quando não há chave de preview', () => {
    expect(buildServiceOrderShareLink({
      shortCode: 'abc234def567',
      customerName: 'Cliente Exemplo',
      serviceName: 'Manutenção',
      osId: 'fallback-id',
    })).toBe(
      'https://dominex.app/os-tecnico/cliente-exemplo-manutencao-abc234def567?modo=cliente',
    );
  });

  it('adiciona uma chave que força nova leitura do preview sem trocar a OS', () => {
    expect(buildServiceOrderShareLink({
      shortCode: 'abc234def567',
      customerName: 'Cliente Exemplo',
      serviceName: 'Manutenção',
      previewKey: 'nova arte 2',
    })).toBe(
      'https://dominex.app/os-tecnico/cliente-exemplo-manutencao-abc234def567?modo=cliente&preview=nova+arte+2',
    );
  });
});

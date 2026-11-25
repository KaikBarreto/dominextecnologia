import { describe, expect, it, vi } from 'vitest';
import {
  isValidIbgeMunicipalityCode,
  resolveCustomerMunicipalityCode,
} from './customerMunicipalityCode';

describe('resolveCustomerMunicipalityCode', () => {
  it('preenche o código IBGE de cliente legado pelo CEP', async () => {
    const lookup = vi.fn().mockResolvedValue({
      cidade: 'Anápolis',
      estado: 'GO',
      ibge: '5201108',
    });

    await expect(resolveCustomerMunicipalityCode({
      zipCode: '75095-435',
      city: 'Anapolis',
      state: 'go',
      municipalityCode: '',
    }, lookup)).resolves.toBe('5201108');
    expect(lookup).toHaveBeenCalledOnce();
    expect(lookup).toHaveBeenCalledWith('75095435');
  });

  it('preserva código IBGE válido sem consultar o CEP novamente', async () => {
    const lookup = vi.fn();

    await expect(resolveCustomerMunicipalityCode({
      zipCode: '75095-435',
      municipalityCode: '5201108',
    }, lookup)).resolves.toBe('5201108');
    expect(lookup).not.toHaveBeenCalled();
  });

  it('não grava código quando o ViaCEP falha e orienta o usuário em PT-BR', async () => {
    const lookup = vi.fn().mockRejectedValue(new Error('indisponível'));

    await expect(resolveCustomerMunicipalityCode({
      zipCode: '75095-435',
      municipalityCode: '',
    }, lookup)).rejects.toThrow('Não foi possível identificar o município pelo CEP');
  });

  it('rejeita CEP incompatível com a cidade ou UF do cadastro', async () => {
    const lookup = vi.fn().mockResolvedValue({
      cidade: 'Goiânia',
      estado: 'GO',
      ibge: '5208707',
    });

    await expect(resolveCustomerMunicipalityCode({
      zipCode: '74000-000',
      city: 'Anápolis',
      state: 'GO',
      municipalityCode: '',
    }, lookup)).rejects.toThrow('município/UF do cadastro é diferente');
  });
});

describe('isValidIbgeMunicipalityCode', () => {
  it('aceita somente sete dígitos', () => {
    expect(isValidIbgeMunicipalityCode('5201108')).toBe(true);
    expect(isValidIbgeMunicipalityCode('')).toBe(false);
    expect(isValidIbgeMunicipalityCode('520110')).toBe(false);
  });
});

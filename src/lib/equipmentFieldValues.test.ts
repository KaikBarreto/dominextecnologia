import { describe, expect, it } from 'vitest';
import { formatEquipmentDate, isEquipmentBooleanTrue } from './equipmentFieldValues';

describe('isEquipmentBooleanTrue', () => {
  it.each([true, 1, 'sim', 'SIM', 'true', ' true ', '1'])('trata %j como Sim', (value) => {
    expect(isEquipmentBooleanTrue(value)).toBe(true);
  });

  it.each([false, 0, 'nao', 'não', 'false', '0', '', null, undefined])('trata %j como Não', (value) => {
    expect(isEquipmentBooleanTrue(value)).toBe(false);
  });
});

describe('formatEquipmentDate', () => {
  it('preserva o dia civil no fuso do Brasil', () => {
    expect(formatEquipmentDate('2025-03-10', 'pt-br', 'America/Sao_Paulo')).toBe('10/03/2025');
  });
});

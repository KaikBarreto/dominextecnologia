import { describe, expect, it } from 'vitest';

import { getAgnosticPermissionPresetDisplay } from './permissionPresetDisplay';

describe('getAgnosticPermissionPresetDisplay', () => {
  it('neutraliza sugestões específicas de refrigeração', () => {
    expect(getAgnosticPermissionPresetDisplay(
      'Auxiliar de refrigeração e climatização',
      'Apoia a equipe de refrigeração.',
    )).toEqual({
      name: 'Auxiliar operacional',
      description: 'Perfil de permissões para atividades operacionais e de campo.',
    });

    expect(getAgnosticPermissionPresetDisplay(
      'Meio oficial de refrigeração e climatização',
      null,
    ).name).toBe('Profissional de campo');
  });

  it('preserva sugestões que já são agnósticas', () => {
    expect(getAgnosticPermissionPresetDisplay(
      'Escritório / ADM',
      'Acesso às rotinas administrativas.',
    )).toEqual({
      name: 'Escritório / ADM',
      description: 'Acesso às rotinas administrativas.',
    });
  });
});

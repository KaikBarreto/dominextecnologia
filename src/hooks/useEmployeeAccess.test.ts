import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke } },
}));
vi.mock('@/utils/errorMessages', () => ({
  getInvokeErrorMessage: vi.fn(async (error: Error) => error.message),
}));

import {
  createEmployeeAccess,
  employeeAccessErrorMessage,
  getInitialEmployeeAccessState,
} from './useEmployeeAccess';

describe('acesso do funcionário', () => {
  beforeEach(() => invoke.mockReset());

  it('reinicia criação sem reaproveitar vínculo, senha ou estado anterior', () => {
    expect(getInitialEmployeeAccessState(null, [])).toEqual({
      linkedUserId: null,
      createAccess: false,
      password: '',
      permissions: [],
      role: 'tecnico',
    });
  });

  it('reidrata o vínculo e o papel do usuário ao editar', () => {
    const employee = { user_id: 'user-1' };
    const users = [{ user_id: 'user-1', role: 'gestor' as const }];
    expect(getInitialEmployeeAccessState(employee, users)).toMatchObject({
      linkedUserId: 'user-1',
      role: 'gestor',
      createAccess: false,
    });
  });

  it('envia papel, permissões e funcionário e só confirma com id de usuário', async () => {
    invoke.mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null });
    const userId = await createEmployeeAccess({
      employeeId: 'employee-1',
      email: 'novo@exemplo.com',
      password: 'Senha123',
      fullName: 'Novo Funcionário',
      role: 'tecnico',
      permissions: ['screen:schedule'],
      presetId: 'preset-1',
    });
    expect(userId).toBe('auth-1');
    expect(invoke).toHaveBeenCalledWith('create-user', expect.objectContaining({
      body: expect.objectContaining({
        employee_id: 'employee-1',
        role: 'tecnico',
        permissions: ['screen:schedule'],
        preset_id: 'preset-1',
      }),
    }));
  });

  it('traduz falhas técnicas e não confirma resposta sem vínculo verificável', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error('Unauthorized JWT') });
    await expect(createEmployeeAccess({
      employeeId: 'employee-1', email: 'novo@exemplo.com', password: 'Senha123',
      fullName: 'Novo Funcionário', role: 'tecnico', permissions: [],
    })).rejects.toThrow('Sua sessão expirou');

    invoke.mockResolvedValueOnce({ data: {}, error: null });
    await expect(createEmployeeAccess({
      employeeId: 'employee-1', email: 'novo@exemplo.com', password: 'Senha123',
      fullName: 'Novo Funcionário', role: 'tecnico', permissions: [],
    })).rejects.toThrow('vínculo não pôde ser confirmado');

    expect(employeeAccessErrorMessage('duplicate user')).toContain('já está cadastrado');
  });
});

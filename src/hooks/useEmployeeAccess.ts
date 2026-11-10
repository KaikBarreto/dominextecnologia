import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { getInvokeErrorMessage } from '@/utils/errorMessages';
import type { AppRole } from '@/hooks/useUsers';
import type { UserWithRole } from '@/hooks/useUsers';
import type { Employee } from '@/hooks/useEmployees';

export type EmployeeAccessRole = Exclude<AppRole, 'super_admin'>;

export interface CreateEmployeeAccessInput {
  employeeId: string;
  email: string;
  password: string;
  fullName: string;
  phone?: string | null;
  avatarUrl?: string | null;
  role: EmployeeAccessRole;
  permissions: string[];
  presetId?: string | null;
}

export function getInitialEmployeeAccessState(
  employee?: Pick<Employee, 'user_id'> | null,
  users: Pick<UserWithRole, 'user_id' | 'role'>[] = [],
) {
  const linkedUser = employee?.user_id ? users.find(user => user.user_id === employee.user_id) : undefined;
  const role = linkedUser?.role && linkedUser.role !== 'super_admin' ? linkedUser.role : 'tecnico';
  return {
    linkedUserId: employee?.user_id || null,
    createAccess: false,
    password: '',
    permissions: [] as string[],
    role: role as EmployeeAccessRole,
  };
}

export function employeeAccessErrorMessage(message: string): string {
  const normalized = message.toLocaleLowerCase('pt-BR');
  if (normalized.includes('já está cadastrado') || normalized.includes('already') || normalized.includes('duplicate')) {
    return 'Este e-mail já está cadastrado. Vincule o usuário existente ou use outro e-mail.';
  }
  if (normalized.includes('sessão') || normalized.includes('unauthorized') || normalized.includes('jwt')) {
    return 'Sua sessão expirou. Entre novamente para criar o acesso.';
  }
  if (normalized.includes('permiss') || normalized.includes('forbidden')) {
    return 'Você não tem permissão para criar ou vincular acessos.';
  }
  if (normalized.includes('funcionário') || normalized.includes('employee')) {
    return 'O funcionário não pertence à sua empresa ou não está mais disponível.';
  }
  if (normalized.includes('senha') || normalized.includes('password')) {
    return 'A senha temporária não atende aos requisitos de segurança.';
  }
  return 'Não foi possível criar e vincular o acesso. O funcionário continua aberto para você tentar novamente.';
}

export async function createEmployeeAccess(input: CreateEmployeeAccessInput): Promise<string> {
  const response = await supabase.functions.invoke('create-user', {
    body: {
      email: input.email.trim(),
      password: input.password,
      full_name: input.fullName,
      phone: input.phone || undefined,
      avatar_url: input.avatarUrl || undefined,
      role: input.role,
      permissions: input.permissions,
      preset_id: input.presetId || undefined,
      employee_id: input.employeeId,
    },
  });

  if (response.error) {
    const detail = await getInvokeErrorMessage(response.error);
    throw new Error(employeeAccessErrorMessage(detail || response.error.message));
  }
  if (response.data?.error) throw new Error(employeeAccessErrorMessage(String(response.data.error)));
  const userId = response.data?.user?.id;
  if (!userId) throw new Error('O acesso foi processado, mas o vínculo não pôde ser confirmado. Tente novamente.');
  return userId;
}

export function useEmployeeAccess() {
  const queryClient = useQueryClient();
  const createAccess = useMutation({
    mutationFn: createEmployeeAccess,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
    },
  });

  return { createAccess };
}

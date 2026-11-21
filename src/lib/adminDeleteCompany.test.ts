import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock, fromMock, selectMock, eqMock, maybeSingleMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  eqMock: vi.fn(),
  maybeSingleMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: rpcMock, from: fromMock },
}));

import { deleteCompanyAsAdmin } from './adminDeleteCompany';
import { NoRowsAffectedError } from './supabaseMutation';

describe('deleteCompanyAsAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: null, error: null });
    fromMock.mockReturnValue({ select: selectMock });
    selectMock.mockReturnValue({ eq: eqMock });
    eqMock.mockReturnValue({ maybeSingle: maybeSingleMock });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
  });

  it('exclui pela RPC admin_delete_company, a mesma da lista', async () => {
    await deleteCompanyAsAdmin('company-1');

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('admin_delete_company', { p_company_id: 'company-1' });
    // Nenhum DELETE direto na tabela: o único acesso a `companies` é a leitura de conferência.
    expect(fromMock).toHaveBeenCalledWith('companies');
    expect(selectMock).toHaveBeenCalledWith('id');
    expect(eqMock).toHaveBeenCalledWith('id', 'company-1');
  });

  it('propaga o erro do servidor (ex.: sem permissão) e não confere depois', async () => {
    const forbidden = { message: 'Você não tem permissão para excluir empresas.', code: '42501' };
    rpcMock.mockResolvedValue({ data: null, error: forbidden });

    await expect(deleteCompanyAsAdmin('company-1')).rejects.toBe(forbidden);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('falha fechado se a empresa ainda existe depois da RPC', async () => {
    maybeSingleMock.mockResolvedValue({ data: { id: 'company-1' }, error: null });

    await expect(deleteCompanyAsAdmin('company-1')).rejects.toBeInstanceOf(NoRowsAffectedError);
  });

  it('propaga erro da leitura de conferência em vez de anunciar sucesso', async () => {
    const readError = { message: 'falha de rede' };
    maybeSingleMock.mockResolvedValue({ data: null, error: readError });

    await expect(deleteCompanyAsAdmin('company-1')).rejects.toBe(readError);
  });

  it('recusa id vazio sem chamar o servidor', async () => {
    await expect(deleteCompanyAsAdmin('')).rejects.toThrow('Empresa não informada.');
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('AdminCompanyDetail usa a RPC para excluir empresa', () => {
  const source = readFileSync(
    resolve(__dirname, '../pages/admin/AdminCompanyDetail.tsx'),
    'utf8',
  );

  it('não faz DELETE direto em companies', () => {
    expect(source).not.toMatch(/from\(\s*['"]companies['"]\s*\)\s*\.delete\(/);
  });

  it('chama o helper da RPC e mantém as mensagens da lista', () => {
    expect(source).toContain('deleteCompanyAsAdmin(id!)');
    expect(source).toContain("toast({ title: 'Empresa excluída' })");
    expect(source).toContain("toast({ variant: 'destructive', title: 'Erro ao excluir' })");
  });
});

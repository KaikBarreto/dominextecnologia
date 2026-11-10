import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const edge = readFileSync(
  `${process.cwd()}/supabase/functions/create-company/index.ts`,
  'utf8',
);
const form = readFileSync(
  `${process.cwd()}/src/components/admin/CompanyFormModal.tsx`,
  'utf8',
);

describe('autorizacao da criacao administrativa de empresas', () => {
  it('aceita super-admin ou a permissao granular de empresas', () => {
    expect(edge).toContain("_role: 'super_admin'");
    expect(edge).toContain("_permission: 'admin_empresas'");
    expect(edge).toContain('!superAdminResult.data && !companyPermissionResult.data');
  });

  it('falha fechado quando a verificacao de permissao nao pode ser concluida', () => {
    expect(edge).toContain('superAdminResult.error || companyPermissionResult.error');
    expect(edge).toContain('Não foi possível validar sua permissão para criar empresas. Tente novamente.');
    expect(edge).toContain("return json({ error: 'Não foi possível validar sua permissão para criar empresas. Tente novamente.' }, 503)");
    expect(edge.indexOf("_permission: 'admin_empresas'")).toBeLessThan(edge.indexOf('const body = await req.json()'));
  });

  it('nao devolve codigos internos de autorizacao para a interface', () => {
    expect(edge).toContain('Você não tem permissão para criar empresas.');
    expect(edge).not.toContain('Forbidden: requires super_admin role');
    expect(edge).not.toContain("{ error: 'Unauthorized' }");
  });

  it('mantem detalhes tecnicos apenas no log da edge', () => {
    expect(edge).toContain("console.error('create-company error:', error)");
    expect(edge).toContain("{ error: 'Não foi possível criar a empresa. Tente novamente.' }");
    expect(edge).not.toContain('JSON.stringify({ error: message })');
    expect(edge).not.toContain("error: 'Missing required fields'");
  });

  it('le o corpo real do FunctionsHttpError pelo helper compartilhado', () => {
    expect(form).toContain('const edgeMessage = await getInvokeErrorMessage(error);');
    expect(form).not.toContain('JSON.parse(error.context.body)');
  });
});
